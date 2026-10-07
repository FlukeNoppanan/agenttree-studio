# Model protocol normalization + Fast/Deep execution

## Status

**COMPLETE — required acceptance verified on 6 October 2026.**

Fast completed through a real Ollama Root direct answer. Deep completed through a
real Groq Root → selected Manager → selected Specialist → Manager review → Root
final review/synthesis. Two different provider transports reached the same
existing canonical decision types. Full Core/Studio suites, Docker, persistence,
browser themes/languages/viewports and disposable cleanup were verified.

This does **not** claim that every qualified model completed every mode. Two
supplemental Ollama Deep attempts were explicitly cancelled after long provider
waits. A later Groq Run Again hit a real provider rate limit. Their actual terminal
states are retained in the evidence below; none are counted as successful Runs.

## 1. Initial audit and architecture

Before implementation, both repositories were audited, including status/history,
provider adapters, structured decisions, qualification, orchestration phases,
durable execution, Studio ingress/persistence/SSE and Playground. Relevant earlier
qualification and Playground reports were read. The pre-implementation note is
[architecture.md](architecture.md).

| Repository | Initial and final HEAD | Working tree |
| --- | --- | --- |
| Studio | `6fd567422194fee4481a7bfbd8d94dd43e373e49` | Already dirty; earlier qualification/UI work preserved |
| Core | `a1315a4f3d9498005522fd233c4e4cd6f849b0d7` | Already dirty; earlier structured-decision/provider work preserved |

Initial tracked diffs were captured in `/tmp/protocol-studio-initial.diff` and
`/tmp/protocol-core-initial.diff`. No reset, clean, stash, commit or publication was
performed. Core changes are explicitly authorized by this task.

The existing path remains:

```text
Provider SDK/API
  → existing vendor adapter / ProviderResponse
  → existing authorized, bounded ToolSession generation
  → shared structured-decision normalization
  → existing strategy semantic validators
  → RootPlan / TriageResult / tuple[Subtask] / ReviewResult
  → existing OrchestrationContext phases
  → FinalResult / existing Studio Run, events and result persistence
```

Transport normalization stays in provider adapters. Agent protocol normalization
extends `core/structured_output.py`; no second normalizer framework or alternate
orchestration engine was introduced. Textual Specialist output and Root synthesis
retain their existing contracts. Tool arguments remain adapter/ToolSession data,
not executable calls repurposed as orchestration decisions.

## 2. Protocol boundary and contracts

- Added an optional explicit `ProviderResponse.structured_content` carrier for
  native JSON objects. Existing string content remains compatible. The shared
  adapter accepts a native object only for an explicit structured-output request.
- Normalize native objects, JSON text, JSON-encoded JSON, supported JSON fences
  and exclusive recognized `content`/`output`/`result`/`decision` wrappers.
- Limit representation traversal to five iterations, native nesting to 48 levels,
  input text to 1,048,576 characters and final JSON to 1,048,576 UTF-8 bytes.
- Reject malformed/ambiguous objects, duplicate JSON keys, nonfinite numbers,
  invalid JSON types and excessive nesting/size. Do not mine raw SDK envelopes,
  rename semantic fields or invent objectives, capabilities, targets or decisions.
- Existing strategy validators still create the typed canonical contracts and
  validate capabilities/references. Harmless additional fields follow existing
  validator semantics.
- Preserve the existing **one** model repair attempt and failure taxonomy. Provider
  failure does not become parser repair or a hidden provider fallback.
- Emit `structured_decision.normalized` after semantic validation, carrying safe
  strategy, decision ID, representation, canonical type and attempt metadata.
  Raw provider envelopes and credentials are not added to these events.
- The compatibility parser does not unwrap an ordinary collaboration `content`
  field. This was checked against the full collaboration regression suite.

Qualification already invokes the same provider decision strategies. It now
exercises this boundary through those strategies; its discovery/status/proof,
incremental persistence, continuation, resume and cooldown policies remain intact.
The earlier qualification changes in the dirty baseline were preserved.

## 3. Fast and Deep semantics

`ExecutionMode` is an exported Core enum. `Task.execution_mode` defaults to
`fast`, accepts only `fast`/`deep`, and travels through the existing durable Task
codec/journal. Execution mode is a **Run property**, never a new Tree type.

**Fast:** existing Root autonomy remains. A validated Root plan can answer
directly or delegate through the existing hierarchy.

**Deep:** the shared orchestration planning phase prevents the direct-final
branch. Root still plans and triages. If its plan requests direct output, the
runtime records `root.delegation.required` and continues through actual hierarchy
execution. This enforcement is independent of prompting. Capability selection,
Manager ownership, decomposition, Specialist execution, reviews and bounded
revision remain unchanged on both sequential and LangGraph backends.

