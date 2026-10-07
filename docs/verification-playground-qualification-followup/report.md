# Playground layout and qualification continuation follow-up

**Overall status: COMPLETE**
Verification date: 5 October 2026, Asia/Bangkok. No commit, tag, push or publication was performed.

This report covers the two requests in the focused final follow-up: the Playground layout and qualification continuation/pause/resume. It does not certify unrelated historical phases or claim that every discovered Gemini Model is compatible.

## 1. Initial state and preserved work

Studio HEAD: `6fd567422194fee4481a7bfbd8d94dd43e373e49`.
Core HEAD: `a1315a4f3d9498005522fd233c4e4cd6f849b0d7`.

Both repositories already contained uncommitted Provider-neutral changes. These were audited and retained. Initial tracked diffs were preserved locally before editing. The existing structured-decision normalization, semantic validation, one-repair contract, role qualification and no-fallback behavior remain in place. Current status, initial tracked file lists and actual tag targets are in [git-state.json](checks/git-state.json).

The current task began with three Trees, four Runs, two Providers, three users and one Secret. The configured Gemini Provider was available. Those resources differ from the older verification environment; the older successful qwen hierarchy Run was not recreated or presented as a Run from this task.

No original Tree, Agent binding, Provider credential, Secret or historical Run was changed. No disposable Tree, Run, user or Tool was required. Qualification metadata and connection/discovery check times were intentionally updated.

## 2. Playground architecture and changes

Previously, the existing activity feed was a short section below the read-only React Flow Canvas. The change moves that same section to a sibling column. Its event filter, last-60 limit, timestamps, Agent names, phase/status translation, ordering and event keys are unchanged.

Desktop layout:

- Left: existing test input, submitted input, history, result and controls.
- Center: existing `BuilderCanvas` with the existing event projection and pinned Tree version.
- Right: existing execution timeline in an independently scrollable region.

Shared theme tokens and the existing components are retained. No execution, Tree hierarchy, SSE, artifact, trace or Run API changes were made for this layout.

The grid uses `1.4fr / 1.8fr / 1fr`, with minimum usable widths. Workspace height is constrained by the viewport. The center graph fills its column; text wraps and the right column scrolls independently.

### Visual iteration and responsive correction

The first browser iteration exposed a second layout constraint: a long result made the desktop workspace excessively tall. Containing the workspace restored access to graph controls. Real testing at 1280×900 then exposed inherited `.builder-page` fixed height, which compressed the stacked sections and clipped the graph. A scoped `.playground-page.builder-page` height override and a non-shrinking workspace resolved that issue without changing Builder layout.

At widths up to 1400px the columns stack: Input/Result, Canvas, Activity. The Canvas retains 540px working height and Activity retains a scrollable maximum height of 420px.

### Real browser evidence

Authenticated admin session, actual Docker frontend, existing General Analysis Tree:

- Tree: `8cbd4724-548c-4074-9362-33abb7e0eb87`.
- Historical Run: `5e0196a6-c557-431d-8bb2-540ea5486252`.
- Lifecycle completed; existing user-facing outcome **Partial**, not a newly successful full Run.
- Existing duration: 2265.6 seconds; 223 persisted events; latest 60 timeline entries displayed.
- Five actual Agents and the actual Artifact Output resource rendered.

At 1920×1080 the three column widths were approximately 545 / 702 / 374px (scrollbar-adjusted), with about 818px height. The Canvas was the largest column. Page width remained 1920px. Right-panel scrolling reached `scrollTop=1514`, with `scrollHeight=2332`, `clientHeight=818`; the actual final Run-completed entry was reached.

Zoom in changed the actual React Flow transform from scale `0.711628` to `0.853953`. Zoom out and Fit View restored the view. All Agents, resource and controls were visible. No Mini Map exists in this read-only Playground, so that check is not applicable.

At 1280×900 the final sections measured approximately 1280 / 654 / 419px high, sequentially positioned with no overlap. The graph itself measured 540px high and 983px wide. Document width was 1265px with the browser scrollbar, below viewport width 1280px. The full-page final screenshot confirms every pane remains reachable.

English/Light and Thai/Dark were inspected after the final correction. Thai and English activity labels, long names, timestamps and repeated review/revision activity remained readable. English UI still shows the user's original Thai task input; that is stored input, not a translation leak. Browser reload recovered the same persisted Run. No new expensive hierarchy Run was needed for layout-only acceptance, and no new live Playground Run was started.

