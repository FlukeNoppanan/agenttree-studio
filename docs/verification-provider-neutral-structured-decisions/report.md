# Provider-neutral structured decisions — verification report

Date: 2026-10-04, Asia/Bangkok.

## Overall status: MANUAL AUTHENTICATION REQUIRED

Implementation, full automated regression, real two-model Ollama qualification, and real local runtime execution are verified. The Provider UI was verified in Thai/Dark and English/Light through actual qualification requests. The browser session expired while entering Builder, before the remaining end-to-end UI acceptance could be completed. No credentials were read, created, changed, or sent to the assistant. Sign-in has been requested from the user; no complete product acceptance is claimed.

## Baseline and scope

- Studio initially clean on main at `6fd567422194fee4481a7bfbd8d94dd43e373e49`, already published v0.1.3. The prompt's expected v0.1.2 baseline was older than the actual repository.
- Core initially clean on main at `a1315a4f3d9498005522fd233c4e4cd6f849b0d7`; its runtime baseline tag remains `f01856b99a079c01e00c60988d3657819c95a188`.
- Studio's editable development dependency and Compose sibling build context consume the actual separate Core source. No Core implementation was vendored into Studio.
- Core changes were explicitly authorized for this defect. Necessary adapter changes were established by real native-format rejection before implementation. Core is now intentionally modified, not clean. A final adapter guard additionally tests malformed caller configuration without contacting a Model; valid native request mapping is unchanged.
- No commit, tag creation/movement, push, or publication was performed. HEAD SHAs above are unchanged and exclude the uncommitted working patches.
- No changes to permissions, authentication, execution architecture, API versions, orchestration routing, review bounds, Learning, A2A, distributed execution or case studies.

## Historical evidence preserved

Original database: one connected Ollama Provider, two Trees, two failed Runs, three users, one Secret and four Tools. Secret values and encrypted material were not exported.

| Historical Run | Model | Events | Observed failure |
| --- | --- | ---: | --- |
| `1d4f4199-7685-4c34-9545-9e52ae1c072d` | gemma4:e4b | 23 | Root planning succeeded, then triage failed schema validation twice and exhausted repair. |
| `fa505b75-152b-4fa3-aa76-a781db1b6a7b` | qwen3:1.7b | 97 | Reached decomposition, Specialist work and Manager reviews; final review failed JSON parsing twice. |

`b4f883b9-bcda-402d-bd51-6610798b60bd` was absent; its contents were not fabricated. Historical rejected model answers and detailed missing-field reasons were not persisted. An exact missing field cannot be inferred retrospectively from the coarse failure class.

Pinned versions contain distinct, correct Root/Manager/Specialist bindings. Repeated Specialist entries were caused by ExecutionInspector deriving its binding list only from repeated Specialist subtask results. Persistence was not repaired or rewritten.

`checks/initial-database.json`, `final-database.json` and `preservation-check.json` prove all inventoried original resource IDs remain, all original Agent configuration hashes match, and both historical failed event lists/payload hashes are identical. Qualification metadata and the Provider's connection-check time changed as intended. Two explicitly named acceptance Trees and their Runs are retained for inspection; no original Tree was rebound or deleted.

## Root cause and fix

Multiple causes were distinguished:

1. Core's Ollama adapter rejected neutral `response_format` and advertised no structured capability. Real calls to both installed Models reproduced this rejection before the fix.
2. Runtime used unconstrained control responses while Studio's old qualification used a short `think=false` OK-generation probe. Generation success was presented as orchestration readiness.
3. Models vary in semantic routing and task quality even after transport is corrected. Gemma's decomposition probe did not demonstrate registered capability selection; this remains a genuine Limited result.
4. Human repair summaries lacked decision-level correlation, and binding presentation omitted Root/Manager while repeating Specialist results.

The fix adds transport schemas for the existing contracts, an Ollama native-format mapping, safe diagnostics and decision IDs, actual strategy qualification, compatibility guidance and correct pinned binding presentation. It does not choose targets or alter runtime decisions on behalf of a Model.

