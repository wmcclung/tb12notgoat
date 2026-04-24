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

# Fallback for local docker-run where $PORT isn't injected by Railway.
ENV PORT=80
EXPOSE 3000 80
