# AgentTree Studio

AgentTree Studio is a separate web management application for the
[AgentTree](../Agenttree) Python framework. The current foundation provides a
FastAPI integration boundary, encrypted secret storage, provider connections
with live model discovery, versioned reusable Tree runtimes, and a React
administration workflow. Every invocation creates an independent Run with its
own input, result, trace, and Result Delivery outcomes.

## First Tree Run

After signing in, the **Welcome** dialog introduces the Agent hierarchy. Start
the dedicated **Getting Started** tutorial, or continue to the Dashboard with
its compact progress card. Welcome can be snoozed for a session, today, or
3/7/14 days; Getting Started always remains available in the sidebar.
The tutorial explains the workflow before Provider setup, then guides Tree
creation, explicit Tree selection, configuration, running and Connect.
Progress uses real Provider, Tree readiness and Run state; no API Key is
required to finish the guide. See the
[Getting Started guide](docs/getting-started.md) for permissions and progress rules.

## Architecture

```text
React + TypeScript (Vite)
          ↓ /api
FastAPI Studio backend
    ↓ services/repositories
SQLAlchemy (SQLite for direct local development; PostgreSQL in Docker)
          ↓ import
AgentTree Python package (one runtime context per Run)
```

AgentTree remains an external package. No core source is copied into this
repository, and Studio-specific code must stay here.

For Railway preparation and service settings, see [the Railway deployment
guide](docs/railway-deployment.md) and [deployment audit](docs/railway-deployment-audit.md).
Docker builds install the immutable AgentTree Core 0.2.2 commit pinned in
`requirements-docker.txt`; no sibling Core checkout is required.

## Quick Start with Docker

Docker Compose starts PostgreSQL, the FastAPI backend, and the Vite frontend.
Docker with the Compose plugin is required; no local Python, Node, or PostgreSQL installation is needed. The
initial image build needs internet access for package dependencies.

```bash
cp .env.example .env
docker compose up -d
docker compose ps
```

Wait for `postgres`, `backend`, and `frontend` to report healthy, then open
<http://localhost:5173>. The backend API and documentation are at
<http://localhost:8000> and <http://localhost:8000/docs>. Host ports are
published on all host interfaces for trusted LAN access and can be changed
with `FRONTEND_PORT` and `BACKEND_PORT` in `.env`. PostgreSQL is not published
to the host.

### Access from another device on a trusted LAN

Find the Studio host's current IPv4 address with `hostname -I` (choose the
address of the interface on your LAN, not a Docker or VM interface). With
Docker Compose running, open `http://<AGENTTREE_HOST_IP>:5173` from a device
that can reach that host; for example, `http://192.168.1.50:5173`. Local
`http://localhost:5173` and `http://127.0.0.1:5173` still work. Browser API
calls stay same-origin at `/api/...` and are proxied inside Docker to the
backend. Direct API clients can use `http://<AGENTTREE_HOST_IP>:8000` with
the existing authentication and authorization rules; no anonymous access is
granted. PostgreSQL and the encryption-key volume remain private.

Allow inbound TCP 5173 on the host firewall for the UI, and TCP 8000 only if
direct LAN API access is needed. For example, on a host using UFW, review
your network policy before using `sudo ufw allow 5173/tcp` or
`sudo ufw allow 8000/tcp`. Docker port publishing and host firewalls may
interact differently by platform; verify rules from another LAN device.
Do not disable the firewall. Only expose Studio on trusted/private networks:
HTTP LAN traffic is not encrypted. Change the one-time `admin/admin` password
immediately on fresh installs, and use HTTPS with
`AGENTTREE_STUDIO_SECURE_COOKIES=true` for deployment beyond a trusted LAN.
Secure cookies intentionally do not work over ordinary LAN HTTP.

Studio requires sign-in. On a **genuinely fresh database**, the Primary
Administrator starts as `admin` / `admin` and must change that bootstrap
password before accessing Studio. Set `AGENTTREE_STUDIO_ADMIN_USERNAME` and
`AGENTTREE_STUDIO_ADMIN_PASSWORD` before first start to override the initial
credentials; a custom password must contain at least 12 characters. Existing
Admin passwords are never reset by changing these values or restarting Docker.
The migration promotes the existing `admin` account (or the oldest Admin if
renamed) to Primary Administrator without changing its password. The Primary
Administrator cannot be deleted, deactivated, or demoted. Admins create other
accounts from **Users**; new normal Users must change their temporary password.
Older installations may still have a `bootstrap-admin-password` file in
`studio_key`; it is a legacy artifact, not a reset mechanism, and may no
longer match the Admin's current password.

