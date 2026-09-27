# Railway deployment audit

## Current execution and packaging

Both the Compose and Railway backend Dockerfiles install AgentTree Core 0.2.2 from immutable commit `1f9649e4f9c10bc38defdf1e3fef70bebf95df99`. Neither Dockerfile nor Compose uses a sibling checkout or vendors Core source. The earlier `cdf1045c...` pin lacked required runtime and provider classes; it has been replaced.

## Configuration and state

| Area | Audit | Preparation |
| --- | --- | --- |
| Database | `AGENTTREE_STUDIO_DATABASE_URL` previously fell back to SQLite. | `DATABASE_URL` is accepted and PostgreSQL URLs use the installed psycopg 3 driver. Railway mode requires a database URL. |
| Migrations | Entrypoint and FastAPI startup both run `alembic upgrade head`; repeat upgrades are idempotent. | Retain migration before serving; never reset tables. Deploy one backend replica while using this startup scheme. |
| Encrypted Secrets | Local Compose can generate a key in its named volume. | Railway mode requires a stable explicit `AGENTTREE_STUDIO_ENCRYPTION_KEY`; no generated key. Back it up separately. |
| First Admin | Local fresh DB defaults to `admin/admin` and forces password change. | Railway mode requires explicit username and a unique password; existing accounts are not reset. |
| Cookies and CSRF | Cookie is HttpOnly/SameSite=Lax; secure flag configurable. Session writes check Origin/Fetch-Site. | Railway mode requires secure cookies and an HTTPS `AGENTTREE_STUDIO_PUBLIC_ORIGIN`, which is added to the exact CSRF origin set. No credentialed wildcard CORS. |
| Frontend | Compose runs Vite development server with `/api` proxy. | Railway frontend builds static assets and serves them through Nginx, proxying `/api` to the private backend. Browser uses same-origin HTTPS. |
| SSE | Studio emits SSE; the Vite proxy was development-only. | Nginx disables response buffering and extends read timeout for `/api`. Connection handling still depends on Railway's ingress behavior and needs a deployed smoke test. |
| Artifacts | Core `FileArtifactStore` uses `AGENTTREE_STUDIO_ARTIFACT_ROOT` and validates bodies by hash on fetch. | Railway mode requires a mounted `/data/artifacts` volume. Keep PostgreSQL and volume backups together. |
| Health | `/api/system-health` checks Core import, DB, migration revision without provider network calls. | Use it as the backend healthcheck after immutable Core release. |
| Public API V1/V2 | Bearer APIs are backend routes; optional CORS allowlist is separate from Studio cookie CORS. | Keep backend private for browser-only testing; give it a public domain only when an external API consumer needs one. |

## Final local gate

- A clean `backend/Dockerfile.railway` build from Studio alone installed Core 0.2.2. `import backend.main` and the required provider, execution, ToolSession, and artifact imports passed inside that image.
- The production frontend image built. An isolated three-service stack with PostgreSQL, backend, and frontend started healthy. Alembic CLI reported PostgreSQL at `0009_public_api_v2 (head)`. The first smoke exposed a SQLite CLI migration caused by ignoring Railway `DATABASE_URL`; `alembic/env.py` now uses that URL while retaining explicit migration-test URLs.
- Through the production Nginx proxy, health, login, protected provider/Tree APIs, exact-origin CSRF protection, and logout passed. A headless browser rendered the login page. The configured `Secure`, `HttpOnly`, and `SameSite=Lax` cookie attributes were checked. No live provider credential or real Tree Run was used.
- Deterministic V2 SSE and artifact tests passed inside the clean backend image. Artifact write, hash-checked read, and read after backend restart passed on an isolated Docker volume. Missing Railway encryption configuration stopped startup before migrations.
- Full local regression: 162 backend tests and 79 frontend tests passed; TypeScript/production build, Python compile, diff check, and Compose configuration passed.

Actual Railway ingress SSE behavior and a provider-backed Run still require post-deployment smoke testing. The isolated local stack used temporary project-scoped volumes and did not touch existing Studio data.

No Railway resources or external account settings were changed by this preparation.