| Condition | Behavior |
| --- | --- |
| Root only / no Manager with a Specialist | Explicit Deep failure before provider planning |
| No matching Manager or Specialist | Existing routing failure; no Fast fallback |
| Invalid/unavailable model binding | Existing readiness/runtime-builder failure |
| Provider or Tool failure | Existing failure propagation; mode remains Deep |
| Review/revision limit | Existing bounded policy, including terminal failure |
| Malformed decision / exhausted repair | Existing structured failure after the one repair |
| Cancellation | Existing queued/cooperative cancellation; recorded mode preserved |
| Hierarchy becomes unusable | Existing saved-version/runtime validation and failure paths |

Deep does not execute every Agent. It does not replace capability routing with a
fixed sequence or fabricate Manager/Specialist activity.

## 4. Studio/API integration and compatibility

The same additive `execution_mode` field flows through synchronous Studio tests,
live Studio Runs, Public API V1/V2 and authenticated Webhook ingress. These still
converge on `InvocationRequest` → `RunService.prepare/execute` → real Core Task.

Run metadata stores the authoritative mode; a client metadata value cannot
override the validated field. Existing Run metadata without mode reads as Fast.
Run responses and start events expose mode. V2 idempotency identity includes mode,
so Fast and Deep submissions are distinct while omitted mode equals explicit Fast.
Existing SSE, cancellation, artifact and authorization infrastructure is reused.

Example existing V2 submission:

```json
{"tree_id":"<tree-id>","input":"Compare these options","execution_mode":"deep"}
```

V1/Studio invocation requests accept the same field alongside their existing
`input`. Webhook input accepts it alongside the unchanged `event` envelope.
No new Playground execution endpoint, API version, conversation store, database
column or migration was added.

## 5. Playground

Added compact Lucide-icon Fast/Deep buttons near the input. Fast is the default;
the selected button has `aria-pressed`, explanatory EN/TH copy and visible styling.
Controls are disabled while submission/execution is active. Historical Run mode
is restored from the actual Run response; the footer displays the persisted mode.

The existing three-column layout, graph derivation, activity/result/history and
independent-Run payload semantics remain intact. No fake progress or output
streaming was added. Mode selection introduces no new animation; existing reduced
motion behavior remains applicable. Run Again retains input and creates a new ID.

## 6. Real provider and canonical-contract evidence

The user added **Groq instead of Gemini** and authorized that second provider path.
No Gemini Provider exists in this current database. No credentials were printed,
changed or copied into evidence. Cerebras and unavailable/unqualified models were
not used as fallbacks.

| Provider/model | Qualification used | Real evidence |
| --- | --- | --- |
| Ollama `qwen3:4b` | Qualified, Root/Manager/Specialist proof passed | Fast success; supplemental Deep reached typed planning, triage, decomposition and Manager review before cancellation |
| Groq `qwen/qwen3.8-27b` | Qualified after existing verification resumed successfully | Complete Deep hierarchy, reviews and final result |
| Ollama `phi4-mini:latest` | Already qualified for all roles | Explicit supplemental test; cancelled while waiting on provider generation, not counted as success |

Groq was initially rate limited/pending. Existing `verify_model` was used after
cooldown; no status override or qualification bypass was performed. Its six
checks and all three role proofs passed: [qualification proof](checks/groq-qualification.json).

Ollama's schema-format SDK path and Groq's OpenAI-compatible response path both
yielded actual `RootPlan`, `TriageResult`, `tuple[Subtask]` and `ReviewResult` values
through the same boundary. Ollama decisions used JSON; the successful Groq final
review additionally exercised `fence+json` and yielded the same `ReviewResult`
type. Native object and encoded/wrapped variants are covered by deterministic
transport/strategy tests, not misrepresented as observed real SDK responses.

[Canonical proof](checks/canonical-contract-proof.json) correlates representations,
typed decisions and actual runtime event types. [Safe persisted evidence](checks/runtime-evidence.jsonl)
retains Run IDs, modes, results, Agent IDs and allowlisted event metadata.

### Actual Runs

| Run ID | Provider/model | Mode | Final status | Duration | Persisted trace events |
| --- | --- | --- | --- | ---: | ---: |
| `3b1b0a1b-f765-4291-8d15-27bf2bbc3fe1` | Ollama qwen3:4b | Fast | completed | 14.993 s | 26 |
| `9cdcb19b-22c6-4f4d-b20d-b65e7e6c6846` | Groq qwen/qwen3.8-27b | Deep | completed | 6.571 s | 95 |
| `e4d84c68-fa9f-4208-a2a7-6ddac0443dba` | Ollama qwen3:4b | Deep | cancelled | 902.313 s | 65 |
| `3d33f2b3-0f8f-4237-bdaa-f98790846afc` | Ollama phi4-mini:latest | Deep | cancelled | 114.092 s | 10 |
| `134e5ec1-c041-4c37-b7d2-55300a2f7efc` | Groq qwen/qwen3.8-27b | Deep | failed — PROVIDER_RATE_LIMIT | See persisted evidence | 11 |