## 3. Exact real Gemini root cause

Before implementing the qualification fix, the configured Gemini Provider passed the connection test and returned **61 Models**, including **44 generation candidates** and **17 catalog-declared non-generators**. The prior pass had three actually checked incompatible Models and stopped on a fourth; the UI had 0 Ready, 20 Unavailable and 41 Pending when represented correctly.

The actual failing request to `models/deep-research-max-preview-04-2026` returned:

- HTTP **429**, canonical status **RESOURCE_EXHAUSTED**.
- Google `QuotaFailure` violations for free-tier input tokens, requests per minute and requests per day.
- Every violation explicitly carried a `model` quota dimension (`deep-research-pro-preview`).
- Google `RetryInfo.retryDelay`: **18824 seconds**.

This was evidence of quota scoped to that Model. It was not evidence that every Gemini Model was incompatible or that connection authentication had failed. The existing SDK normalization discarded the structured quota scope and RetryInfo, causing the qualification batch to interpret the interruption as Provider-wide. Catalog rediscovery also reset previous qualification results.

[Safe root-cause evidence](checks/gemini-root-cause.jsonl) records only status and allowlisted quota diagnostics, without credentials, raw error bodies or secret headers. Two bounded diagnostic requests were made before the fix; no artificial quota exhaustion was attempted.

## 4. Qualification policy and persistence

| Failure | Behavior |
| --- | --- |
| Unsupported/individual 400 or 404, empty/incompatible generation | Record that Model's result and continue. |
| Generation works but structured-decision contract does not | Limited, with actual role evidence; continue. |
| Explicitly Model-scoped throttling/quota | Pending, save retry time where supplied, continue other eligible Models. |
| Unscoped/provider-scoped 429, timeout, unavailable upstream | Bounded retry where appropriate, then save progress and pause. |
| Authentication/revoked credential or qualification infrastructure failure | Stop the pass safely; remaining Models remain Pending. |

Transport retry is limited to **two attempts total per request**, with one wait. Retry-After supports numeric seconds and HTTP dates; Google RetryInfo is also honored. A supplied wait longer than five seconds is persisted as `retry_at` rather than shortened or held open synchronously. Without a supplied wait, the single retry waits one second. Authentication, exhausted daily quota and incompatible responses are not retried automatically. This transport policy does not increase the existing structured-decision repair budget.

Models are persisted individually through the existing table and commits. There is no batch rollback that erases completed results and no new qualification database subsystem.

### Resume and freshness

- Continue loads the existing Model catalog; it does **not** rediscover it.
- Fresh completed qualification is reused for 24 hours.
- Unknown/transient results and pending rechecks are eligible; active checks and unexpired cooldowns are skipped.
- Explicit per-Model verification can recheck completed proof, but still respects cooldown.
- Rediscovery merges catalog metadata with existing qualification evidence rather than erasing it.
- Interrupted recheck preserves previous completed qualification status, evidence and check timestamp, with a separate pending-attempt marker. A real new terminal result replaces previous proof appropriately.
- The existing atomic row claim prevents concurrent qualification of the same Model. The UI also prevents duplicate pass starts and runs the pass sequentially.

Qualification connection health remains separate: Connected + paused qualification is valid. Pending results are in their own group and are never counted as Unavailable solely because a check was interrupted. The UI exposes only safe reason codes and retry times.

### Core change justification

A focused additive change in Core's Provider exception normalization preserves safe rate-limit scope, Retry-After/RetryInfo and exhausted-quota information that would otherwise be lost at the SDK boundary. It supports actual HTTP response status as well as SDK status. Mixed or absent quota scope remains conservatively Provider-wide. No raw response is retained. Root/Manager/Specialist orchestration, routing, review and runtime Provider selection were not changed by this follow-up.

No migration was added. Provider response counters are additive schema fields derived from existing Model state.

## 5. Real Gemini qualification and resume

Post-fix real service acceptance confirmed connection and the same 61-Model catalog. The original deep-research request remained Pending with `scope=model` and its real long cooldown, rather than becoming Unavailable or blocking all other Models.

The actual browser Continue pass:

1. Started with 40 eligible pending Models: three fresh terminal results and the deep-research cooldown were skipped.
2. Continued beyond multiple Model-scoped quota and incompatible outcomes.
3. Produced four actual Ready Models and one Limited Model.
4. Paused on the normalized `provider_unavailable` outcome for `models/gemma-4-31b-it`. No assumption is made about an uncaptured raw HTTP status for that later interruption.
5. Saved 22 terminal generation-candidate results, with 22 candidates still Pending. Connection remained Connected.
6. Browser reload recovered the same counters and the persisted pause reason.
7. Continue resumed **only six eligible Models**, without rediscovery or retesting the 22 fresh completed results.
8. The previously blocked gemma Model received an actual incompatible result, while later Model-scoped quota outcomes continued to be persisted as Pending.

Final persisted and rendered counts:

| Category | Count |
| --- | ---: |
| Discovered catalog | 61 |
| Generation candidates | 44 |
| Checked: completed candidate qualification | 23 / 44 |
| AgentTree Ready | 4 |
| Limited | 1 |
| Unavailable generation candidates | 18 |
| Catalog-declared non-generators | 17 |
| Total Unavailable shown | 35 |
| Pending generation candidates | 21 |
| Pending rechecks of previous completed proof | 0 |

Thus `23 + 21 = 44` candidates, and `4 + 1 + 35 + 21 = 61` catalog Models. Checked means a completed classification; a request interrupted by quota is still Pending even if a generation probe was attempted. The four Ready classifications come from actual six-check qualification evidence, not catalog availability.

The final Ready Models are `gemini-3.1-flash-lite`, `gemini-3.1-flash-lite-preview`, `gemini-3.5-flash-lite` and `gemini-flash-lite-latest`. `gemini-robotics-er-2-preview` is Limited. These are observed results, not hardcoded exceptions.

A comparison of the persisted snapshots proves all 22 previously completed results, including check timestamps and evidence, were identical after Resume. Only the six eligible pending entries changed. Long daily cooldowns remain unavailable for early retry. No additional pass was run to force quota expiration.

Evidence: [saved pass](checks/gemini-progress-saved.json), [after Resume](checks/gemini-after-resume.json), real browser screenshots 05–09. Short retry timing and fatal-auth branches are covered by controlled tests; actual real Gemini long RetryInfo/cooldown and safe stop/Resume were observed. We do not claim an independently measured live request count for the SDK's internal retry timing.

## 6. Real Ollama regression and no fallback

The existing local Ollama Provider connected and rediscovered its two actual Models without erasing their proof. An explicit real `qwen3:1.7b` qualification completed in approximately 10.62 seconds and passed all six structured-decision checks: AgentTree Ready. The existing `gemma4:e4b` Limited classification and evidence were preserved.

The real Provider UI displayed Connected, Ready 1, Limited 1, Unavailable 0, Pending 0, Checked 2/2 in Thai/Dark and English/Light. The qualification used the configured local Ollama endpoint. It did not substitute Gemini or another Provider.

No full local hierarchy Run was necessary for this regression. Earlier 146-event qwen evidence belongs to the preceding task. This task's database comparison verifies all Agent Provider/Model and Tool bindings stayed byte-for-byte unchanged; failed qualification did not change runtime selection.

[Real service evidence](checks/real-provider-acceptance.jsonl) omits Provider credentials and Secret IDs.

## 7. Tests, build, Docker and operational evidence

| Check | Actual result |
| --- | --- |
| Studio backend | **367 passed**, one existing Starlette cookie deprecation warning |
| Studio frontend | **358 passed**, 53 files |
| Core | **753 passed, 5 skipped** |
| TypeScript | PASS (`tsc -b`) |
| Production build | PASS |
| Studio and Core diff whitespace checks | PASS |
| Docker | PostgreSQL, backend and frontend healthy |
| Alembic current/head | `0014_resource_history` / `0014_resource_history` |
| Database preservation | YES |
| Commit/tag/push/publication | NO |

Core skips are the existing live environment-credential tests. They do not negate the separate actual configured Gemini qualification or actual local Ollama acceptance. Production build retains the existing large-bundle advisory (>500kB); no build error occurred. Vitest retains its environment-performance advisory.

The stack was rebuilt with `docker compose build --no-cache` and brought up without deleting volumes. After final adapter and layout refinements, the respective images were rebuilt and activated. Frontend-only refinements did not restart the backend or cancel a qualification pass. There were no active Runs when the initial stack was stopped.