The frontend sends `/api` requests to its own origin. Vite proxies them to
`http://backend:8000` inside the Compose network, so the browser never needs
to resolve a Docker service name. Direct local development retains its proxy
to `http://127.0.0.1:8000`. The backend connects to `postgres:5432` with
`psycopg`. Its entrypoint runs `alembic upgrade head` before Uvicorn starts;
migration failures stop startup. PostgreSQL readiness gates backend startup,
and backend health gates frontend startup.

Useful commands:

```bash
docker compose ps
docker compose logs -f
docker compose logs -f backend
docker compose restart backend
docker compose up -d --build
docker compose down
```

`docker compose down` keeps the named `postgres_data` and `studio_key` volumes.
`docker compose down -v` **deletes both volumes**, including all Docker
PostgreSQL data and any auto-generated encryption key. Back up both volumes
together. If `AGENTTREE_STUDIO_ENCRYPTION_KEY` is blank, the backend generates
a random Fernet key once in `studio_key`, then reuses it after restart or
down/up. You may instead set a stable Fernet key in `.env` before creating
Secrets. Changing or losing the key after Secrets have been stored makes
those credentials impossible to decrypt. Change the development-only
`POSTGRES_PASSWORD` before exposing this deployment beyond your machine;
use URL-safe characters because Compose builds the SQLAlchemy URL from it.
After the first PostgreSQL initialization, changing `POSTGRES_PASSWORD` in
`.env` alone does not change the existing database user's password.

Docker starts a **new PostgreSQL database**; existing
`agenttree_studio.db` SQLite data is not copied or modified. Schema migration
is automatic, but SQLite-to-PostgreSQL data migration is not provided.

MCP stdio commands run **inside the backend container**. That image includes
Python, Node, npm, and npx; a Filesystem MCP configuration can use
`npx -y @modelcontextprotocol/server-filesystem /workspace` if the container
can reach the npm registry. Only this project's `./workspace` directory is
mounted at `/workspace`; the host root and home directory are not shared.
Other stdio executables, packages, and paths must exist inside the container.
Streamable HTTP MCP connections remain supported, but their server URLs must
be reachable from the backend container (not merely from the host).

The Docker image installs dependency extras from the immutable Core 0.2.2 Git
commit pinned in `requirements-docker.txt`. It builds from this repository
alone, including in Railway.
If Docker reports that it cannot connect to `/var/run/docker.sock`, start the
Docker daemon before running Compose.

## Prerequisites for direct local development

- Python 3.10 or newer
- Node.js 20.19+ or 22.12+ (the local environment currently uses Node 24)
- The AgentTree repository checked out beside this project at `../Agenttree`

## Backend setup

From the Studio project root:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env
# Generate a key and paste it after AGENTTREE_STUDIO_ENCRYPTION_KEY= in .env
.venv/bin/python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# Optional: set AGENTTREE_STUDIO_ADMIN_PASSWORD in .env to a unique 12+ character
# value before first start. Otherwise the fresh bootstrap is admin/admin and
# requires an immediate password change.
uvicorn backend.main:app --reload --env-file .env
```

Set `AGENTTREE_STUDIO_DATABASE_URL` to override the default
`sqlite:///agenttree_studio.db` connection. Apply the versioned schema with:

```bash
.venv/bin/alembic upgrade head
```

Startup also upgrades to `head`. The baseline adopts existing unversioned local
databases without deleting rows, then applies Destination, invocation, and
authentication schema changes. `create_all()` remains useful only for isolated tests.

The `requirements.txt` file installs `../Agenttree` as an editable local Python
dependency. If Studio dependencies are already installed, refresh just the core
link with:

```bash
python -m pip install -e '/home/fluke/Agenttree[providers,mcp]'
```

The API is served at <http://127.0.0.1:8000>, Swagger UI at
<http://127.0.0.1:8000/docs>, and the health endpoint at
<http://127.0.0.1:8000/api/health>.

Run backend checks with:

```bash
.venv/bin/python -m pytest -q
```

SQLite defaults to `agenttree_studio.db`. The database stores secrets,
provider connections, discovered provider models, Trees, Tree versions, Agent
configurations, input/output settings, Tool connections, Tool assignments,
Runs, and Core-emitted Trace Events.

