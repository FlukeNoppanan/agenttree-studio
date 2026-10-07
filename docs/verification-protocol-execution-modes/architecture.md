# Protocol normalization and execution modes — pre-implementation audit

## Current boundaries

Provider SDK/API → existing Gemini/Ollama/OpenAI-compatible adapters →
`ProviderResponse` → `generate_with_tools` (authorized, bounded ToolSession) →
`_ProviderDecision._generate` → conservative JSON parser → strategy semantic
validator → existing `RootPlan`, `TriageResult`, `Subtask`, `ReviewResult` →
shared `OrchestrationContext` phases → real execution and persisted trace.

Adapters already normalize vendor envelopes, parts and tool arguments. The
Level 2 boundary currently requires JSON text. It handles a single JSON fence,
rejects duplicate keys/nonfinite numbers, validates registered references and
allows one observable model repair. Qualification invokes these same strategies;
its persistence, continuation, cooldown and proof handling remain separate.

## Planned extension

Extend the existing parser with bounded, unambiguous representation handling:
explicit native structured content, encoded JSON text, and single recognized
protocol wrappers. Retain strategy validators and the existing one-repair limit.
Never mine raw vendor envelopes or treat executable tool calls as decisions.
Native tool arguments remain in their existing adapter/ToolSession boundary.
Record representation and canonical result type, not raw model output.

## Execution policy

Add typed `Task.execution_mode`, default Fast, to the existing Task contract.
Enforce Deep in shared planning before the direct-response branch. Root still
plans/triages; capability routing, decomposition, execution, review and revision
remain unchanged. No matching Manager/Specialist produces the existing explicit
failure, never direct fallback. Both sync and LangGraph use these shared phases.

Studio synchronous tests, Studio live Runs, API V1/V2 and Webhook already converge
on `InvocationRequest` → `RunService.prepare/execute` → real Core Task. Persist the
authoritative mode in existing Run metadata, and expose it in Run responses and
trace. No database migration or Playground-specific execution endpoint is needed.
Include mode in V2 idempotency identity. Existing Runs without mode read as Fast.

Keep Playground's three columns; add only a compact mode control, with persisted
mode restored on historical Run selection/reload. Run Again creates a new ID.

## Preserved state

Studio HEAD `6fd567422194fee4481a7bfbd8d94dd43e373e49`; Core HEAD
`a1315a4f3d9498005522fd233c4e4cd6f849b0d7`. Both working trees contain previous
verified, uncommitted work. Initial tracked diffs were captured under `/tmp`.
No reset, clean, stash, credentials changes or publication is authorized here.
Original database resources must be inventoried and preserved during acceptance.
