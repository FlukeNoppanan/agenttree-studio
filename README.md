# AgentTree Studio

AgentTree Studio is a separate web management application for the
[AgentTree](../Agenttree) Python framework. The current foundation provides a
FastAPI integration boundary, encrypted secret storage, provider connections
with live model discovery, versioned Tree drafts, and a React administration
workflow, including synchronous Core-backed Test Runs, persisted results, and
real execution traces.

## Architecture

```text
React + TypeScript (Vite)
          ↓ /api
FastAPI Studio backend
          ↓ import
AgentTree Python package
```

AgentTree remains an external package. No core source is copied into this
repository, and Studio-specific code must stay here.

## Prerequisites

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
uvicorn backend.main:app --reload --env-file .env
```

The `requirements.txt` file installs `../Agenttree` as an editable local Python
dependency. If Studio dependencies are already installed, refresh just the core
link with:

```bash
python -m pip install -e /home/fluke/Agenttree
```

The API is served at <http://127.0.0.1:8000>, Swagger UI at
<http://127.0.0.1:8000/docs>, and the health endpoint at
<http://127.0.0.1:8000/api/health>.

Run backend checks with:

```bash
.venv/bin/python -m pytest -q
```

SQLite is initialized at `agenttree_studio.db`. The database stores secrets,
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
- OpenAI, Gemini, and Ollama connection testing and model discovery
- Functional Providers and Secrets administration pages
- Eight-step Create Tree wizard with draft save and resume
- Version 1 Tree persistence for Root, Managers, and Specialists
- Capability, provider, discovered-model, trigger, output, and reference validation
- Description-driven AI capability suggestions with explicit user selection
- Searchable capability catalog aggregated from saved Agent configurations
- Tree list and detail pages with Overview, Agents, Tools, Input/Output, Runs,
  Versions, and Settings tabs
- Synchronous Test Run through AgentTree Core's public `AgentTree.run(Task)` API
- Runtime provider resolution for OpenAI, Gemini, and Ollama with in-memory-only
  secret decryption and per-agent model binding
- Persisted Run history, final output/state snapshots, and genuine Core trace events
- Manual Form and webhook JSON Test Run inputs, Run Detail, and trace timeline UI
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
  and configured input/output.
- A valid draft can be marked `ready`. Ready versions are protected from direct
  draft edits. Publishing is not implemented.
- Manual Form and webhook trigger configuration are persisted. Webhook routes
  are reserved as `/api/trees/{tree_id}/webhook`, but they do not execute Trees.
- Tool assignments are persisted against a minimal Tool catalog. Tool creation,
  MCP setup, and invocation remain part of a later Tools phase.

### Test Run behavior

- Test Run validates the stored hierarchy, provider/model availability, trigger,
  input, and output before execution.
- Studio builds public Core `RootAgent`, `ManagerAgent`, and `SpecialistAgent`
  objects, provider-backed Core decision strategies, the `ProviderRegistry`, and
  Specialist provider bindings. Core retains capability-based Manager and
  Specialist routing and owns the complete five-phase workflow.
- Runs execute synchronously. A Run transitions through `pending` and `running`
  before ending as `completed` or `failed`; the UI disables duplicate submission
  while the request is active.
- Manual Form text, textarea, number, and select fields are supported. File
  fields are explicitly shown as unsupported because no safe upload pipeline is
  configured. Webhook Test Run accepts a JSON object.
- Text output displays accepted Specialist output; structured JSON preserves
  Core's final content. Studio retains configured delivery metadata while always
  showing Test Run output for debugging.
- Trace Events are copied only from Core's `ExecutionTrace`; Studio does not
  fabricate routing or execution events. Errors use safe codes and messages,
  and decrypted credentials are redacted before persistence.

ToolConnection currently stores catalog/configuration metadata only. It cannot
be converted into Core `BaseTool` instances without an executable callable or
MCP transport definition, so Test Run does not register or invoke these tools.
Core also does not autonomously select tools during `AgentTree.run()`.

### Capability suggestions

Every Root, Manager, and Specialist form uses the same Capability Selector.
Users describe an Agent naturally, select a connected provider and discovered
model, and can request 3–6 structured suggestions. Studio invokes AgentTree's
public OpenAI, Gemini, or Ollama provider adapter, validates the JSON response,
and normalizes identifiers such as `Network Analysis` or `network_analysis` to
`network-analysis`.

Suggestions remain transient until a user explicitly adds them and saves the
Tree draft. Existing selected capabilities are never replaced automatically.
The searchable catalog is derived from capabilities already saved on
AgentConfigs; it contains no hardcoded domain catalog. Custom capability entry
remains available when AI is unavailable or unnecessary.

Deferred by design: executable Tool/MCP management, publishing, webhook delivery,
background/distributed execution, authentication, multi-user support, A2A
communication, provider fallback, and autonomous tool planning.

SQLite schema changes currently rely on `create_all`. This is sufficient for the
new Run and Trace Event tables, but Alembic should be introduced before future
changes need to alter existing columns in deployed databases.