Keep the generated encryption key stable. Changing or losing it makes existing
secrets unreadable. `.env` and database files are ignored by Git; never commit
a real key. Raw secret values are encrypted with Fernet before persistence and
are never returned by normal API responses.

## Frontend setup

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api` requests to the local backend
at `http://127.0.0.1:8000`.

Create a production bundle with:

```bash
cd frontend
npm run build
```

## Current scope

Implemented:

- Live backend and AgentTree package status
- Explicit local-development CORS origins
- SQLite/SQLAlchemy persistence for secrets, provider connections, and models
- Fernet-encrypted secret storage with masked API responses
- OpenAI, Gemini, Ollama, Groq, OpenRouter, Cerebras, and custom OpenAI-compatible connection testing and model discovery
- Functional Providers and Secrets administration pages
- Six-step Create Tree wizard focused on Agents, routing, and Tools
- Version 1 Tree persistence for Root, Managers, and Specialists
- Capability, provider, discovered-model, trigger, output, and reference validation
- Description-driven AI capability suggestions with explicit user selection
- Searchable capability catalog aggregated from saved Agent configurations
- Tree list and detail pages with Overview, Agents, Tools, Connect, Runs,
  Versions, and Settings tabs
- Compact, keyboard-operable Agent hierarchy with an in-place detail drawer
- Blank Tree template inspection and Create Tree entry point
- Synchronous Test Run through AgentTree Core's public `AgentTree.run(Task)` API
- Runtime provider resolution for all supported provider types with in-memory-only
  secret decryption and per-agent model binding
- Persisted Run history, final output/state snapshots, and genuine Core trace events
- Generic JSON Test Run input, optional legacy-friendly form mode, delivery
  outcomes, Run Detail, and trace timeline UI
- Recommended asynchronous Public API V2 and synchronous Public API V1,
  with deployment-aware cURL/Python/JavaScript examples in Tree → Connect
- Authenticated incoming Webhook Triggers using separate secrets and the existing
  Run coordinator, with creation, rotation, enable/disable, and deletion
- Store in Studio, API Response, and generic Webhook Result Destinations with
  Secret-backed authentication and independently persisted outcomes
- Tree, Run, and Destination repository contracts plus a lightweight Unit of Work
- Executable HTTP API Tools with JSON Schema inputs, templated URL/query values,
  explicit timeouts, Secret-backed headers, and structured results
- MCP stdio and Streamable HTTP connections using AgentTree Core transports,
  live discovery, explicit per-tool import, and manual test execution
- Root, Manager, and Specialist Tool assignments backed by Core `ToolRegistry`,
  `ToolBindingRegistry`, and `ToolExecutor`
- Functional Tools page plus executable-Tool selection in Tree Wizard step 5
- Core-owned ToolSession execution for Root, Manager, and Specialist Agents,
  with explicit bindings and Core-enforced limits
- Routed desktop-first admin shell with light and dark themes
- Placeholder pages for remaining planned resource and settings areas

### Provider discovery behavior

- **OpenAI:** calls `GET /models` using the saved API key. The API does not
  publish reliable generation-capability metadata for every returned model, so
  Studio stores the returned catalog without guessing which entries are usable
  for a particular agent workflow.
- **Gemini:** calls the Generative Language models endpoint and retains models
  that explicitly advertise `generateContent` support.
- **Ollama:** calls the configured server's `/api/tags` endpoint. No secret is
  required; the default base URL is `http://localhost:11434`.

Discovery is implemented in Studio because AgentTree Core's provider adapters
currently expose generation but not model enumeration or health checks. Future
agent records should store only `provider_connection_id` and `model_id`.

### Tree draft behavior

- Creating a Tree creates draft version 1; saving replaces the active draft
  configuration atomically.
- Readiness validation enforces one Root, at least one Manager, at least one
  Specialist per Manager, capabilities, connected provider/model references,
  and valid Tool bindings. Integration settings are not readiness requirements.
- A valid draft can be marked `ready`. Ready versions are protected from direct
  draft edits. `PUT /api/trees/{tree_id}/configuration` validates a replacement
  and atomically creates a new Ready version, retaining the previous version;
  invalid changes roll back without altering the active Tree. Publishing is not
  implemented.
- The persisted `template` field currently has one supported built-in value,
  `blank`. The Templates page inspects and starts that workflow; it does not
  overwrite an existing Tree. No independent Blocks route, API, database model,
  or documented Block contract exists in this repository yet.
