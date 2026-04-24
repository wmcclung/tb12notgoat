FROM nginx:alpine

# Static site — everything in the repo root is served directly.
COPY . /usr/share/nginx/html

# Strip build-time artifacts from the served directory (they'd be
# publicly reachable otherwise and have no business being served).
RUN rm -f /usr/share/nginx/html/Dockerfile \
          /usr/share/nginx/html/default.conf.template \
          /usr/share/nginx/html/.gitignore \
          /usr/share/nginx/html/.dockerignore

# nginx config lists both ports (80 + 3000) so whichever Railway's
# edge actually routes to, nginx answers. The template is copied into
# /etc/nginx/templates so docker-entrypoint's envsubst step runs (it
# still works fine even though this version has no ${VAR} placeholders
# — keeps parity with the build stage nginx:alpine expects).
COPY default.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 80 3000
