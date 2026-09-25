#!/bin/sh
set -eu

# Keep a generated key in its own named volume if no explicit key was supplied.
# This file is never logged, baked into the image, or regenerated on restart.
if [ -z "${AGENTTREE_STUDIO_ENCRYPTION_KEY:-}" ]; then
    key_file=/var/lib/agenttree-studio/encryption.key
    if [ ! -s "$key_file" ]; then
        umask 077
        python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())' > "$key_file"
    fi
    export AGENTTREE_STUDIO_ENCRYPTION_KEY="$(head -n 1 "$key_file")"
fi

# Fresh databases use admin/admin for the first bootstrap; existing accounts
# are never reset by these environment values.
export AGENTTREE_STUDIO_ADMIN_USERNAME="${AGENTTREE_STUDIO_ADMIN_USERNAME:-admin}"
export AGENTTREE_STUDIO_ADMIN_PASSWORD="${AGENTTREE_STUDIO_ADMIN_PASSWORD:-admin}"

# A migration error exits the container. FastAPI's startup check also applies
# migrations for direct local runs, where this entrypoint is not used.
alembic upgrade head
exec uvicorn backend.main:app --host 0.0.0.0 --port 8000
