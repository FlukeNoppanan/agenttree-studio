# AgentTree Studio Public API v2

Public API v2 is the asynchronous external execution contract. V1 remains supported and synchronous. V2 creates a durable Run immediately, executes through the Phase 8A Core integration in a bounded background worker, and supports polling or Server-Sent Events (SSE).

Tree → Connect presents V2 as **Async API · Recommended**, with cURL, Python,
and JavaScript examples using the configured public origin or browser proxy
origin. Personal keys are managed in **Account → API Keys**. Separate incoming
[Webhook Triggers](external-integrations.md) reuse the same Run infrastructure.

## Authentication and authorization

Every endpoint requires `Authorization: Bearer ats_…`; API keys in query strings are not accepted. V2 retains hash-only key storage, active-owner/revocation checks, dynamic Tree grants, and throttled `last_used_at` updates. Missing and unauthorized Runs/artifacts both return a non-enumerating 404.

Run access follows current Tree access, matching V1. Removing a Tree grant prevents later status, event, result, cancellation, and artifact reads but does not automatically terminate work already running. Creator/token IDs support idempotency and audit correlation; they never override a revoked current grant.

Prompt bodies, credentials, provider-native objects, tracebacks, physical artifact paths, and internal planning/review/tool-call JSON are not exposed. Studio never applies artifacts.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v2/runs` | Submit; returns HTTP 202 without waiting |
| GET | `/api/v2/runs/{run_id}` | Current state and terminal final output |
| GET | `/api/v2/runs/{run_id}/result` | Stable terminal result |
| GET | `/api/v2/runs/{run_id}/events` | Durable ordered events |
| GET | `/api/v2/runs/{run_id}/stream` | Durable replay plus live SSE |
| POST | `/api/v2/runs/{run_id}/cancel` | Cooperative cancellation |
| GET | `/api/v2/runs/{run_id}/artifacts` | Artifact metadata |
| GET | `/api/v2/runs/{run_id}/artifacts/{artifact_id}` | Verified bytes |

OpenAPI at `/openapi.json` describes schemas, bearer security, HTTP 202, errors, and `text/event-stream`.

## Submit and idempotency

```bash
curl -X POST "$AGENTTREE_BASE_URL/api/v2/runs" \
  -H "Authorization: Bearer $AGENTTREE_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: client-job-123" \
  -d '{"tree_id":"<TREE_ID>","input":"Build the requested change.","timeout_seconds":900,"metadata":{"client_request_id":"client-job-123"}}'
```

Input is 1–65,536 characters. Timeout is optional (1–86,400 seconds). Metadata has at most 16 fields containing bounded JSON scalars or short scalar lists. Callers cannot supply Tree structure, provider/model overrides, endpoints, or credentials.

HTTP 202 returns `run_id`, exact immutable `tree_version_id`, `status:"queued"`, `created_at`, and relative links. Later Tree edits cannot affect the submitted Run.

`Idempotency-Key` is optional, 1–128 safe ASCII characters, token/action scoped, hash-only in PostgreSQL, and retained for 24 hours. The same key and canonical request returns the existing Run; a changed request returns 409. V1 ignores this header.

## State and result

Status is `queued`, `running`, `cancellation_requested`, `completed`, `failed`, or `cancelled`. `final_status` separately preserves Core truth such as `passed`, `partial`, or `failed`. Partial is never relabeled as passed. `GET /result` returns 409 until terminal, then returns Root `FinalResult.final_output`, final status, usage, metrics, and artifact refs. Orchestration is not returned by default.

Polling-only clients can use submit → status → events → result/artifacts without SSE.

## Events, SSE, and reconnect

```bash
curl -H "Authorization: Bearer $AGENTTREE_API_KEY" \
  "$AGENTTREE_BASE_URL/api/v2/runs/<RUN_ID>/events?after=82&limit=100"

curl -N -H "Authorization: Bearer $AGENTTREE_API_KEY" \
  -H "Last-Event-ID: 82" \
  "$AGENTTREE_BASE_URL/api/v2/runs/<RUN_ID>/stream"
```

`after` is exclusive. Pages default to 100, cap at 500, order by persisted `core_sequence`, and return `next_after` and `has_more`. Legacy trace-only rows without Core sequence are outside this cursor contract.

SSE authenticates and authorizes before opening. Durable records use numeric sequence IDs. Reconnect uses `Last-Event-ID` or `?after=N` (query wins), replays records greater than N, attaches a new future-only output subscriber, and continues through terminal delivery. Types include `run.status`, `execution.event`, `agent.output.delta`, `artifact.committed`, `output.final.available`, `run.completed`, `run.failed`, and `run.cancelled`.

`agent.output.delta` is transient and has no durable SSE ID. It includes role, Agent ID, operation ID, attempt, local sequence, delta, and dropped count. Historical token deltas are not replayed; durable events and the final result provide catch-up. Subscribers have independent bounded queues, do not steal events, and disconnect never cancels a Run. Idle streams send a heartbeat about every 15 seconds. Each API token may hold four SSE connections per backend process.

## Cancellation

Cancellation is explicit and idempotent. Queued/pre-Core work is cancelled when possible. A running execution reports `cancellation_requested` until Core reaches `cancelled`; no hard thread termination is claimed. Terminal Runs return their current state. Core transitions prevent late success from replacing cancellation.

## Artifacts

The list returns metadata and revision history, never bodies or physical paths. Fetch first authorizes the Run, requires artifact membership, rejects DELETE intents or unavailable historical bodies, sanitizes the filename, and verifies size/SHA-256 through Core `FileArtifactStore` plus a response-boundary hash check.

Metadata stays in PostgreSQL. Bytes are atomically stored beneath `AGENTTREE_STUDIO_ARTIFACT_ROOT` using generated IDs and hashed execution directories. Compose mounts this on its Studio data volume. Bodies therefore survive restart when the database and volume persist. No PostgreSQL blobs, S3, or MinIO are introduced.

## Errors, IDs, limits, and CORS

V2 reuses `{"error":{"code":"…","message":"…","request_id":"req_…"}}` and validated `X-Request-ID`. Codes include `tree_not_ready`, `run_not_found`, `run_not_terminal`, `artifact_not_found`, `artifact_corrupt`, `idempotency_conflict`, `rate_limited`, and `runtime_capacity`. Raw exceptions never appear.

Per-token process-local buckets separate submissions (30/minute), cancellations (60/minute), reads/downloads (300/minute), and stream opens (30/minute). These and SSE connection accounting are not distributed across replicas. Public V2/SSE CORS uses the bearer-only allowlist and never enables Studio cookies or weakens CSRF.

## Client flow and future Coding Agenttree

```text
POST run → run_id → SSE progress/artifact refs → terminal
         → GET result → list/fetch selected artifacts
```

Phase 8D Coding Agenttree can submit work, stream safe output and Tool/collaboration lifecycle, fetch patches/files, preview them, and decide locally whether to apply. Core and Studio never apply them.

## Restart and retention limitations

Run rows, final results, durable Studio events, artifact metadata, idempotency mappings, and file-backed bodies survive restart. Transient deltas do not. Active Core state, checkpoints, and operation journals still use `InMemoryExecutionStore`. Startup reconciliation marks interrupted active Runs failed with `RECOVERY_UNAVAILABLE`; they do not resume.

**DURABLE CORE RECOVERY IN STUDIO: NOT IMPLEMENTED.** No public recovery endpoint exists. No destructive retention job runs in Phase 8B; records and bodies accumulate pending a future operator policy.
