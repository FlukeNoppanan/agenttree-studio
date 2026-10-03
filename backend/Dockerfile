FROM node:24-bookworm-slim AS node-runtime

FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app

# Node/npm/npx support existing stdio MCP configurations such as the Filesystem server.
RUN apt-get update \
    && apt-get install --no-install-recommends -y git ca-certificates libstdc++6 libatomic1 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=node-runtime /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

WORKDIR /app
COPY requirements-base.txt requirements-docker.txt ./
RUN pip install -r requirements-docker.txt
# Install the separate sibling framework package for local runtime certification.
# No Core implementation is copied into Studio source or vendored into its repo.
COPY --from=agenttree_core /pyproject.toml /README.md /tmp/agenttree-core/
COPY --from=agenttree_core /src /tmp/agenttree-core/src
RUN pip install --no-deps /tmp/agenttree-core && rm -rf /tmp/agenttree-core
COPY alembic.ini ./
COPY alembic ./alembic
COPY backend ./backend
COPY backend/docker-entrypoint.sh /usr/local/bin/studio-entrypoint
RUN chmod 755 /usr/local/bin/studio-entrypoint \
    && mkdir -p /workspace /var/lib/agenttree-studio

EXPOSE 8000
ENTRYPOINT ["studio-entrypoint"]
