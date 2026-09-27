# Phase 8C Live View V2 audit

## Existing architecture

`/trees/:treeId/live` is a two-second-polled Tree overview. `/runs/:runId` is the existing authoritative Run detail route, but it also polls the legacy `/api/runs/{id}` detail every two seconds. `ExecutionInspector` renders a historical trace, state, input, and output. `TraceTimeline` and the Agent hierarchy component can provide context, but the current inspector infers roles from event names when a saved Tree version is unavailable.

The Run list and Tree live overview link to `/runs/:runId`. `TestRunDialog` waits for synchronous execution before navigation. The API client uses same-origin Studio cookies. The public V2 API requires bearer keys, and native `EventSource` cannot set Authorization, so the Studio UI needs a cookie-authenticated internal facade over the same Run services. It must not receive or store a personal API key.

## Contracts and gaps

Public V2 provides queued/running/cancellation_requested/terminal status, durable events ordered by `core_sequence`, live SSE deltas without durable IDs, result, artifact metadata, verified artifact bytes, and cancellation. Studio's legacy `RunDetail` trace uses a different sequence and is history-oriented. V2 durable events are the proper refresh/reconnect source. Core event payloads contain actor IDs and safe event metadata; live deltas have role, agent ID, operation ID, and local sequence. Tool and Manager collaboration must remain distinct. Artifact history has `is_final`, logical path, operation, media type, hash, producer, and body availability. Existing UI has no artifact panel or cancel action.

The current Run inspector has no connection-state model, no SSE client, no cursor, no transient text buffer, no artifact preview/download, no live cancellation, and no dedicated Root final-output panel. It renders some technical JSON by default. The Tree overview is not a substitute for a per-Run console.

## Reuse and risks

Reuse `/runs/:runId`, existing Studio layout, buttons/badges/dialog primitives, Tree lookup, i18n, and history links. Preserve the legacy detail/trace access for older Runs. Keep a single Run console. Use a pure event reducer keyed by durable sequence, bounded transient text, and paged history to avoid thousands of DOM nodes. Use agent IDs and the saved current Tree version when available; retain unknown agents as observed IDs. Avoid raw HTML and URL-derived artifact paths. Download through an authorized Run-scoped route. Mobile widths need a single-column timeline and inspector. Status and connection require text, not color alone; updates must not steal focus. The backend cannot recover active Core execution after restart, so a stale running DB row cannot be presented as proof of a healthy worker.
