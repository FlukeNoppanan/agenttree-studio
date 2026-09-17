# AgentTree Studio

AgentTree Studio is a separate web management application for the
[AgentTree](../Agenttree) Python framework. The current foundation provides a
FastAPI integration boundary, encrypted secret storage, provider connections
with live model discovery, versioned reusable Tree runtimes, and a React
administration workflow. Every invocation creates an independent Run with its
own input, result, trace, and Result Delivery outcomes.

## Architecture

```text
React + TypeScript (Vite)
          ↓ /api
FastAPI Studio backend
    ↓ services/repositories
SQLAlchemy (SQLite by default; configurable for future PostgreSQL)
          ↓ import
AgentTree Python package (one runtime context per Run)
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

Set `AGENTTREE_STUDIO_DATABASE_URL` to override the default
`sqlite:///agenttree_studio.db` connection. Apply the versioned schema with:

```bash
.venv/bin/alembic upgrade head
```

Startup also upgrades to `head`. The baseline adopts existing unversioned local
databases without deleting rows, then applies Destination and invocation schema
changes. `create_all()` remains useful only for isolated tests.

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
- OpenAI, Gemini, and Ollama connection testing and model discovery
- Functional Providers and Secrets administration pages
- Six-step Create Tree wizard focused on Agents, routing, and Tools
- Version 1 Tree persistence for Root, Managers, and Specialists
- Capability, provider, discovered-model, trigger, output, and reference validation
- Description-driven AI capability suggestions with explicit user selection
- Searchable capability catalog aggregated from saved Agent configurations
- Tree list and detail pages with Overview, Agents, Tools, Connect, Runs,
  Versions, and Settings tabs
- Synchronous Test Run through AgentTree Core's public `AgentTree.run(Task)` API
- Runtime provider resolution for OpenAI, Gemini, and Ollama with in-memory-only
  secret decryption and per-agent model binding
- Persisted Run history, final output/state snapshots, and genuine Core trace events
- Generic JSON Test Run input, optional legacy-friendly form mode, delivery
  outcomes, Run Detail, and trace timeline UI
- Stable `POST /api/runtime/trees/{tree_id}/invoke` API with generic `input` and
  optional caller `metadata`
- Store in Studio, API Response, and generic Webhook Result Destinations with
  Secret-backed authentication and independently persisted outcomes
- Tree, Run, and Destination repository contracts plus a lightweight Unit of Work
- Executable HTTP API Tools with JSON Schema inputs, templated URL/query values,
  explicit timeouts, Secret-backed headers, and structured results
- MCP stdio and Streamable HTTP connections using AgentTree Core transports,
  live discovery, explicit per-tool import, and manual test execution
- Specialist-only Tool assignments backed by Core `ToolRegistry`,
  `ToolBindingRegistry`, and `ToolExecutor`
- Functional Tools page plus executable-Tool selection in Tree Wizard step 5
- Opt-in bounded autonomous Tool loops for Specialists, with structured model
  decisions, Core-enforced Tool execution, sanitized observations, and trace UI
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
  draft edits. Publishing is not implemented.
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
  Specialist bindings, and opens MCP clients for the runtime lifetime. Test Run
  closes all MCP resources afterward.
- Core does not autonomously select Tools itself. Studio injects a public
  `BaseSpecialistExecutor` strategy only when a Specialist opts in. Each model
  step must return strict JSON validated as a `ToolDecision`; every selected
  Tool is still authorized and invoked by Core `ToolExecutor`.
- The loop defaults to five iterations, five Tool calls, and a 60-second
  cooperative overall deadline. Settings are bounded to 10 iterations, 10
  calls, and 300 seconds. HTTP/MCP transport timeouts remain the hard per-call
  network limits. Observations are sanitized and truncated at 16,000 characters.
- Specialists without the opt-in setting follow the unchanged Core
  `ProviderSpecialistExecutor` path. Root routing, Manager review, Root final
  review, and capability selection remain Core-owned.

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
authentication, multi-user support, A2A communication, provider fallback,
Discord/LINE-specific adapters, scheduling, and recursive agent creation.
