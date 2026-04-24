FROM nginx:alpine

# Static site — everything in the repo root is served directly.
COPY . /usr/share/nginx/html

# Strip build-time artifacts from the served directory (they'd be
# publicly reachable otherwise and have no business being served).
RUN rm -f /usr/share/nginx/html/Dockerfile \
          /usr/share/nginx/html/default.conf.template \
          /usr/share/nginx/html/.gitignore \
          /usr/share/nginx/html/.dockerignore

# nginx:alpine's entrypoint runs envsubst on templates/ at startup,
# writing the resolved config to conf.d/. That lets us pick up whatever
# $PORT Railway decides to route to — so a change to the port mapping
# in Railway's UI (currently 3000 for the custom-domain flag) doesn't
# require a code change to match.
COPY default.conf.template /etc/nginx/templates/default.conf.template

# Default matches Railway's current edge routing for www.tb12notgoat.com.
# If Railway does inject $PORT at runtime it overrides this; if not, we
# still land on the right port. Previously defaulted to 80 which Railway
# wasn't routing to, producing a 502 even though nginx was up.
ENV PORT=3000
EXPOSE 3000