Fast answered “2 + 2 equals 4.” Its actual trace contains `root.direct_response`.

The successful Deep Run contains actual Root planning, capability selection,
Comparison Manager decomposition, Comparison Specialist work, passed Manager
review, passed Root final review and synthesis. Translation Manager/Specialist
have no execution events and stayed Idle. A `root.delegation.required` event proves
runtime enforcement when Root's planning response attempted direct output.
There is no `root.direct_response` in this Deep trace.

The first supplemental Ollama Deep triage selected both comparison and translation;
the runtime followed that real model decision. It did not force every branch.
Both Specialists finished, and Comparison Manager review passed. The next review
wait was prolonged; the test was explicitly cancelled through the browser. The
Phi4 supplement was also cancelled, with real `execution.cancellation.requested`
and `execution.cancelled` persisted. Neither produced a final result, and neither
is described as complete hierarchy acceptance.

Run Again created a genuinely new Groq Run ID. The provider returned a rate limit;
the Run persisted `PROVIDER_RATE_LIMIT`, stayed Deep and did not switch provider
or return a fake result. The earlier successful Run remained retrievable.

Trace counts above are full persisted `TraceEvent` counts. The successful Groq
Playground showed **63 durable public events**, a filtered stream representation
of the **95-event persisted trace**. These are not interchangeable counts.

## 7. Real browser acceptance

The authenticated real Chromium-backed in-app browser operated against the rebuilt
Docker frontend/backend. Run submissions and cancellation used actual UI controls.

- Fast default, explicit Deep selection and active-state disabled controls verified.
- Actual Activity/graph updates and final results observed; stable real Agent IDs
  retained by the existing Playground graph/event mapping.
- Reload during Ollama Deep reattached to the same active Run and restored mode
  and actual activity. Completed Groq Deep survived reload and historical selection.
- Open Execution Trace navigated to
  `/executions/9cdcb19b-22c6-4f4d-b20d-b65e7e6c6846?trace=1`, showing the same Run,
  result and 95 persisted events.
- Run Again created the independent ID above; its real failure state was inspected.
- Light/English and Dark/Thai verified. Technical terms Fast/Deep/Root/Manager/
  Specialist remain English inside natural Thai explanations.
- At **1920×1080**, Test/Live Execution/Activity retained three columns (measured
  widths 546/702/390 px). At **1280×900**, existing responsive stacking remained
  usable, with no catastrophic overflow. Client width 1265 includes a 15 px
  scrollbar reduction. Exact geometry is saved in `checks/browser-viewport-*.json`.
- Screenshots inspected visually, including final graph fit, control legibility,
  selected mode, result, readable activity and stacked narrow layout.
- Console warning/error capture was empty on the two inspected tabs. Temporary
  tabs were closed; viewport override reset; original tab returned to Trees in
  Light/English.

The browser capability exposed console inspection but no network/HAR inspector.
Network behavior was assessed through real submissions, connected SSE activity,
active reload/reconciliation, persisted unique event sequences, results and errors.
The inspected container logs contained no HTTP access entries, so this report
does **not** claim a complete HTTP-status inventory or packet-level replay test.
No new SSE/reconnect implementation was introduced; existing automated regression
coverage remains green.

See [screenshots.md](screenshots.md) for actual captures and their dimensions.

## 8. Automated regression and quality

| Check | Final result | Evidence |
| --- | --- | --- |
| Full Core suite | **790 passed, 5 skipped** | [core-tests.log](checks/core-tests.log) |
| Full Studio backend suite | **378 passed** | [backend-tests.log](checks/backend-tests.log) |
| Full Studio frontend suite | **361 passed**, 53 files | [frontend-tests.log](checks/frontend-tests.log) |
| TypeScript `tsc -b` | Passed | [typescript.log](checks/typescript.log) |
| Production frontend build | Passed | [frontend-build.log](checks/frontend-build.log) |
| Both repository diff checks | Passed | [diff-check.txt](checks/diff-check.txt) |

Added 37 focused Core cases, 11 backend cases and three frontend mode cases.
Coverage includes equivalent representations, explicit native adapter output,
invalid/missing/wrong-type decisions, one repair, wrapper bounds, collaboration
compatibility, Fast direct/delegate policy, Deep enforcement, capability selection,
both backend review/revision paths, unusable hierarchy, cancellation, codec/defaults,
all ingress schemas, idempotency, authoritative persisted mode, real Core service
execution, provider failure, queued cancellation and localized/historical UI mode.
Existing tests were retained; assertions intentionally updated for additive mode
metadata, normalized events and the exported enum.

