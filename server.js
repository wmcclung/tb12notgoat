/* Tom Brady Is Not The GOAT — single-service Node backend.
   Serves the static site (HTML, Assets/, puppet riv files) AND
   provides /api/vote + /api/votes endpoints backed by Postgres.
   Connects via DATABASE_URL (Railway auto-injects this when the
   Postgres service is linked in Variables). */

const express = require('express');
const path    = require('path');
const { Pool } = require('pg');

const app = express();
/* Force port 3000 to match the custom domain mapping (www.tb12notgoat.com
   → Port 3000, set manually in Railway Networking for security-flag
   compliance). Railway's automatic $PORT injection would otherwise have
   Node listen on a different port and Railway's edge would 502. */
const PORT = 3000;

/* Known player ids — reject anything else at the API boundary so we
   never write garbage rows to the votes table. Keep in sync with the
   vote UI in index.html. */
const ALLOWED = ['brady', 'rivers', 'alexander', 'payton', 'page'];

/* Postgres pool. ssl:{rejectUnauthorized:false} is required for
   Railway's managed Postgres — they use a self-signed cert internally
   but the private network is trusted. Only create the pool if the env
   var is present so the app still boots without Postgres configured
   (API returns 503 in that state; static site serves fine). */
let pool = null;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  /* Ensure the votes table exists on first boot. Runs every restart —
     CREATE IF NOT EXISTS is a no-op on subsequent deploys. */
  (async () => {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS votes (
          player_id  TEXT        PRIMARY KEY,
          count      INTEGER     NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      console.log('[tb12] votes table ready');
    } catch (err) {
      console.error('[tb12] table init failed:', err.message);
    }
  })();
} else {
  console.warn('[tb12] DATABASE_URL not set — /api endpoints will return 503 until configured');
}

/* ── Middleware ── */
app.use(express.json({ limit: '2kb' })); // vote payloads are tiny; cap to block abuse

/* Prevent Fastly / Railway's edge CDN from caching the vote API —
   without explicit no-cache headers the edge serves stale JSON for
   up to the default TTL, which showed up as different clients
   seeing different totals (desktop cached at 2 while mobile saw 10).
   Applies only to /api/* — static assets keep their long cache below. */
app.use('/api', function(req, res, next) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

/* Light rate limiting — one vote per IP per 2 seconds. Stops trivial
   hold-enter spam without requiring a full rate-limiter dep. Now logs
   429s explicitly so we can tell from Railway logs whether a missing
   vote was rate-limited (vs an actual DB miss). */
const lastVoteByIp = new Map();
function rateLimitVote(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'anon';
  const now = Date.now();
  const prev = lastVoteByIp.get(ip) || 0;
  if (now - prev < 2000) {
    console.warn('[tb12] vote RATE-LIMITED ip=' + ip + ' since=' + (now - prev) + 'ms');
    return res.status(429).json({ error: 'slow down' });
  }
  lastVoteByIp.set(ip, now);
  /* Occasional cleanup so the Map doesn't grow unbounded */
  if (lastVoteByIp.size > 5000) {
    const cutoff = now - 60_000;
    for (const [k, v] of lastVoteByIp) if (v < cutoff) lastVoteByIp.delete(k);
  }
  next();
}

/* ── API ── */

/* POST /api/vote — record one vote for player_id. Upserts the row.
   Logs every attempt with player + outcome so Railway logs make it easy
   to diagnose missing votes. (Earlier symptom: a real vote for a valid
   player landed on the results page showing 0 — the silent-fail loop
   the new logging closes.) */
app.post('/api/vote', rateLimitVote, async (req, res) => {
  const pid = req.body && req.body.player_id;
  if (!ALLOWED.includes(pid)) {
    console.warn('[tb12] vote REJECTED — invalid player_id:', JSON.stringify(pid));
    return res.status(400).json({ error: 'invalid player_id' });
  }
  if (!pool) {
    console.warn('[tb12] vote REJECTED — db not configured, pid=', pid);
    return res.status(503).json({ error: 'db not configured' });
  }
  try {
    const r = await pool.query(
      `INSERT INTO votes (player_id, count)
         VALUES ($1, 1)
         ON CONFLICT (player_id) DO UPDATE
           SET count = votes.count + 1, updated_at = now()
         RETURNING count`,
      [pid]
    );
    console.log('[tb12] vote OK pid=' + pid + ' newCount=' + r.rows[0].count);
    res.json({ ok: true, player_id: pid, count: r.rows[0].count });
  } catch (err) {
    console.error('[tb12] vote DB ERROR pid=' + pid + ' msg=' + err.message);
    res.status(500).json({ error: 'db error' });
  }
});

/* GET /api/votes — return counts for all known players. Missing
   rows fill in as 0 so the UI can always render all five. */
app.get('/api/votes', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'db not configured' });
  try {
    const r = await pool.query('SELECT player_id, count FROM votes');
    const out = {};
    ALLOWED.forEach(id => { out[id] = 0; });
    r.rows.forEach(row => { out[row.player_id] = row.count; });
    res.json(out);
  } catch (err) {
    console.error('[tb12] votes error:', err.message);
    res.status(500).json({ error: 'db error' });
  }
});

/* ── Static site ── */
app.use(express.static(__dirname, {
  extensions: ['html'],
  setHeaders: (res, filePath) => {
    /* Long cache for the unchanged art + puppet data. HTML stays no-cache
       so deploy rollouts are reflected on refresh. */
    if (/\.(riv|png|jpg|jpeg|svg|webp|gif|woff2?|ico)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    } else if (/\.html$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  },
}));

/* Fallback → index.html for any un-matched route (so typos / deep links
   don't 404, they land on the app). */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[tb12] server listening on :${PORT}`);
});
