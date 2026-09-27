# Live View V2

`/runs/:runId` is the Studio Run console. `/trees/:treeId/live` remains a Tree overview and now submits ready Trees asynchronously before navigating to the Run. Older Run trace/history remains available in the console when a Run has no V2 durable event cursor.

## Authentication and transport

The browser uses its existing same-origin Studio session cookie. `/api/studio/runs` is a narrow authenticated facade over the same V2 Run service, durable event query, SSE generator, cancellation, and verified artifact fetch. Its middleware requires `view_executions`; resource handlers check current Tree access. Submission additionally needs current Tree use access. Studio never exposes a personal API key to JavaScript, URL parameters, or browser storage. Mutating actions retain the Studio cookie CSRF checks. Public V1 and V2 contracts remain separate and unchanged.

`run-live.ts` uses `fetch` with same-origin credentials and parses typed SSE frames. It reconnects with bounded exponential backoff and `after=<latest durable sequence>`. `agent.output.delta` has no durable ID, never advances the cursor, and is not fabricated after a gap. Route cleanup aborts the fetch. Run status and connection status are displayed separately. Terminal Runs use persisted result and artifacts and do not maintain a live stream.

## State and presentation

Initial load reads Run status, pages through durable events, fetches artifacts, then subscribes if nonterminal. The reducer sorts and deduplicates durable events by sequence. It retains the most recent 1,000 events and bounds text to 16,000 characters per operation and 100 operations. Live deltas are grouped by role, Agent ID, and operation ID; UI updates are batched. Agent timeline sections use actual Agent IDs and the saved Tree version when available. Tool events and directional Manager collaboration render as separate activity types. Collaboration events with a thread ID are also grouped in a thread summary. Technical event payloads are secondary and opened by the user.

Root final output has its own prominent panel. Live Root text is provisional; `GET /result` is authoritative when the Run finishes. Artifacts stay separate from final output and orchestration. The artifact panel prioritizes final items while retaining intermediate revision history. Text, code, JSON, and patch bodies are fetched through the authorized Run-scoped endpoint and shown as read-only text. Binary content is download-only. Preview never executes or applies a patch.

The header distinguishes queued, running, cancellation requested, completed, failed, and cancelled. Final status such as partial remains visible separately. Cancel requires confirmation and represents the requested state until the backend reports a terminal state. Failures retain their timeline and artifacts. Losing authorization clears cached Run data. Text and artifact names are rendered through React text nodes, without raw HTML. Status and connection have textual labels; live updates do not move focus. EN and TH translations cover the new console.

The desktop layout places timeline and artifact inspector in two columns; narrower widths use one column. Detail areas cap height and wrap long text to avoid page overflow.

## Restart boundary

Studio persists Run rows, durable events, artifact metadata, and file-backed artifact bodies. Transient output, active Core execution, checkpoints, and operation journal do not survive a backend restart. At startup, a Run left pending, running, or cancellation requested is marked failed with `RECOVERY_UNAVAILABLE` and a durable failure event. The console shows this error and explains the limitation in a Run detail disclosure. **DURABLE CORE RECOVERY IN STUDIO: NOT IMPLEMENTED.**
