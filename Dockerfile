FROM nginx:alpine

# Static site — everything in the repo root is served directly.
COPY . /usr/share/nginx/html

# Remove build-time artifacts from the served directory (they'd be
# publicly reachable otherwise and have no business being served).
RUN rm -f /usr/share/nginx/html/Dockerfile \
          /usr/share/nginx/html/default.conf.template \
          /usr/share/nginx/html/.gitignore \
          /usr/share/nginx/html/.dockerignore

# Template consumed by nginx:alpine's docker-entrypoint.sh at startup
# to bind the server to Railway's dynamic $PORT env var.
COPY default.conf.template /etc/nginx/templates/default.conf.template

# Sensible fallback so the image also boots locally without PORT set.
ENV PORT=8080
EXPOSE 8080