## Canonical contracts and normalization

- Root planning: boolean `delegate`; direct responses still require valid nonempty `direct_output` when delegation is false.
- Triage: nonempty `objective`, capability array validated against registered Manager scope.
- Decomposition: subtask objectives and required capabilities validated against the owning Manager's Specialist scope.
- Manager/Root final reviews: exact `pass`, `revise`, or `fail`, with feedback.
- Existing collaboration reference and authorization checks remain authoritative.

Accepted representations: one canonical JSON object, one complete JSON fence (case-insensitive JSON tag), or one fenced payload surrounded by prose without competing JSON container delimiters. Provider SDK envelopes are unpacked by existing adapters. Only the answer channel is parsed.

Rejected representations: ambiguous prose, multiple payloads, duplicate keys, arrays in place of the decision object, NaN/Infinity, arbitrary wrapper objects, unsupported enum casing/values, missing fields and unknown capabilities/targets. No capability, target, delegation, review result or revision is invented. Native JSON schemas constrain representation; existing strategy validators retain semantic authority.

## Repair and Technical diagnostics

The existing maximum of one repair per independent decision is unchanged. Repair receives the original contract/registered choices plus an allowlisted reason and optional field name. Rejected raw model output is not added to diagnostics or ordinary UI.

New events include a stable UUID `decision_id` across attempts/repair of one invocation, `strategy`, safe failure class and reason such as `malformed_json`, `object_required`, `missing_required_field`, `invalid_enum`, or `unknown_capability`. Safe known field names are allowlisted. Provider failure class names remain safe diagnostic data.

Automated tests prove invalid→repaired→valid, invalid→still-invalid controlled failure, and independent decision A repaired then decision B unrepaired with different IDs and bounded requests. Actual new local Runs did not exhibit a structured-decision repair; no real repair screenshot is claimed. Historical raw event rows remain unchanged.

Human Trace now names decision-validation and each repair outcome with the corresponding strategy. Recovery classification prefers decision IDs and retains a conservative legacy phase fallback. A later unrepaired decision cannot be summarized as overall repaired success. Failure ordering is considered rather than merely checking for any repair/failure anywhere.

## Ollama environment and actual qualification

Ollama **0.34.4**. Existing Models only: **qwen3:1.7b**, 1.4 GB; **gemma4:e4b**, 9.6 GB. No models were pulled. Existing Provider `test` (`79d3f0d4-51f5-4f5c-a465-6f387fe080c4`) uses `http://host.docker.internal:11434`, with no Secret binding. Current connection test succeeded.

The Core adapter uses `/api/generate`. Neutral JSON-object requests map to `format=json`; neutral JSON-schema requests map to native schema `format`. Structured control requests use `think=false`; normal text-generation behavior is retained. Thinking/reasoning is excluded from retained raw diagnostics. Unsupported optional configuration and malformed native-format objects are rejected with a typed error before generation; no Model name is special-cased.

Verification first tests normal generation, then six synthetic checks using actual Core strategy validators: Structured Output, Root planning, triage, decomposition, Manager Review and Root Final Review. Routing probes must demonstrate the registered comparison capability. Schema-valid empty routing does not demonstrate that qualification responsibility. Transport interruptions remain transient, not permanent negative capability claims.

| Model | Generation | Structured Output | Planning | Triage | Decomposition | Manager Review | Final Review | Persisted status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| qwen3:1.7b | Passed | Passed | Passed | Passed | Passed | Passed | Passed | AgentTree Ready |
| gemma4:e4b | Passed | Passed | Passed | Passed | Failed: routing not exercised | Passed | Passed | Limited |

Actual individual qualification buttons were used in the authenticated browser against fresh Docker. Evidence/last-check timestamps persist in existing metadata; `checks/qualification-and-fixtures.jsonl` records exact results. Initial adapter-level qwen decomposition did not demonstrate routing, while a subsequent explicit recheck and the actual Studio check passed. This variability is documented rather than hidden by extra automatic retries. Small probes are compatibility evidence, not a reliability guarantee. The synthetic final-review probe uses an empty aggregate to test contract/enum/feedback validation, without demanding PASS; the successful qwen full runtime supplies separate real hierarchy/review evidence.