New focused coverage includes Model failure continuation, 400/404, structured Limited, auth/revoked credential, unavailable/timeout, numeric/date Retry-After, direct HTTP exceptions, long cooldown, Model quota scope, resume/freshness, interrupted previous-proof preservation, accurate counters, Connected + paused EN/TH, and the three sibling Playground regions. Existing tests were retained; expectations changed only for intentional Pending/result-preservation behavior.

### Browser console and network limits

The real browser warning/error capture returned **[]** after qualification and layout testing. [Captured console](checks/browser-console.json).

The available browser capabilities did not expose a network/HAR inspector. Therefore a complete browser request waterfall, every HTTP status and every SDK internal retry request were not independently captured. Real backend service responses, safe persisted qualification snapshots, UI progress and Docker logs were inspected. No duplicate subscription or polling behavior was introduced by the layout change; no automatic qualification polling loop exists. Continue was explicitly invoked and progressed sequentially.

The final 40-minute Docker backend/frontend log inspection found **0 Tracebacks**, **0 ERROR/Uncaught/Unhandled signals**, and **0 logged HTTP error lines**. The deployed stack did not expose complete access logs, so that last count is not a claim that every upstream HTTP request returned 2xx. Expected Gemini quota/incompatibility results are recorded separately from Studio application failures. [Log summary](checks/runtime-log-summary.json).

A temporary browser auto-review timeout recovered on the single permitted retry; no safety bypass or authentication workaround was used.

## 8. Data preservation

[Initial inventory](checks/initial-database.json) versus [final inventory](checks/final-database.json) confirms:

- Same three Trees, four Runs, two Providers, three users and one Secret.
- Same Provider endpoints and presence of credential references.
- Same Agent configuration hashes, including bindings.
- Same historical Run statuses, event IDs/sequences and SHA-256 hashes of every stored event payload.

[Comparison](checks/database-preservation.json) is all true. PostgreSQL volumes were not removed. Original historical failed and Partial Runs remain. No cleanup of original user resources was performed; no disposable resources were created.

## 9. Files touched by this follow-up

Studio implementation:

- `backend/schemas/provider.py`
- `backend/services/model_discovery_service.py`
- `backend/services/model_qualification.py` (existing preceding-task uncommitted file reused)
- `backend/services/provider_service.py`
- `frontend/src/components/model-compatibility.tsx`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/provider-models.ts`
- `frontend/src/locales/en/translation.json`
- `frontend/src/locales/th/translation.json`
- `frontend/src/pages/providers.tsx`
- `frontend/src/pages/trees/tree-playground.tsx`
- `frontend/src/pages/trees/tree-playground.css`

Tests:

- `tests/test_qualification_continuation.py`
- `tests/test_model_qualification_failures.py`
- `tests/test_structured_model_qualification.py`
- `frontend/src/lib/qualification-progress.test.ts`
- `frontend/src/pages/providers.test.tsx`
- `frontend/src/pages/trees/tree-playground.test.tsx`

Core follow-up:

- `src/agenttree/providers/exceptions.py`
- `tests/test_qualification_error_scope.py`

Documentation/evidence: this directory. Other modified files listed in [git-state.json](checks/git-state.json) include preserved work from the preceding task; they were not discarded or relabeled as new changes from this follow-up. Neither repository is clean, and that is intentional while this combined unpublished work awaits review.

## 10. Remaining limits and stopping point

- Gemini's 21 Pending Models require quota/cooldown availability before their qualification can complete. They are not classified as incompatible by this task.
- Freshness is a documented 24-hour reuse rule. Explicit retry remains available subject to real cooldown; it is not a perpetual Ready guarantee.
- Active qualification remains a sequential existing request workflow. Backend-crash recovery of a row stranded in `verifying` was not introduced or certified here.
- No new active Playground Run, runtime redesign or unrelated execution-result correction was attempted. Historical Partial output was rendered accurately and unchanged.
- Complete browser network/HAR capture was unavailable; console capture and other real evidence were available.
- Model qualification demonstrates compact decision-contract compatibility, not a guarantee for every application prompt or Tool.

The two scoped fixes are verified. Stop here: publication and unrelated v0.1.3 work remain outside this task.
