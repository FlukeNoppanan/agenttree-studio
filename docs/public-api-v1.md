# AgentTree Studio Public API v1

Public API v1 lets an independent CLI, service, or browser application discover and synchronously invoke Trees using only a Base URL and a personal API key. It does not provide Studio administration, Provider/Secret access, streaming, files, or a Coding Playground.

Tree → Connect presents V1 as **Simple synchronous API**, alongside recommended
[Async API V2](public-api-v2.md). Both reuse **Account → API Keys**. The
[integration guide](external-integrations.md) distinguishes application calls,
incoming Webhook Triggers, and outgoing result destinations.

## Base URL and authentication

The Base URL is the backend origin, for example `http://localhost:8000` or your LAN backend address. Generate a personal key in **Account → API Keys**. The raw `ats_…` key is displayed once; only its SHA-256 digest is stored. Keep it outside source control and send it only over trusted HTTPS networks when deployed beyond local development.

```bash
export AGENTTREE_BASE_URL="http://localhost:8000"
export AGENTTREE_API_KEY="ats_your_once_displayed_key"
curl -H "Authorization: Bearer $AGENTTREE_API_KEY" "$AGENTTREE_BASE_URL/api/v1/me"
curl -H "Authorization: Bearer $AGENTTREE_API_KEY" "$AGENTTREE_BASE_URL/api/v1/trees"
curl -H "Authorization: Bearer $AGENTTREE_API_KEY" "$AGENTTREE_BASE_URL/api/v1/trees/<TREE_ID>"
curl -X POST -H "Authorization: Bearer $AGENTTREE_API_KEY" -H "Content-Type: application/json" \
  -d '{"input":"Create a FastAPI CRUD API for products.","metadata":{"client_request_id":"my-app-123"}}' \
  "$AGENTTREE_BASE_URL/api/v1/trees/<TREE_ID>/invoke"
curl -H "Authorization: Bearer $AGENTTREE_API_KEY" "$AGENTTREE_BASE_URL/api/v1/runs/<RUN_ID>"
```

`GET /api/v1/health` requires no key and returns `{"status":"ok","api_version":"v1"}`. The authenticated endpoints are `GET /me`, `GET /trees`, `GET /trees/{tree_id}`, `POST /trees/{tree_id}/invoke`, and `GET /runs/{run_id}` under `/api/v1`.

The OpenAPI document is at `/openapi.json` and interactive docs at `/docs`; endpoints are tagged **Public API v1**. Internal Studio endpoints remain in the same document under separate tags.

## Discovery and permissions

`GET /me` returns `id`, `username`, `is_admin`, and `tree_access` (`mode` and ready-Tree `count`). `GET /trees` returns `{"data":[...]}` containing only currently accessible, Ready Trees. Each Tree includes `id`, `name`, `description`, `status`, `version`, and `agent_count`. Tree detail also has `agents` counts by role. Draft Trees are not listed or inspectable. Configuration, hidden instructions, Provider credentials, and Secrets are not returned.

Keys use the account's **current** permissions and Tree grants on every request; grants are not copied into keys. Administrators follow existing Studio Admin semantics; ordinary users need `use_trees` and either All Trees mode or a Selected Trees grant. Removing a grant immediately removes the Tree from discovery, invocation, and Run retrieval. Inaccessible and nonexistent Tree/Run IDs both return 404.

## Invocation and Runs

The body requires a nonempty text `input` (at most 65,536 characters). The optional `metadata` object accepts only `client_request_id` (1–128 ASCII letters, digits, `.`, `_`, `:`, `-`). Unknown fields are rejected. No client field can overwrite server-owned metadata.

Invocation is synchronous. A 200 response contains `run_id`, `tree_id`, `tree_version`, `status`, `output` (`{"type":"text","content":"…"}` or `null`), and `execution` (`started_at`, `completed_at`, `duration_ms`). `GET /runs/{run_id}` adds the text `input`. The output text is serialized from the existing persisted Run output; structured JSON is rendered as JSON text. Runtime failures after a Run is created return the persisted Run with `status:"failed"` and a sanitized `error`; pre-run validation errors use 422. No asynchronous completion is implied.

Public invocations use the same `runs` and `trace_events` tables as Studio Runs, Live View, and Execution Inspector. V1 does not expose trace details or raw chain-of-thought. A successful external client can follow the returned Run ID without database access.

## Errors, request IDs, throttling

Errors have `{"error":{"code":"machine_readable_code","message":"Safe text","request_id":"req_…"}}`. `X-Request-ID` is present on V1 responses. A client-supplied ID is accepted only when it contains 1–64 ASCII letters, digits, `.`, `_`, `:`, or `-`; otherwise a server ID is generated. Statuses include 401 invalid/missing key, 404 inaccessible/not found, 409 not-ready Tree, 422 invalid request or Tree configuration, and 429 rate limit. Provider/runtime failures are serialized in a persisted failed Run with safe messages.

The process-local limiter allows 30 failed authentication attempts per peer per minute and 30 invocations per key per minute. Other clients behind a LAN proxy are not charged for a valid key's invocations. Counters reset on process restart and are not shared across replicas; use a distributed gateway limiter if you scale out.

## Browser CORS and session separation

Server-to-server clients do not need CORS. For external browser clients configure a comma-separated allowlist, then rebuild/restart the backend:

```bash
AGENTTREE_PUBLIC_API_CORS_ORIGINS=http://localhost:3000,http://192.168.1.50:3000
```

The default is no extra public origins. Wildcard origins are rejected. Browser Studio sessions still use HttpOnly cookies and their existing origin/CSRF protection; Public API v1 requires a Bearer key and never falls back to a Studio cookie. Do not put a long-lived API key in an untrusted browser application or publicly shipped frontend bundle.

## Independent Python client example

```python
import os
import requests

base_url = os.environ["AGENTTREE_BASE_URL"].rstrip("/")
headers = {"Authorization": f"Bearer {os.environ['AGENTTREE_API_KEY']}"}
trees = requests.get(f"{base_url}/api/v1/trees", headers=headers, timeout=10).json()["data"]
if trees:
    response = requests.post(f"{base_url}/api/v1/trees/{trees[0]['id']}/invoke",
                             headers=headers, json={"input": "Hello"}, timeout=180)
    response.raise_for_status()
    print(response.json()["output"])
```

This client imports no Studio or AgentTree code and uses no PostgreSQL, Docker, or server filesystem access.

## Versioning and limitations

`/api/v1` is the stable external contract; internal `/api/*` routes are not versioned public contracts. There is no streaming, async queue, file artifact protocol, or OpenAI-compatible endpoint in v1. Invocations need a genuinely configured provider to complete. `last_used_at` on Account → API Keys is updated at most once per five minutes per key. Security Events record safe event types/IDs, not raw keys or prompts.