Root checks: planning, triage and final review plus structured output. Manager checks: decomposition/review plus structured output. Specialist generation is checked; Tool/MCP calling and arbitrary task quality are not certified. Gemma's Root probes passed despite its overall Limited classification and unqualified Manager routing probe.

Qualification evidence is versioned inside existing Model metadata. All six named passed checks plus generation are required for effective Ready; an old OK-only status or incomplete/failed evidence cannot masquerade as Ready. Failed re-verification removes stale decision evidence but retains catalog metadata. Discovery retains its existing invalidation lifecycle. Verification remains explicit; normal navigation does not call Models.

Dashboard/onboarding/Template Ready readers use the same effective evidence. No Template feature or Dashboard redesign was added. Guided Template recommendations continue requiring Ready Models. Limited remains available for intentional expert testing in the ordinary Builder/runtime path; hiding or downgrading a Model never replaces existing Tree bindings.

## Real runtime evidence (not browser-triggered)

Runs below were created with actual Studio `RunService.test_run` and the actual Core runtime from Docker, using synthetic comparison input. No transport/model response was mocked, no injected runtime adapter or artificial failure was used. Because authentication expired, these are **service-level real runtime acceptance**, not completed Playground browser acceptance.

| Tree | Run | Lifecycle / Core outcome | Duration | Durable events |
| --- | --- | --- | ---: | ---: |
| `ca2701cb-f016-4c73-979d-db7baa1aec24` — qwen3 | `8388eaaf-ff02-4cf4-8a40-ccbb77532de7` | Completed / completed, success true | 50.697 s | 146 |
| `d49f723f-76db-4460-8aea-ed07b022ef9c` — gemma4 | `223e6174-c25a-43fa-8c3b-891481483ffc` | Completed / **partial** | 952.439 s | 165 |

Qwen's durable trace contains Root planning, triage, Manager discovery/decomposition, four Specialist executions, four passed Manager reviews, passed Root Final Review and completed Final Synthesis. All expected hierarchy stages and all three actual Agent IDs were verified from persisted events. The final recommendation/result is available. Configured Provider/Model IDs remained local throughout.

Gemma executed Specialists and valid reviews, including two revision requests and a failed Manager review. Final review and synthesis completed, but the Core outcome is **partial**, so it is not reported as full successful hierarchy acceptance. It did **not** produce an unrepaired structured-decision error in this new Run. Expected Limited-model structured failure is therefore **NOT AVAILABLE** in this attempted case; a failure was not manufactured to create evidence. Historical failures and automated strict failure/repair coverage remain available.

Both new Runs, outputs, event counts and pinned bindings survived container recreation and were read again from PostgreSQL. Browser reload/inspection acceptance remains pending authentication. Safe phase/binding evidence is in `checks/runtime-evidence.json`; full synthetic Run traces are in `local-full-run.json` and `local-limited-run.json`.

## No silent fallback / cloud regression

No fallback code was added. Both actual runtime configurations bind every Agent to the original Ollama Provider and the exact selected native Model. Runtime factory selection and durable binding/event evidence were inspected. No cloud Provider was created, no cloud credential revealed or used, and no task data was sent to cloud.

There is no currently configured cloud Provider. An existing Secret named gemini was preserved but not presumed valid or used to reconstruct a deleted Provider. The conditional real Gemini/cloud regression is **BLOCKED: no already-configured cloud Provider**. Core live-provider tests explicitly skip absent Gemini/Groq/OpenRouter/Cerebras credentials. Existing adapter/interface regression remains covered by the full automated suite.

## UI and browser acceptance

**Verified in real browser:** authenticated admin Provider page, legacy generation-only Models shown Limited, per-Model qualification requests, qwen Ready vs gemma Limited, last-check times, expanded safe evidence, Thai/Dark and English/Light, live locale/theme switching. Screenshots were captured and visually inspected. No credential values appeared. Console warn/error inspection returned an empty list; final captured output is in `checks/browser-console.json`. The latest frontend was reloaded and left at Sign In with empty fields (`04-manual-authentication-required.jpg`).

