#!/bin/sh
set -eu
: "${BACKEND_INTERNAL_URL:?Set BACKEND_INTERNAL_URL to the private backend origin}"
export PORT="${PORT:-8080}"
case "$PORT" in *[!0-9]*|'') echo 'PORT must be numeric' >&2; exit 1;; esac
case "$BACKEND_INTERNAL_URL" in
    http://*.railway.internal:*|http://backend:*) ;;
    *) echo 'BACKEND_INTERNAL_URL must use the private backend host' >&2; exit 1;;
esac
envsubst '${PORT} ${BACKEND_INTERNAL_URL}' \
    < /opt/studio.conf.template \
    > /etc/nginx/conf.d/studio.conf
exec nginx -g 'daemon off;'