An earlier concurrent frontend run timed out in five existing 5-second tests under
combined suite/image-build load. The complete suite was rerun with `--maxWorkers=2`
and all 361 passed without changing test timeout limits or source behavior. The
earlier log is retained as `frontend-concurrent-timeouts.log`. An earlier Core
wall-clock timing assertion also passed on a complete rerun without concurrent
heavy work; no timing assertion was weakened.

Remaining build/test warnings: the existing Vite >500 kB chunk advisory and the
existing Starlette per-request-cookie deprecation. No new dependency was added.

## 9. Docker, database, logs and cleanup

Affected images rebuilt and activated. The final small frontend change was
activated without restarting the backend during active Runs. PostgreSQL,
backend and frontend are healthy: [docker-health.txt](checks/docker-health.txt).
Migration current/head remains **0014_resource_history**. No migration was needed.

Backend/frontend logs were inspected; no traceback, uncaught/unhandled exception
or migration failure markers were observed in the reviewed interval. Available
logs do not provide a full access-request audit, as noted above. Expected real
Groq quota/rate-limit behavior is separately recorded, not hidden as success.

Only three explicitly disposable Trees and their associated Runs were removed,
after every disposable Run was terminal. No Provider, Secret, Tool, account,
credential, original Tree/Run or database volume was deleted.

[Before/after IDs and safe row hashes](checks/database-preservation.json) confirm
**zero removed original rows and zero changed original row hashes across all
inventoried tables** (excluding standard updated/login/last-used timestamps).
Original Trees: 3; versions: 10; Agents: 42; Runs: 10; trace events: 264; Tools: 4;
API tokens: 7 — all unchanged after cleanup. The user-added Groq Provider, its
Secret and 11 model records remain. Two new security-event records are retained.
[cleanup.json](checks/cleanup.json) confirms no disposable Runs remain.

## 10. Files changed by this revision

Earlier dirty files visible in final status are not all changes from this task.

**Core:** `models/task.py`, `models/__init__.py`, public `__init__.py`,
`providers/models.py`, `providers/_adapter.py`, `core/structured_output.py`,
`core/root.py`, `core/execution_runtime.py`, `orchestration/backends/context.py`,
`tests/test_protocol_execution_modes.py`, `tests/test_release.py`,
`tests/test_structured_decision_repair.py`.

**Studio backend:** `schemas/run.py`, `schemas/public_api.py`,
`schemas/public_api_v2.py`, `schemas/webhook.py`, `services/run_service.py`,
`services/webhook_service.py`, `api/studio_runs.py`, `api/public_v1.py`,
`api/public_v2.py`, `tests/test_execution_modes.py`, `tests/test_runs.py`.

**Studio frontend:** `src/lib/api.ts`, `src/pages/trees/tree-playground.tsx`,
`src/pages/trees/tree-playground.test.tsx`, EN/TH locale JSON. The earlier dirty
Playground CSS/layout and qualification components were preserved.

**Documentation:** this verification directory, its architecture note, report,
screenshot index, safe runtime/database/check evidence and real screenshots.

## 11. Known limitations and next checks

1. Supplemental Ollama Deep completion is **not verified**. Qwen completed several
   hierarchy stages but its second Manager review wait was prolonged; Phi4 waited
   on generation. Both were genuinely cancelled. Ollama version/loaded-model
   read-only checks responded successfully; the exact latency cause was not proven.
2. Qualification does not promise routing accuracy or future quota availability.
   Qwen's first triage included translation; Groq's targeted test excluded it.
   The runtime preserves validated model choices rather than rewriting semantics.
3. Groq's repeat Run hit a real rate limit after the successful Deep evidence.
   No automatic retry/fallback/model replacement was introduced.
4. Native/wrapped representation support has deterministic tests; the actual SDK
   responses observed here were JSON text/fenced JSON.
5. Studio's existing process-local active execution cannot be claimed recoverable
   across a backend restart. Browser reload and completed persistence were verified.
6. Live Tool/artifact production was not part of these text-only acceptance Runs;
   existing ToolSession/artifact contracts and complete regressions were preserved.
7. Full browser network capture was unavailable; no blanket claim of zero HTTP
   failures is made. Console, actual SSE behavior and available logs were reviewed.

The required two-provider normalization evidence, Fast direct behavior and complete
Deep selected hierarchy are verified. A useful supplemental next check is another
Ollama Deep completion under a measured provider deadline/output budget, once the
local model generation latency is understood; this report does not fabricate that
additional success.

## 12. Git/publication

Both HEADs are unchanged from the initial audit. Both working trees remain dirty
with prior work plus this authorized revision. Full statuses are recorded in
`checks/studio-git-status.txt` and `checks/core-git-status.txt`. Nothing committed,
pushed or published. No Learning, memory, A2A, distributed execution, fallback
provider policy, Builder redesign or new orchestration architecture was added.