**Pending:** Builder Root/Manager/Specialist selectors and role-specific warnings; preserving saved Limited/unavailable bindings in rendered forms; save/Ready→Playground browser submission; Human/Technical Trace and pinned bindings on real historical/new Executions; browser reload persistence; those views in both themes/locales and narrower desktop layout.

The selected session created at 03:11 UTC expired at 15:11 UTC under existing 12-hour session semantics. The page returned to Sign In while opening Builder. Other stored session records were not used to obtain credentials or bypass sign-in. No authentication change was made. The user was asked to sign in through the browser; the session is still unauthenticated at this report's closure point.

Automated frontend tests cover role-specific Limited warnings, saved selections without change callbacks, no-fallback copy, unavailable diagnostics, malformed/incomplete evidence safety, EN/TH, independent repair outcomes and pinned role binding de-duplication/Secret sentinel exclusion. Actual DB inspection verifies the pinned Root/Manager/Specialist identities. These do not replace the remaining real UI checks.

## Docker, migrations, logs and performance

The requested `down`, `build --no-cache`, `up -d --force-recreate` sequence was executed with existing named volumes preserved. A second clean build included consistency fixes; the final Ready-reader updates were rebuilt and recreated after all actual Runs finished. The final malformed-format adapter guard was then built into the backend image, the backend recreated, and health, migration head and preserved database evidence checked again. No `down -v`, prune or database reset was used.

Final PostgreSQL, backend and frontend are healthy. Migration current and head both **0014_resource_history**; no new migration/table. Existing credentials and encrypted storage volumes were retained.

Backend/frontend logs were captured after final recreation, with no unexplained 500/traceback/crash found. Backend access logging is not present after its existing migration logging configuration; direct browser network/HAR capture is not exposed by current tools. Browser warn/error logs were inspected, but **full browser failed-request/network inspection is not claimed**. Finish that check with remaining authenticated acceptance where tooling permits; retain this limitation explicitly.

Normal UI navigation reads stored compatibility data. Per-Model action uses existing atomic verification claim to avoid duplicate concurrent checks. Qualification calls are bounded, transport interruptions stop subsequent probes, and discovery does not synchronously call Models on page render. Gemma's actual full Run was slow (15.87 minutes); no Model download, retry-budget increase or fabricated progress was used to hide this limitation.

## Engineering verification

| Check | Actual result |
| --- | --- |
| Core source full suite (`PYTHONPATH=src`) | **748 passed, 5 skipped**, 31.68 s; skips are unavailable real cloud credentials. |
| Studio backend full suite | **353 passed**, 56.87 s after the final adapter guard; one existing Starlette cookie deprecation warning. |
| Frontend full suite | **349 passed**, 52 files. |
| TypeScript | Passed (`tsc -b` in production build). |
| Production frontend build | Passed; existing >500 kB chunk advisory remains. |
| Both repositories `git diff --check` | Passed. |
| Docker final stack | All three services healthy. |
| Migrations | `0014_resource_history`, current=head. |
| Original database preservation | YES; resource IDs, original Agent hashes and historical event hashes verified. |
| Core changed | YES, explicitly scoped and authorized. |
| Studio HEAD | `6fd567422194fee4481a7bfbd8d94dd43e373e49`, uncommitted patch. |
| Core HEAD | `a1315a4f3d9498005522fd233c4e4cd6f849b0d7`, uncommitted patch. |
| Published | NO; tags/heads unchanged. |

Logs of actual full suites/builds are under `checks/`. One unprivileged focused Template test attempt stalled at external/local-tool access and was cancelled; the complete authorized suite covers those tests and passed. An earlier Core timing-sensitive test failed during concurrent heavy workloads; full source tests passed on subsequent runs without changing that test or dropping coverage. An initial stale installed Core test attempt was corrected to test `PYTHONPATH=src`; the results above are for actual modified source.

## Required acceptance matrix

