FROM nginx:alpine

# Static site — everything in the repo root is served directly.
COPY . /usr/share/nginx/html

# Strip build-time artifacts from the served directory (they'd be
# publicly reachable otherwise and have no business being served).
RUN rm -f /usr/share/nginx/html/Dockerfile \
          /usr/share/nginx/html/.gitignore \
          /usr/share/nginx/html/.dockerignore

# Listen on the default nginx port; Railway's edge proxy routes to 80.
EXPOSE 80