- Existing TriggerConfig, OutputConfig, and Manual Form records remain readable
  and round-trip when older Trees are edited. New Trees do not require them.
- Tool assignments bind enabled, connected HTTP or selected MCP Tools to
  Specialist Agents. Root and Manager Tool bindings are intentionally rejected
  because the current Core permission API accepts Specialists.

### Test Run behavior

- Test Run and API invocation validate the stored hierarchy and runtime
  references, then accept any JSON object as the Case/Task input.
- Studio builds public Core `RootAgent`, `ManagerAgent`, and `SpecialistAgent`
  objects, provider-backed Core decision strategies, the `ProviderRegistry`, and
  Specialist provider bindings. Core retains capability-based Manager and
  Specialist routing and owns the complete five-phase workflow.
- Runs execute synchronously. A Run transitions through `pending` and `running`
  before ending as `completed` or `failed`; the UI disables duplicate submission
  while the request is active.
- JSON Input is the default Test Run mode. A stored legacy Manual Form enables
  an optional friendly form without constraining API callers.
- Text output displays accepted Specialist output; structured JSON preserves
  Core's final content. Studio retains configured delivery metadata while always
  showing Test Run output for debugging.
- Core orchestration and Tool events are copied from real `ExecutionTrace`
  instances. Studio's Tool-loop decisions, observations, completion, and limit
  events use an explicit `studio.*` namespace. Errors use safe messages, and
  decrypted credentials are redacted before persistence.

### Tool behavior

- HTTP API connections become Studio `BaseTool` adapters and execute through
  Core `ToolExecutor`. GET/DELETE/HEAD send unused arguments as query values;
  other methods send them as JSON. Responses can be decoded as JSON or text.
- MCP supports only the transports publicly supplied by Core: stdio and
  Streamable HTTP. Discovery persists the server-returned name, description,
  input schema, and metadata; users explicitly select which discovered Tools
  are registered at runtime.
- Tool credentials reference the existing encrypted Secret store. Sensitive
  header, environment, and query values must use `{{secret}}`; decrypted values
  exist only in runtime memory and are redacted from results and errors.
- Manual Test Execute constructs a temporary Specialist binding and calls the
  real Core `ToolExecutor`, returning genuine Core tool trace events without
  mixing them into Tree Run history.
- Runtime construction registers executable Tools, applies persisted
  Agent bindings, and opens MCP clients for the runtime lifetime. Test Run
  closes all MCP resources afterward.
- Core `ToolSession` handles model-directed Tool use for every Agent role.
  Studio supplies executable Tool adapters and explicit per-Agent bindings;
  Core authorizes calls and enforces the Root-configured round/call budgets.
- Older Tree versions may retain Specialist autonomous-loop settings for
  compatibility. New Tree configuration uses Core `ToolSession` instead.
  HTTP/MCP transport timeouts remain the hard per-call network limits.
- Root routing, Manager review, Root final review, and capability selection
  remain Core-owned.

### Capability suggestions

Every Root, Manager, and Specialist form uses the same Capability Selector.
Users describe an Agent naturally, select a connected provider and discovered
model, and can request 3–6 structured suggestions. Studio invokes AgentTree's
configured supported provider adapter, validates the JSON response,
and normalizes identifiers such as `Network Analysis` or `network_analysis` to
`network-analysis`.

Suggestions remain transient until a user explicitly adds them and saves the
Tree draft. Existing selected capabilities are never replaced automatically.
The searchable catalog is derived from capabilities already saved on
AgentConfigs; it contains no hardcoded domain catalog. Custom capability entry
remains available when AI is unavailable or unnecessary.

## Runtime and delivery model

A Tree is a reusable runtime definition, not a one-time form workflow. Every
invocation references one Tree version and owns a freshly built AgentTree
runtime, state, trace, and resource lifetime. Tools are available to Agents
during execution; Destinations run only after a successful final result.

Enabled Destinations execute independently. Store in Studio and API Response
are built-in defaults. A Webhook sends a generic Run/Tree/result/metadata POST
payload. Webhook failure records a sanitized failed delivery without changing a
successful AgentTree Run into a failed Run.

Execution remains synchronous. `RunExecutionBackend` currently uses
`SynchronousExecutionBackend`; no parallel or distributed execution is claimed.
The boundary prepares this later path without introducing it now:

```text
API → Job Queue → Worker Pool → per-Run execution → Result Destinations
```

Deferred by design: publishing, background workers, Redis/Celery,
A2A communication, provider fallback,
Discord/LINE-specific adapters, scheduling, and recursive agent creation.