| Requirement | Status / scope |
| --- | --- |
| Provider-neutral normalization | VERIFIED — focused/full tests and actual Ollama wire-format acceptance. |
| Semantic validation | VERIFIED — strict schema/reference tests; real native contracts used by both Models. |
| Repair path | VERIFIED — automated decision A/B correlation and bounded success/failure coverage; no new real repair observed. |
| Ollama real test | VERIFIED — both installed Models, actual generation/qualification/runtime. |
| Model qualification | VERIFIED — real persisted Ready/Limited evidence and real Provider UI. |
| Role compatibility UI | BLOCKED — real Builder UI awaiting sign-in; component tests pass. |
| Provider UI | VERIFIED — real EN/TH, Light/Dark qualification and evidence. |
| Builder warning behavior | BLOCKED — real form acceptance awaiting sign-in; component tests pass. |
| No silent cloud fallback | VERIFIED — code, actual selected local bindings and execution evidence. |
| Human-readable failure Trace | BLOCKED — real browser acceptance awaiting sign-in; automated stage/correlation tests pass. |
| Technical Trace diagnostics | BLOCKED for real browser inspection; safe durable diagnostic schema/events tested. |
| Execution binding display | BLOCKED for real browser inspection; persisted identity audit and component de-duplication tests pass. |
| Successful full hierarchy local Run | VERIFIED — qwen Run, 146 events, completed Core outcome. |
| Expected Limited-model failure | NOT AVAILABLE — new gemma Run was partial, not an unrepaired structured failure. |

## Files changed

### Studio

- `backend/api/dashboard.py`
- `backend/schemas/provider.py`
- `backend/services/dashboard_service.py`
- `backend/services/model_discovery_service.py`
- `backend/services/model_qualification.py`
- `backend/services/provider_service.py`
- `backend/services/runtime_builder.py`
- `backend/services/template_setup_service.py`
- `backend/services/tree_service.py`
- `docs/provider-model-compatibility.md`
- `frontend/src/components/execution-inspector.tsx`
- `frontend/src/components/human-execution-trace.tsx`
- `frontend/src/components/model-compatibility.test.tsx`
- `frontend/src/components/model-compatibility.tsx`
- `frontend/src/components/run-status-badge.tsx`
- `frontend/src/components/tree/agent-form.tsx`
- `frontend/src/components/tree/provider-model-selector.test.tsx`
- `frontend/src/components/tree/provider-model-selector.tsx`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/provider-models.ts`
- `frontend/src/lib/run-presentation.ts`
- `frontend/src/lib/trace-activity.ts`
- `frontend/src/locales/en/translation.json`
- `frontend/src/locales/th/translation.json`
- `frontend/src/pages/providers.test.tsx`
- `frontend/src/pages/providers.tsx`
- `tests/test_model_qualification_failures.py`
- `tests/test_onboarding.py`
- `tests/test_provider_management.py`
- `tests/test_resource_persistence.py`
- `tests/test_structured_model_qualification.py`
- `tests/test_template_setup.py`

### Core

- `src/agenttree/core/decision_contracts.py`
- `src/agenttree/core/structured_output.py`
- `src/agenttree/exceptions.py`
- `src/agenttree/providers/ollama.py`
- `tests/test_provider_neutral_decisions.py`
- `tests/test_structured_decision_repair.py`

## Remaining closure actions

1. User signs in to the current Studio browser; credentials stay outside this chat.
2. Continue the existing isolated qwen/gemma Trees: inspect all three role selectors, Limited warnings and retained bindings; save intentionally if needed.
3. Submit an actual Playground Run via browser and correlate its ID to Execution/Human/Technical Trace.
4. Inspect historical failed Runs and new completed/partial Runs, role bindings and persisted diagnostics; reload and verify again in EN/TH, Light/Dark.
5. Inspect available browser request/error evidence and final logs, capture the remaining genuine screenshots, then update this report's matrix honestly.

Do not mark COMPLETE, publish, tag, or begin another feature before applicable closure acceptance. No screenshots of unobserved states were fabricated.
