FROM node:20-alpine

WORKDIR /app

# Install production deps first so layer caches independently of source changes
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

# Copy the rest of the repo (static site + server.js)
COPY . .

# Railway injects $PORT; server.js defaults to 3000 locally
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