## Accounts and Tree access

Studio uses Argon2id password hashes and a revocable, 12-hour server-side
session in an HttpOnly SameSite cookie. The cookie is marked Secure when the
request is HTTPS or `AGENTTREE_STUDIO_SECURE_COOKIES=true`. Logging out revokes
that session. Changing a password revokes other sessions and API keys;
deactivating an account blocks its existing sessions and keys immediately.

Admin has full access and cannot remove the last active Admin. Other users
receive independent permissions for Trees & Agents, Secrets, Providers &
Models, Tools & MCP, Execution / Live View, and Use Trees. Normal users need
both **Use Trees** and Tree Access. **Selected Trees** is the safe default and
uses explicit grants; **All Trees** is an Admin-selected rule covering current
and future Trees without creating individual grant rows. Existing users and
grants migrate to Selected Trees. Switching to All Trees retains the underlying
selections but makes them inactive; switching back immediately restores those
selections (which an Admin can edit). Turning off Use Trees denies invocation
even if grants or All Trees mode remain. Admins, including the Primary Admin,
always have full Tree access without grants. **Account → Tree Access** lists only
effectively accessible Trees; the bookmarked `/my-trees` URL redirects there.
**Account → API Keys** manages personal credentials. New key values are
shown once and stored only as SHA-256 hashes. Use these keys with recommended
asynchronous **Public API V2** or synchronous **Public API V1**. Every request
rechecks the account, current permissions, and Tree Access mode. Tree → Connect
links to this existing key manager and shows integration examples. The backend
retains its `api_tokens` table and `/api/auth/tokens` paths; the naming change
is user-facing and requires no migration. Administrators can review paginated,
filtered, metadata-only Security Events in the Studio UI.

## Live Runs

Open a Tree and choose **Live View** (`/trees/:treeId/live`). The page polls
`GET /api/trees/:treeId/live` every two seconds while visible. It reads the
persisted PostgreSQL/SQLite Run and TraceEvent records; the Inspector remains
available at `/runs/:runId` after an execution completes or fails. A Run is one
independent execution/input, not the lifetime of a Tree.

Studio live Runs and Public API V2 use the existing background coordinator and
AgentTree Core ExecutionRuntime, with incremental persisted events, SSE output,
cancellation, results, and artifacts. V1 remains synchronous. Each Run pins its
Tree version. A Tree definition has no separate persistent Start/Stop lifecycle.
Run records, durable events, results, and artifacts persist; active Core
executions are process local. On backend startup, interrupted active Runs are
marked failed with `RECOVERY_UNAVAILABLE`, rather than resumed. See
[live Run behavior](docs/live-view-v2.md) and [V2](docs/public-api-v2.md).

## Public API v1

External applications can use AgentTree Studio with only a backend Base URL and a personal Bearer API key. Generate a key at **Account → API Keys**, then use `GET /api/v1/me`, `GET /api/v1/trees`, `POST /api/v1/trees/{tree_id}/invoke`, and `GET /api/v1/runs/{run_id}`. Keys inherit **current** user permissions and Tree grants, not a permanent snapshot. See [Public API v1 contract](docs/public-api-v1.md) for curl/Python examples, security guidance, and the full response contract.

## External integrations

Open a Ready Tree’s **Connect** tab. **Async API · Recommended** submits to
`POST /api/v2/runs` and supports progress, cancellation, results, and artifacts.
**Simple synchronous API** invokes `POST /api/v1/trees/{tree_id}/invoke` and waits
for the result. Both use personal API keys from **Account → API Keys**.

**Webhook Trigger** receives external events at `POST /api/webhooks/{webhook_id}`
using a separate once-visible `athw_…` bearer secret, stored only as a hash. It
returns HTTP 202 and creates a normal asynchronous Run under its owner’s current
Tree access. Retries create separate Runs; deduplicate in the sender.
**Webhook Result Destination** sends completed results from AgentTree to an
external URL using the existing Secret-backed outgoing delivery service.
Legacy Tree webhook route metadata remains readable and does not authorize or
receive requests.

Connect uses `AGENTTREE_STUDIO_PUBLIC_ORIGIN` when configured, otherwise the
browser origin and its `/api` proxy. Set a public HTTPS origin for deployment;
internal Docker proxy targets are not shown as integration endpoints. See
[the integration guide](docs/external-integrations.md) for authentication,
payloads, response handling, and operational limits.
