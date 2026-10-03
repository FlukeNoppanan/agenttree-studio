# Playground real runtime certification and closure

**Current status: COMPLETE — model qualification UX, configured Provider health, and real runtime reliability acceptance passed on 2 October 2026.** Section 17 records the current result: a real smoke Run followed by five sequential successful hierarchical Gemini Runs, Manager Review, Root final review, persisted FinalResult/Trace/artifacts, browser reload, complete test suites, and the evidence-backed Groq adapter correction. The earlier Groq rate-limited sequence and its real structured repair in section 16 remain historical evidence; its partial decision is superseded by section 17. Sections 1–15 retain the earlier Artifact/runtime certification.

Verified on 2 October 2026 against the preserved local Docker database and configured Gemini Provider. The final closure Run `30c5fc01-cbc3-41e9-a988-e7af53ad6ac4` reached Core **completed**, with `FinalResult.success=true`, 141 durable events, successful routed Agent outcomes and two persisted artifacts. The focused real Artifact Run also completed with a verified 39,342-byte report. **Playground real runtime certification is complete.**

Sections 1–14 preserve the previous certification pass and its historical partial result. Section 15 records the subsequent fix, final acceptance and current engineering results; the earlier partial Run remains unchanged in storage.

## 1. Initial repository state and scope

- Studio: `/home/fluke/Agenttree-Studio`, HEAD `4086b80`. The checkout already contained substantial changes from prior verified phases. They were preserved; no commit, reset or broad rewrite was performed. At closure, those changes and current changes are largely staged.
- Core: `/home/fluke/Agenttree`, initial HEAD `1f9649e4f9c10bc38defdf1e3fef70bebf95df99`, initially clean.
- The current request explicitly superseded the prior Core-unchanged restriction and authorized evidence-backed Core fixes. Core is now intentionally modified and its full suite passed.
- Existing Builder, onboarding, RBAC, V1/V2, Webhook, destinations, Runs and Playground were reused. No redesign, new orchestration, Learning, A2A, distributed execution, conversation memory or new API was introduced.

## 2. Existing runtime architecture

1. Cookie-authenticated `POST /api/studio/runs` validates the explicit Tree and current ready configuration, persists a queued Run, and returns its real ID with HTTP 202.
2. A Studio background worker builds the pinned TreeVersion through `RuntimeBuilder`, starts Core `ExecutionRuntime`, and persists journal events, final state, usage, metrics, result and artifact metadata through the existing Run service.
3. Studio Run ID equals Core execution ID. Agent UUIDs from the pinned version map directly to Builder node UUIDs; names and array positions are not used as execution identity.
4. `GET /api/studio/runs/{id}/events` exposes durable ordered events. The existing SSE endpoint `/stream?after=N` replays those events and emits transient output separately. Existing Last-Event-ID support was retained; the real reconnect probe used the explicit `after` cursor.
5. Cancellation uses the existing endpoint and Core cancellation control. `cancellation_requested` and terminal `cancelled` remain distinct.
6. Results and artifacts use existing endpoints. Artifact bytes remain in the durable file store; no duplicate Playground store exists.
7. Browser reload reattaches to persisted Runs. The process-local worker/runtime registry does **not** promise active execution recovery after a backend process restart. Completed result, Trace and artifact persistence are separate from active worker recovery.

## 3. Failure A: Provider execution failed

The original failed Run was `c835fbcf-6539-46cd-8410-ae10c7adafc0`; its saved configuration used the historical preview model. Its durable data contained only the normalized provider failure, not the original SDK exception chain. Therefore the exact original exception cannot be recovered retrospectively from those records.

A fresh non-sensitive diagnostic using the historical configuration reproduced an actual **httpx.ReadTimeout** at Root provider planning under the SDK adapter's 15-second default. This is direct reproduction evidence, not a claim that the missing original exception was found in storage.

Changes:

- Studio constructs Gemini generation with a 60-second request timeout. Existing Run deadlines and cancellation remain in force.
- Core normalizes httpx timeout subclasses to `ProviderTimeoutError` without exposing SDK messages.
- Background failures preserve a safe class name; Studio now recognizes that class name as well as an exception instance.
- Existing provider timeout/rate-limit/model-not-found/invalid-request codes were added to the public Run enum so a classified error does not produce a response validation failure.
- Structured decision failures and final review failures now provide safe guidance toward configuration/Execution Trace.

A real model-discovery/smoke request succeeded. Later real 503/unavailable and 429/rate-limit outcomes were also observed and safely reported. No fallback Provider, forced routing or retry engine was added.

An automatic approval review rejected replay of the original persisted input because it could export sensitive data. That input was not replayed; diagnostics used newly authored non-sensitive input. A later approval-review timeout on a read-only outcome probe was retried once through a narrower safe probe.

## 4. Failure B: stale Manager collaboration peers

Root cause: saving replacement configuration on a Ready Tree generated fresh Agent UUIDs and remapped parents/tool assignments/template identity, but left `settings.allowed_manager_peer_ids` pointing at prior-version Manager UUIDs. Readiness did not validate those peers, so a Tree could appear Ready and fail runtime preflight.

Fixes:

- A shared `invalid_manager_peers` contract is used by readiness and runtime validation.
- Peers must be a list of distinct string IDs referencing other Managers in the **same version**. Self, Root, Specialist, unknown/stale IDs, malformed lists and duplicates are rejected.
- Ready configuration replacement remaps known peer IDs with the same Agent-ID map used for the rest of that version. Unknown IDs are not guessed or silently repaired; validation rejects them.
- Existing General Analysis peer intent was recovered using historical portable Template keys and repaired through the normal configuration API, producing v6. No display-name inference or in-place historical version mutation was used.
- The old General Analysis version `c5acf779-718d-468b-9f32-f094553407b9` was compared with its saved snapshot after repair and remained identical.
- Model readiness and runtime preflight require an available, generation-candidate, qualified discovered Model. Missing credentials/custom-provider URL checks were aligned with runtime requirements.

Real positive case: General Analysis and the disposable two-Manager Tree passed validation and entered actual execution. Real negative case: a disposable Manager peer referencing Root was blocked from Ready and its Run request returned HTTP 409 before worker submission. A valid Draft was shown as fully configured **Draft**, with execution disabled until marked Ready.

Configuration permits controlled collaboration; Gemini did not request a peer collaboration exchange in the recorded final Run. Acceptance here proves valid/invalid collaboration configuration and real multiple-Manager execution, not a fabricated live collaboration exchange.

## 5. Additional proven provider/Tool boundaries

### Gemini Artifact schema

The actual provider rejected legacy OpenAPI `parameters` containing JSON Schema `additionalProperties` with HTTP 400. Core Gemini declaration generation now deep-copies declarations and uses `parameters_json_schema`. Caller declarations, native model tool content and thought-signature handling remain intact.

### MCP primitive union schema

The existing safe `sequentialthinking` MCP schema declares fields such as `nextThoughtNeeded` as `type: ["boolean", "string"]`. Core's scalar-only validator attempted dictionary membership with that list and raised `TypeError: unhashable type: list` before Tool execution. This was reproduced in real Core execution.

The validator now accepts explicitly declared primitive type unions while rejecting malformed/unknown types. Authorization, bindings, call/byte budgets, credentials and complex unsupported schema rules remain unchanged. The corrected real MCP Run reached Root planning, Manager decomposition, Specialist execution, two successful `sequentialthinking` calls, Manager review, Root review and synthesis.

### Remaining General Analysis argument boundary

The final General Analysis executions still recorded generic `ProviderRuntimeError` failures in Analysis Specialist and failed Artifact Tool activity. A targeted real Thai generation using the same configured Specialist, Model and Tool declaration returned a function call with **17,468 UTF-8 bytes** of arguments and was rejected with `ProviderRuntimeError: Provider tool call exceeded size limit` against the existing 16 KiB guard. A shorter English diagnostic returned one function call of 9,208 UTF-8 bytes without that rejection.

This reproduces a real argument-size failure at the same boundary. The precise SDK exception/arguments for each earlier persisted generic failure were not retained, so this is not asserted to explain every earlier failure. The failed Artifact Tool event also lacks enough retained error detail to establish its individual cause. Limits were not relaxed, output was not truncated into fake success, and original Tool bindings were preserved.

**Remaining acceptance gap:** a clean General Analysis execution with all legitimately routed work successful is not demonstrated. Budget-aware artifact generation and safe diagnostic specificity at that boundary remain to be resolved and re-certified.

## 6. Real execution evidence

Configured Provider: existing `gemini`, ID `829a2753-2240-4401-8d91-a4ea0a8562d7`. General Analysis kept `models/gemini-flash-lite-latest`; SDK discovery reported its current model version as `gemini-3.5-flash-lite`. Credentials and existing model selections were not changed.

General Analysis remains Tree `4aa0304a-ba85-4867-a419-e3823b340c1b`, v6 `4433bb32-02f6-4414-a6ae-86d537f95693`. It still has Analysis Lead, Research Manager, Synthesis Manager, Research Specialist, Analysis Specialist and the original Artifact Output binding.

The required Thai prompt was entered and submitted from the **actual Playground**:

> วิเคราะห์ข้อดีและข้อเสียของการนำ AI มาใช้ในมหาวิทยาลัย
> โดยพิจารณาทั้งด้านการเรียนการสอน ประสิทธิภาพของนักศึกษา
> ความเป็นส่วนตัวของข้อมูล และความเสี่ยงจากการพึ่งพา AI มากเกินไป
> จากนั้นสรุปเป็นข้อเสนอแนะ 5 ข้อสำหรับมหาวิทยาลัยที่ต้องการนำ AI
> มาใช้อย่างเหมาะสม

Latest retained Run: **`be15f651-5995-4f57-b8da-dd96bd8b9d58`**.

- Studio terminal status: `completed`; Core FinalResult status: **`partial`**.
- Persisted duration: **51,505 ms**; UI elapsed display approximately 51.6 s.
- **101** durable events; real nonempty Thai FinalResult with five recommendations.
- Root planning, both Manager decomposition paths, Research Specialist successful execution, Analysis Specialist activity, Manager reviews, Root final review and synthesis were recorded. Some Specialist attempts failed; those failures were not erased.
- Playground, Run detail and full Execution Trace were correlated to this same ID. Reload recovered the same input/result, final graph and timeline.
- Final output is retained for inspection. Earlier disposable certification Runs were deleted only after evidence capture.

Historical objective-missing behavior was explicitly checked against current Core decision prompts/contracts and real Root/Manager outputs. It did not recur in these actual hierarchical Runs. No artificial objective fallback or Core orchestration change was introduced.

### Observed Run matrix

| Scenario | Run ID | Studio / Core outcome | Duration | Events | Result / artifacts |
|---|---|---|---:|---:|---|
| Hierarchical diagnostic, Tools isolated | `9586ab3a-88a7-42de-a214-9ba16cd35854` | failed / — | 81147 ms | 67 | no / 0 |
| First General Analysis acceptance | `5bc5b2cd-723c-4f52-b458-6ea83a96d712` | failed / — | 160228 ms | 148 | no / 0 |
| Root direct response (Managers configured, idle) | `cbcf6cf6-8327-4266-af41-a220eaf4b6ef` | completed / completed | 6546 ms | 15 | yes / 0 |
| MCP before union fix | `39950a51-42d7-4a2f-8a81-74c115f68c5d` | failed / — | 28364 ms | 124 | no / 0 |
| MCP after union fix | `eec7386f-2a15-4fe2-b713-54857b75f51b` | completed / completed | 20424 ms | 65 | yes / 0 |
| General Analysis provider rate limit | `0a46bae4-005c-4ff6-b19f-05bd73c2cd89` | failed / — | 23872 ms | 61 | no / 0 |
| Real cancellation | `57abc6b3-628b-43b4-9c65-d1247c76ffad` | cancelled / — | 34512 ms | 52 | no / 0 |
| Earlier General Analysis partial result | `1c7fabed-0dec-43bd-8fda-28724834869b` | completed / partial | 55490 ms | 113 | yes / 0 |
| Real Artifact declaration | `e5faf2b9-13c0-4910-8fc2-f2848d4b9c90` | completed / completed | 2027 ms | 23 | yes / 1 |
| Latest General Analysis acceptance | `be15f651-5995-4f57-b8da-dd96bd8b9d58` | completed / partial | 51505 ms | 101 | yes / 0 |

Root-only in this matrix means the real direct-response branch with configured Managers left idle. Studio's structural requirement for a Root, Manager and Specialist was not weakened to mark the existing Root-only Blank Tree Ready. Root→Manager stages and full Root→Manager→Specialist paths were observed in genuine hierarchical Runs; no unsupported Manager-only execution mode was invented.

## 7. Tool, MCP and Artifact verification

- The safe existing MCP connection `test` exposed `sequentialthinking`. The corrected Run had actual authorized/started/completed Tool events and provider continuation, not merely a committed journal operation. Arithmetic result 391 was displayed with Core `completed`.
- The configured Basic Tool MCP exposing file-edit/move Tools was not invoked. Existing Tool records were never cloned or changed for certification.
- A disposable Tree bound the existing Artifact Output Tool to Root and requested exactly one safe `operation=none` text artifact. The real Run completed with a staged/committed artifact `certification.txt`, **24 bytes**, content `Runtime certification OK`.
- Artifact metadata appeared in Playground. The actual stored bytes were read through `RunService.artifact_content` and SHA-256 validated against persisted metadata. This artifact was marked intermediate/history; it was not falsely described as a final selected artifact.
- General Analysis partial Runs produced no durable artifacts. Their failed Tool activity is recorded separately from the positive Artifact test.
- Disposable artifact directories were removed by the exact tracked Run IDs. Original artifact directories and global Tools were preserved.

## 8. Background execution, live graph, SSE and cancellation

- Real Runs returned HTTP 202 before execution settled and continued through the existing worker/runtime.
- The reused read-only Builder graph displayed real Root, Manager and Specialist activity and settled after completion. Queued/operation/review/revision/synthesis states came from actual events, with stable version Agent UUIDs.
- One real cancellation was requested through UI during active hierarchical execution. The backend confirmed terminal `cancelled`, persisted 52 events and no fabricated FinalResult. Cancellation requested is not treated as immediate success.
- Real SSE connections were interrupted after IDs 1–8 and reattached with `after=8`, returning IDs 9–16, ordered and duplicate-free, HTTP 200 on both connections.
- Latest Run terminal replay returned IDs 96–101 with `output.final.available` and `run.completed`, exactly matching durable Trace sequences. All 101 durable sequences were unique and ordered.
- Screenshots prove observed node states/timeline, not motion. Brief edge pulses were too short to capture conclusively in isolation; inspected idle/historical edge classes did not show permanent animation. Existing event mapping and reduced-motion tests passed. No fake edge event was injected.
- Completed Runs survived actual reload and reopening after browser-tool reconnection. Backend restart recovery of an active Run was not claimed or simulated.

## 9. Test matrix and error experience

| Requirement | Evidence |
|---|---|
| Root direct execution | Real Gemini Run, 15 events, Core completed |
| Root→Manager and full hierarchy | Real General Analysis and fully completed MCP hierarchy |
| Multiple Manager candidates | Real General Analysis, both Managers executed |
| Valid/invalid collaboration | Real positive preflight + real 409 negative case; regression tests for all reference classes |
| Stale peers/version/template behavior | New version snapshot/remap/rollback/Template round-trip tests; real original repair |
| Provider failure | Real timeout reproduction, unavailable/rate-limit Runs, safe typed propagation tests |
| Invalid Model/configuration | Qualified/available/generation-candidate regression tests, invalid real collaboration gate |
| Tool execution | Actual Artifact and MCP calls, persisted successful Tool events |
| Background, SSE, final result, Trace | Actual 202 Runs, stream replay, same-ID result/Trace/reload |
| Cancellation | Actual cancel endpoint/UI and persisted cancelled execution |
| Ready/Draft/invalid | Real ready General Analysis, valid Draft guidance and invalid Tree rejection |
| Objective contract | Existing contract/tests inspected and real current hierarchical decisions succeeded |

Playground now distinguishes valid-but-Draft from executable Ready, and invalid readiness includes backend blockers. No independent frontend readiness algorithm was added. Safe provider error types remain separate. The remaining oversized-Tool failure is still a generic provider outcome at the public boundary and is explicitly disclosed above.

## 10. Engineering checks

- Studio backend: **288 passed** (267 baseline + 21 new runtime boundary tests). One existing Starlette cookie deprecation warning.
- Frontend: **249 passed**, 37 files. Existing readiness-copy expectation updated; no test coverage removed.
- Core: **692 passed, 5 skipped**, including 16 new regressions. Executed with `PYTHONPATH=src` to test the modified source, not the previously installed wheel. Initial sandbox transport/import issues were resolved for the full final run.
- TypeScript: passed, `npx tsc -b`.
- Production build: passed, `npm run build`. Existing large-chunk warning remains; no graph/dependency redesign was added.
- `git diff --check`: passed for the working-tree changes. Core diff check passed. `git diff --cached --check` additionally reveals pre-existing whitespace in prior verification log evidence (listed in checks/diff-check.txt). Those unrelated staged logs were not rewritten.
- Docker backend/frontend rebuilt with the corrected Core. All three services healthy at final inspection. PostgreSQL remained the same container/volume; no reset or Compose volume removal.
- Alembic current and heads: **0013_run_cancellation_status (head)**. No new migration for this task.

Docker now installs the **separate sibling Core package** using the `agenttree_core: ../Agenttree` additional build context. Core source is not vendored into Studio. Rebuilding this local Studio stack requires the sibling Core checkout; packaging/releasing these Core fixes for independent downstream checkouts remains a follow-up.

## 11. Browser, network and log inspection

- Actual Chromium/in-app browser exercised the real existing Playground and Builder. Light/English and Dark/Thai result, graph and Trace were checked. Technical terms and current visual identity were retained.
- Browser console captured no warnings/errors during the final inspected flows. A browser-tool connection changed between turns; a fresh tab reopened the persisted Run using the existing authenticated cookie. The temporary tab was closed before cleanup.
- Actual HTTP/service probes covered Run acceptance, status, result, events, artifacts, cancellation and SSE. Expected invalid Tree 409 and observed provider failures are explained. No backend enforcement was bypassed.
- Direct DevTools network capture was unavailable in this browser API. The HTTP/SSE probes and durable correlation provide transport evidence; this is not a claim that a complete HAR was captured.
- Final backend log capture: 723 lines, informational startup/health/migration messages; no Traceback, Internal Server Error, unhandled/uncaught/serialization/migration-failure marker. Frontend capture: nine Vite startup lines, no runtime exception. Access logging is not present in this capture, so absence of HTTP 500 text is not a complete request audit by itself.
- Exact decrypted Secret values, encrypted Secret material and raw key patterns were scanned privately against captured logs and persisted certification state/results. No match was found. No credential appears in this report or its evidence files.

## 12. Data preservation and cleanup

Four named `__runtime_cert_*` Trees, their Agents/versions, nine disposable Runs, the temporary user `__runtime_cert_admin` and its sessions were deleted using normal services where available and narrowly scoped tracked-ID deletion for disposable Runs. The latest meaningful General Analysis result was retained; its temporary submitting user reference becomes null through the existing FK behavior.

Baseline hashes were unchanged for Secrets, users, API tokens, Provider connections/models, result destinations, global Tool connections, Templates, user permissions, Tree grants, Webhooks, run artifacts and idempotency records. Expected changed tables contain the General Analysis repaired version and the one retained Run/Trace/delivery. Original General Analysis history and both original Runs remain present.

Final counts: **3 users, 2 Trees, 3 Provider connections, 2 Secrets, 4 Tool connections, 3 Runs**. Evidence is in `checks/cleanup.json`. Private temporary credentials were removed after cleanup.

## 13. Files changed by this task

Studio source/test:

- `backend/services/tree_contracts.py` (new shared contract)
- `backend/services/tree_service.py`
- `backend/services/runtime_builder.py`
- `backend/providers/generation.py`
- `backend/services/run_service.py`
- `backend/schemas/run.py`
- `backend/Dockerfile`
- `compose.yaml`
- `tests/test_runtime_certification.py` (new)
- `frontend/src/pages/trees/tree-playground.tsx`
- `frontend/src/pages/trees/tree-playground.test.tsx`
- `frontend/src/locales/en/translation.json`
- `frontend/src/locales/th/translation.json`

Core, explicitly authorized and fully tested:

- `src/agenttree/providers/gemini.py`
- `src/agenttree/providers/exceptions.py`
- `src/agenttree/tools/runtime.py`
- `tests/test_provider_runtime_certification.py` (new)

Verification: this report, screenshots.md, actual screenshots and credential-free checks under `docs/verification-playground-runtime-closure/`. Prior phase reports/screenshots were preserved.

## 14. Remaining limitations and next certification step

1. General Analysis still reaches **Core partial** with Specialist/Artifact-related failures. Do not describe its Studio completed status as all-branch success. Resolve the oversized/generated Artifact argument boundary with the existing budget intact, improve safe cause visibility, then repeat the required real Playground prompt to establish a clean run.
2. Exact original Failure A exception and exact earlier oversized/failing Tool payloads were not retained. Reproduction evidence is explicitly distinguished from original forensic proof.
3. Manager collaboration exchange was not requested by the provider in these real Runs; configuration and multi-Manager execution were verified. No collaboration event was faked.
4. Process-local active Run recovery across backend restart remains unsupported. Brief directional edge motion was not independently captured; state transitions and event identity were observed.
5. Core modifications must be released/consumed as a separate package. Core is **modified**, not clean, under this task's explicit authorization; tests passed.
6. Prior staged verification logs have whitespace failures under the extra cached diff check. This task's working-tree and Core checks passed.

**Previous closure decision: PARTIALLY VERIFIED.** No further Provider calls were justified in that pass merely to obtain a favorable screenshot. The retained result and boundary reproduction identified the next work needed without masking runtime failures or relaxing safety limits. The subsequent closure is recorded below.

## 15. ARTIFACT LIMIT FINAL CLOSURE

### Scope and initial state

This pass continued the existing certification. Studio HEAD remained `4086b80` with prior staged phase work; Core HEAD remained `1f9649e4f9c10bc38defdf1e3fef70bebf95df99` with the previously authorized provider/runtime changes already present. No staging, reset, commit, visual redesign or new execution infrastructure was introduced. The request explicitly authorized the bounded Core Artifact fix. Studio frontend/backend source and the General Analysis configuration were unchanged in this pass.

### Cause and forensic limits

The original partial Run `be15f651-5995-4f57-b8da-dd96bd8b9d58` did not retain the full failing model argument object. Its exact field sizes, duplication and underlying Tool exception cannot be reconstructed. This limitation remains explicit; it is not replaced with an invented historical payload.

Current code showed a generic `max_tool_argument_bytes=16,384` guard in ToolSession and provider streaming guards, despite the built-in Artifact store supporting bodies up to `max_artifact_bytes=1,000,000`. Gemini also measured native argument objects using ASCII-escaped JSON. A newly captured real Gemini Artifact call proved the mismatch:

| Measurement | Bytes |
|---|---:|
| Actual UTF-8 report body | 39,342 |
| Serialized `content` field | 39,546 |
| Full arguments, native UTF-8 JSON | 39,696 |
| Full arguments, ASCII-escaped JSON | 78,087 |

The real call contained only `operation`, `content`, `media_type`, `type`, `path` and `name`. There was no conversation history, Agent state or Trace, no repeated whole body and zero duplicate long paragraphs. The report itself legitimately exceeded 16 KiB. This establishes **C + D + E** from the request: legitimate content size, escaping inflation and an inappropriate generic boundary for a trusted artifact-producing implementation. Schema guidance was also clarified; unnecessary context duplication was not demonstrated in the captured call.

The ordinary 16 KiB limit bounds incoming Tool JSON, parser/transport accumulation and per-call resource use before invocation. It was retained. Artifact Output already takes a content body and returns a small artifact ID/hash; there is no existing pre-upload reference contract that eliminates this input body. No upload/reference subsystem was added.

### Contract and bounded policy

The model-call path is: Artifact Tool declaration → Gemini `parameters_json_schema` → native model arguments → provider transport check → ToolSession authorization/budgets/schema and content validation → built-in FunctionTool invocation → ArtifactSession storage/journal staging → artifact ID/hash result → provider-native continuation → existing Studio Run/artifact persistence and UI. The legacy explicit ToolExecutor remains available; model calls on this path are executed by ToolSession, so it was not given a competing policy.

Only the actual `ArtifactOutputTool` implementation returned by `create_artifact_tool()` receives the separate content allowance. A Tool name, editable metadata or ordinary Tool named `create_artifact` cannot opt into it.

| Boundary | Default / behavior |
|---|---|
| Ordinary Tool arguments | 16,384 bytes, unchanged |
| Built-in Artifact body | 1,000,000 UTF-8 bytes, existing artifact bound |
| Artifact arguments excluding `content` | 16,384 JSON bytes |
| Artifact transport/parser ceiling | `6 * max_artifact_bytes + max_tool_argument_bytes` = 6,016,384 bytes |
| Artifact aggregate store | Existing 8,000,000-byte total, count and metadata/path/name quotas unchanged |

The transport ceiling derives from the maximum sixfold JSON escape expansion of a content control byte. It permits encoding overhead; it does not permit a six-million-byte artifact body. Raw JSON text is bounded before parsing; native objects use UTF-8 JSON rather than ASCII escape inflation. Both schema validation and the separate body/metadata checks run before invocation. Existing storage independently validates body size, JSON content, safe file intent and aggregate quotas.

`ProviderRequest.tool_argument_limits` supplies host-controlled per-declaration caps to Gemini and compatible streaming adapters. These are not model fields or provider SDK options. ToolSession supplies caps only for enabled, assigned declarations; unknown calls retain the generic bound. Authorization, timeout, call-count, result-size and artifact-store controls remain in force.

The schema names supported types and `none/create/modify/delete` intents, accepts supported nullable fields and explains JSON-as-text, MIME types and report-only content. Size rejections return safe actionable shortening/splitting guidance; artifact validation errors return static remediation without forwarding arbitrary exception/payload text. Model history retains legitimate artifact arguments and the small ID/hash response so continuation is consistent.

No orchestration success, partial or fatal classification code was changed. Existing failed-branch transparency tests passed, including `test_partial_and_failed_manager_outcomes_remain_transparent` and `test_failed_manager_result_is_preserved_after_final_pass`.

### Focused real Gemini Artifact acceptance

- Run: `3784cf09-94c2-4adf-a643-ac8396eb63fc`; disposable Tree: `b2d57c2a-acae-4cc5-8ee4-7db8784ccbdf`.
- Studio/Core: **completed/completed**, duration **21,088 ms**, **23 durable events**, one successful actual Artifact Tool call followed by real model continuation.
- Root producer: `4e3a296d-9c1e-4b94-a50e-8f113f6cdb3a`; configured Gemini binding `models/gemini-flash-lite-latest` (SDK response reported `gemini-3.5-flash-lite`). Provider credentials were unchanged.
- `university-ai-report.txt`: **39,342 bytes**, valid UTF-8, 40 distinct numbered Thai report sections, no repeated whole body or duplicate long paragraphs.
- SHA-256: `4b63effdea44c5e7d8dbd16c25979d05b19a91211fee99c64a78d41817f974df`.
- Stored bytes matched the captured generated body length/hash; download returned HTTP 200 and identical bytes. Actual UI list and Preview displayed the report through section 40.
- Metadata correctly recorded the Run/Root producer, `type=text`, `operation=none`, `text/plain`. This focused artifact was **intermediate/history**, not selected final output.
- The existing merged trace representation counted 36 entries; that is distinct from the 23 durable transport events. Evidence labels distinguish these counts.
- Focused Tree, Run, artifact folder and temporary user were removed after evidence capture.

Evidence: [argument/content proof](checks/artifact-focused-evidence.json), [durable event/operation proof](checks/artifact-runs-evidence.json), screenshots 30–31.

### Required General Analysis Playground acceptance

The exact Thai prompt in section 6 was submitted through the actual Playground on the original General Analysis Tree, with the existing Gemini binding and unchanged Tree configuration. Routing was not forced.

| Item | Verified value |
|---|---|
| Tree | General Analysis, `4aa0304a-ba85-4867-a419-e3823b340c1b` |
| Version | v6, `4433bb32-02f6-4414-a6ae-86d537f95693` |
| Retained Run | `30c5fc01-cbc3-41e9-a988-e7af53ad6ac4` |
| Studio / Core final status | **completed / completed** |
| FinalResult.success | **true** |
| Duration | **70,199 ms** (UI 70.2 s) |
| Durable HTTP/SSE events | **141** |
| Failed Agent branches / operation.failed | **0 / 0** |
| Result | Persisted Thai analysis covering requested domains and five recommendations |
| Artifacts | Two, one intermediate and one selected final |

Actual identity mapping in durable operations:

| Role | Agent | UUID |
|---|---|---|
| Root | Analysis Lead | `f92dd784-eb80-4b77-8539-46ffb1516436` |
| Manager | Research Manager | `a601bea4-b936-4535-b269-76e95bdafee7` |
| Manager | Synthesis Manager | `0ff944f6-57d9-484c-81f1-073fb5311428` |
| Specialist | Research Specialist | `2c7e9d72-84c2-4f55-8312-635194109599` |
| Specialist | Analysis Specialist | `e8fc6f6e-6a0e-4b2d-8873-3fcb9a8080be` |

Root planning/triage, both Manager decompositions, four routed subtask executions, a real Specialist revision, Manager reviews, Root final review and synthesis were recorded. Every routed AgentResult had `success=true`, both Manager outcomes passed and Root final review passed. Synthesis Manager legitimately requested a revision after an answer acknowledged storing a report without providing the requested report in its response. The revision succeeded and follow-up review passed. No failed phase or failure reason remained.

**Recovered Tool errors are retained, not hidden:** Analysis Specialist made five Artifact invocations. `call_60964` and `call_120309` completed and produced the two artifacts. `call_57943`, `call_104567` and `call_118480` returned `ToolExecutionError` to the model, followed by successful continuation. Their full argument objects and individual exception details are not retained in durable Trace; an exact cause for each is therefore not asserted. Existing ToolSession returns failed Tool responses to the provider, which may correct/recover within the bounded turn budget. These were recovered attempts inside successful Specialist executions, not failed required Agent branches. All attempts remain visible; no status reclassification or retry event was fabricated. There were zero `operation.failed` events.

| Artifact | Bytes | Selection | SHA-256 |
|---|---:|---|---|
| `AI_in_Universities_Analysis.md` | 15,102 | Intermediate/history | `aeb336b16e1d3ae792701a5f76cceb71576a8b0f5ec39e07b00e3cebf02f350d` |
| `ai_in_universities_analysis_report.md` | 17,203 | Final | `9ddbcbfa56109e0e1cab3b99a482cabfbfb63dac57ce89a400987155e8fd5665` |

Both artifacts are `text/markdown`, `operation=none`, produced by the real Analysis Specialist. Actual bytes, UTF-8 roundtrip and SHA-256 matched metadata, including after the final backend rebuild. No workspace file intent was applied.

Evidence: [complete outcome/review/Tool checks](checks/artifact-final-outcomes.json), [durable operations](checks/artifact-runs-evidence.json).

### Live UI, SSE, Trace and reload

The actual browser showed live Root synthesis, settled Manager/Specialist nodes, real output deltas and review/revision timeline updates. It reached Core completed with result, two artifacts and 141 events **without refresh**. Dark/Thai and Light/English views were checked. No fake progress or execution event was injected.

Open Execution Trace navigated to the same `30c5fc01...` Run. Run detail displayed final status Completed and **141/141** durable timeline events. The full merged legacy Trace has 219 entries; Core state contains 71 trace entries. These are separate projections, not conflicting claims about SSE event count. Playground → Run detail → Trace all preserve the same Run ID.

Real SSE HTTP probes used two successful connections: cursor 0 returned IDs **1–8**, then the interrupted client reattached with `after=8` and `Last-Event-ID: 8`, receiving **9–141**. IDs were ordered and unique. Terminal `output.final.available` and `run.completed` matched durable cursor 141; the real result endpoint returned completed/nonempty. An early result request before final commit returned expected 409; final retrieval returned 200. This was not treated as a runtime failure.

Returning through UI and reloading Playground recovered the same input, completed result, elapsed time, final graph, artifacts and 141-event history. Post-rebuild DB/file-store inspection again verified result and artifact integrity. Active worker recovery across backend process restart remains outside the process-local runtime contract; completed persistence is verified.

Evidence: [SSE receipts](checks/artifact-sse-evidence.json), [post-restart integrity](checks/artifact-post-restart.json), screenshots 26–29 and 32.

### Code, tests and engineering results

Core files changed in this pass:

- `src/agenttree/core/artifacts.py`: trusted Artifact Tool implementation and concise model guidance.
- `src/agenttree/tools/runtime.py`: implementation-specific bounded validation, safe remediation, declaration caps and consistent continuation/history.
- `src/agenttree/providers/models.py`: additive host-controlled argument ceilings.
- `src/agenttree/providers/_adapter.py`: shared UTF-8 measurement and cap lookup.
- `src/agenttree/providers/gemini.py`: correct native JSON argument measurement and per-declaration stream bound.
- `src/agenttree/providers/compatible.py`: consistent incremental transport bound; unknown/ordinary names remain generic.
- `tests/test_artifact_argument_policy.py`: **19 new test cases**.
- `docs/artifacts-and-streaming.md`: policy, limits and usage guidance.

Earlier Core changes in `providers/exceptions.py` and `tests/test_provider_runtime_certification.py` were preserved. Core remains a separate framework package, intentionally modified under explicit authorization; no Core source was copied into Studio.

The new tests cover small/realistic/near-boundary/exact 1,000,000-byte content; above-boundary ASCII/multibyte rejection; metadata limits; configured bounds and worst-case escaping; ordinary and artifact-named ordinary Tools; irrelevant context rejection; nullable/enum schema; Gemini and compatible transport guards; ordinary Tool non-invocation; model continuation with the real large body and small result. Content/storage identity is asserted, not just successful return status.

| Check | Final result |
|---|---|
| Full Core suite against modified source | **711 passed, 5 skipped** |
| Full Studio backend suite using modified Core | **288 passed** |
| Full frontend suite | **249 passed**, 37 files |
| TypeScript | Passed, `npx tsc -b` |
| Production frontend build | Passed, `npm run build` |
| Studio and Core `git diff --check` | Passed |
| Docker PostgreSQL/backend/frontend | All healthy |
| Alembic current / heads | `0013_run_cancellation_status (head)` |
| Database/schema migration | None added |

The existing Starlette cookie deprecation and 677.87 KB build-chunk warning remain. Core local MCP/Studio test transport required execution outside the restricted sandbox; complete final suites passed, without deleting tests or suppressing failures. The final compatible-adapter consistency change was fully tested and included in the final backend rebuild; the Gemini path used for real acceptance was unchanged by that follow-up. Core tests increased from 692 to 711. No new Studio source changes were needed for this pass.

The original PostgreSQL container/volume remained running; only backend was recreated for the final Core package. Earlier frontend remains healthy. Default working-tree diff checks pass; the extra cached diff still has previously disclosed whitespace in unrelated staged verification logs. Those historical files were not rewritten.

Evidence: `checks/artifact-{core,studio,frontend}-tests.log`, `artifact-typescript.log`, `artifact-production-build.log`, `artifact-docker-final.txt`, `artifact-migrations-{current,heads}.txt`, `artifact-diff-check.txt`, `artifact-core-status.txt`.

### Logs, credentials and cleanup

Browser console warning/error captures were empty for both final tabs. Actual HTTP/SSE probes covered events, result and Artifact download. Full browser HAR capture was unavailable; no claim of exhaustive DevTools network capture is made. Inspected backend/frontend logs before and after backend rebuild contained no unexplained traceback, crash, provider retry storm, serialization/SSE/database failure or HTTP 500 marker. Access logging is absent, so log text alone is not an exhaustive HTTP status audit.

An initial helper request during backend startup encountered connection refusal and was resumed after health readiness. A final read-only persistence probe initially used a wrong Python import path, then passed with `agenttree.config`; this was a diagnostic CLI mistake, not a backend request/500. Neither produced a product defect or additional Gemini execution. This pass used exactly **one focused Artifact Run and one final General Analysis Run**.

Decrypted Secret values, encrypted Secret material, temporary test credentials and raw key patterns were privately checked against captured certification state/results/evidence/logs; no match was found. Private credentials were never copied to report evidence. The host credential file was removed and the final container has no private test file.

Disposable Tree `__artifact_closure_report`, its Run/artifact records and exact artifact-store folder, temporary user `__artifact_closure_admin` and sessions were deleted. The successful General Analysis Run and both artifacts were retained. Original General Analysis configuration was deeply equal before/after. The prior partial Run remains partial; it was not upgraded in storage.

Baseline table hashes were unchanged for users, Trees/Agents/versions, Providers/models, Secrets, Tools/assignments, Templates, API tokens, Tree grants, permissions, Webhooks, destinations and idempotency. Expected changed tables contain only the retained Run/result delivery/Trace/artifacts. Final resource counts: **3 users, 2 Trees, 3 Providers, 2 Secrets, 4 Tools, 10 Runs**. Six additional Runs already existed before this pass compared with section 12's historical snapshot; they were included in the new baseline and preserved.

Evidence: [cleanup and preservation](checks/artifact-cleanup-evidence.json), [console](checks/artifact-browser-console.json), backend before/after restart and frontend logs in `checks/`.

## 16. STRUCTURED DECISION RELIABILITY CLOSURE

**Status: PARTIALLY VERIFIED.** The existing strict, bounded Core implementation and its recorded automated checks remain intact. Five real sequential Playground Runs now exist, with real persisted repair events, failed-Run/Trace correlation and reload verification. All five stopped on Groq rate limits, leaving the required real Gemini, Specialist, Manager Review, Root final review and FinalResult path unverified in this sequence. The earlier browser/login attempts below are historical; the latest authenticated acceptance supersedes them.

### Historical Run and evidence limits

Audited Run `2c3cef82-fc98-4e9a-8c55-53d64e814e03` against its persisted result/workflow state and durable Trace. It ended `failed` after **41,863 ms** with `DecisionParseError` in the **Manager review** phase. Root planning/triage, both Manager decompositions and capability-based routing completed; the Research Manager's two Specialist executions completed; the Synthesis Manager's two Specialist executions had provider failures. The saved run terminates when structured Manager review raises. It does not retain a review-attempt event or reviewer actor ID for that failing call, nor the rejected provider text or a finer parse/schema failure subtype. The evidence therefore identifies the failure phase and error class, but cannot honestly attribute it to a particular Manager UUID or recover exact malformed syntax. No raw model response was recovered or copied into this report.

The later Artifact/runtime changes in sections 3–15 fixed timeouts/classification, Manager peer remapping, Gemini Tool schema compatibility, MCP schema validation, and bounded Artifact argument handling. Inspection shows they did **not** add structured-decision parse/schema repair. The dedicated failure path therefore remained possible after those changes; this closure adds the bounded handling below.

### Structured contract audit

| Decision boundary | Producer / consumer and contract | Validation and reference rules |
|---|---|---|
| Root plan | Provider-backed Root planner → `RootPlan`; `delegate` is boolean, and `direct_output` is required and nonempty when not delegating | Strict JSON parsing and consumer validation; Root identity comes from Studio/Core context |
| Triage | Provider-backed triage → `TriageResult`; nonempty objective, registered Manager capabilities, optional category/confidence/notes/metadata | Capability references are resolved against the supplied registered capability set; confidence is range-checked |
| Manager selection | Deterministic capability routing consumes triage requirements | Not an LLM-selected Agent ID; the registry chooses eligible Managers |
| Manager decomposition/delegation | Provider-backed Manager → ordered `subtasks`; each has nonempty objective, capability strings and optional metadata | Capabilities must be owned by that Manager's registered Specialists; Core supplies task/Manager identity and IDs |
| Specialist selection | Deterministic routing consumes each subtask's capabilities | Not an LLM-selected Specialist ID; registry routing enforces the Manager's eligible Specialists |
| Manager review/revision | Provider-backed Manager reviewer → `ReviewResult`; decision is `pass`, `revise`, or `fail`; feedback is required; metadata optional | Same strict contract for initial review and revision review; Core validates the result before orchestration uses it |
| Root final review | Provider-backed Root reviewer → same review contract | Same strict review validation; Root identity is supplied by Core |
| Root synthesis | Provider-backed Root → free-text final answer | Not a structured decision; empty provider result remains a distinct output error |
| Manager collaboration | Structured Manager collaboration request is an extension to the Manager decision contract | Session validates peer ID, active Manager membership, permission and turn budget; invalid/denied requests are returned as controlled collaboration outcomes, not blindly replayed |
| Tool/function selection | Provider function call → existing ToolSession/ToolExecutor contract | Separate tool schema, assigned-tool authorization, call/round/byte budgets and sanitized error observations; not repaired as structured-decision JSON |

### Change and bounded failure policy

Core now performs strict parse **and consuming-contract validation inside the shared `_ProviderDecision._generate` boundary** for Root planning, triage, Manager decomposition, Manager review/revision and Root final review. A rejected response receives one additional structured repair attempt for the entire decision. The repair context contains only a safe rejection class (`malformed_syntax`, `schema_invalid`, `semantic_invalid`, or `invalid_reference`) and the existing contract/registered choices; it does not include the rejected raw response. The repaired response passes the identical strict parser and validator. A second invalid response raises the original typed decision error; malformed output is never accepted silently.

Typed provider/transport errors, timeouts, authentication failures and rate limits propagate without structured repair. Tool calls remain under their separate ToolSession bounds. Invalid Manager references continue through the existing controlled collaboration rejection/turn policy. A configured `max_collaboration_turns_per_decision=T` remains independent; the shared decision boundary can invoke `generate_with_tools` at most `T + 2` times (up to T accepted collaboration-request responses, a final decision response, and one bounded repair). Each wrapper invocation may itself include existing Tool rounds; those are not counted as extra structured repair attempts. SDK-internal provider retries are not independently observable here and are not claimed to be zero.

Metadata-only durable events now distinguish `structured_decision.decision_attempt`, `.validation_failed`, `.repair.started`, `.repair.succeeded`, `.repair.failed`, and `.reference_rejected`. They carry strategy, safe failure class, bounded attempt/turn numbers and safe provider error type where relevant. Raw response content, prompt, credentials and Secret values are not recorded. `decision_attempt` counts the shared structured-decision wrapper, not every underlying provider call when `generate_with_tools` performs separate Tool rounds; `operation.*` events remain the existing adapter-operation evidence.

### Engineering verification

Added `AgentTree/tests/test_structured_decision_repair.py` with coverage for malformed syntax, schema-invalid review decisions, invalid capability references, Root planning, Manager decomposition, Root final review, bounded terminal failure, provider transport failure without repair, provider failure during repair, and independence from revision/tool settings.

| Check | Result |
|---|---|
| Focused Core decision/provider tests | **106 passed** |
| Full Core suite | **721 passed, 5 skipped** (baseline 711 passed; +10 structured-decision tests) |
| Full Studio backend suite | **288 passed**, one existing Starlette cookie deprecation warning |
| Full Studio frontend suite | **249 passed**, 37 files |
| TypeScript + production build | Passed (`npm run build`, which runs `tsc -b`); existing >500 KB chunk warning remains |
| Studio/Core `git diff --check` | Passed |
| Database migration | No migration added |
| Docker | PostgreSQL, backend and frontend healthy after backend-only rebuild |
| Alembic | `0013_run_cancellation_status` is current and head; `up_to_date=true` |
| AgentTree version | Docker health reports Core `0.2.2` |

The first sandboxed full Core attempt could not create local loopback sockets (17 fixture failures with `PermissionError`, 704 passed, 5 skipped). Re-running the full Core suite with local test networking permitted passed 721/5; this was an environment constraint, not a source failure. Studio tests used isolated SQLite/ASGI fixtures. Existing PostgreSQL volume stayed running; only the backend container was recreated to load the updated sibling Core package. The frontend container remained healthy and unchanged.

Recent backend/frontend log scan found no matching traceback, exception, error, 500, or failed line in the 15-minute window. Backend health confirms database and migration availability. No schema reset or database cleanup occurred.

### Earlier preflight and browser attempts — historical

Read-only preflight on 2 October 2026 confirmed the existing General Analysis Tree (`4aa0304a-ba85-4867-a419-e3823b340c1b`) exists, is marked Ready at Tree and version level, and passes current backend validation with no readiness issue codes. The existing Gemini provider is connected. The configured Gemini model `models/gemini-flash-lite-latest` is available, a generation candidate, and qualified on both Synthesis Manager and Analysis Specialist. Root and Research Manager remain bound to their existing Groq models; no provider/model bindings or Tree data were changed. This is a mixed-provider Tree with real Gemini execution paths, not a claim that every Agent uses Gemini.

Earlier planned sequence, before browser recovery (actual results follow below):

| Run | Run ID | Status | Duration | Structured repairs | Repair outcome | Agent path | FinalResult | Artifacts | Durable events |
|---|---|---|---:|---:|---|---|---|---:|---:|
| 1 | Not started | — | — | — | — | — | — | — | — |
| 2 | Not started | — | — | — | — | — | — | — | — |
| 3 | Not started | — | — | — | — | — | — | — | — |
| 4 | Not started | — | — | — | — | — | — | — | — |
| 5 | Not started | — | — | — | — | — | — | — | — |

#### Investigation of the reported 11th Run

The read-only database audit identified Run `6dc233f5-4850-4515-995a-7f55f963ecc9`: General Analysis, created **2026-10-02 13:14:53 UTC (20:14:53 Asia/Bangkok)**, submitted by the existing `admin` account with invocation source `studio_live`, terminal Studio/Core status `completed`, **24** durable events, and **0** artifacts. It predates the pre-continuation report snapshot (21:08 Asia/Bangkok). The `studio_live` source supports that it came through Studio's live-run path; the persisted metadata cannot distinguish a person from automation using that path. No prompt/result content was inspected. This Run was not created by this continuation, and its metadata shows no failure or anomalous state. The database still contains 11 Runs; this observation resolves the identity and safe provenance limits of the extra row without deleting or modifying it.

At that earlier unauthenticated snapshot, no new acceptance Run ID, repair/provider-attempt count, result, artifact or Trace correlation existed, and no Run was submitted or deleted. The earlier `30c5fc01…` result in section 15 is from a different single acceptance and does not satisfy the five-run requirement. The historical reviewer actor and rejected provider response still cannot be recovered from Run `2c3cef82…` storage. Latest actual acceptance follows below.

#### Disposable account and browser-authentication attempt

The only existing user-creation route is Admin-protected, there is no local account-provisioning CLI, and `AuthService.create_user` applies the production-compatible Argon2 hashing and normal Tree-grant/security-event behavior. In the previous continuation, two successive least-privilege disposable non-Admin identities were provisioned through that service with exactly `manage_trees_agents`, `use_trees`, and `view_executions`, each scoped to General Analysis in selected-Tree mode. The application set `must_change_password=true` as designed. Both accounts were deleted through `AuthService` after browser credential transfer failed; their Tree grants and any sessions cascaded with deletion. The two corresponding user-created/user-deleted audit pairs remain as normal security audit history. No persistent verification account remained at the start of this continuation. This continuation did not create another account: the mandatory credential handoff applies before any new disposable credential is entered, so creating an account now would leave a stranded identity that cannot complete the required real login flow.

The available browser was unauthenticated. The earlier single Compose-default sign-in had returned the application's generic invalid-credentials response; no other existing credential was guessed or reset. A generated credential was kept out of tool output and reports. The browser client blocked navigation to a short-lived loopback credential bridge and also blocked the randomized same-origin temporary static response. The page-evaluation surface did not provide `fetch`, so credential transfer could not be completed safely. The one-use static response was mode 0600 and has been removed. No generated password was entered into the Studio login form, and no browser login succeeded.

An automatic approval review in the previous continuation rejected creating a temporary Admin through a direct service call because broad privilege was not established as necessary. No workaround or Admin account was created. The latest user instruction correctly keeps the test identity restricted. The computer-use policy requires the user to take over and enter/submit new credentials, including the mandatory first-login password change; this requirement applies even though the user pre-authorized the disposable account credentials. No password-change action was taken. The in-app browser attachment attempt again timed out at the browser-control layer. The repository has no installed Playwright or Puppeteer package; only a Chrome binary is present, which is not itself a usable automation path. No alternate automation stack was installed.

| Post-cleanup database evidence | Observed |
|---|---:|
| Users | 3 |
| Temporary `verify-structured-*` users | 0 |
| Trees | 2 |
| Provider connections | 3 |
| Secrets | 2 |
| Tool connections | 4 |
| Runs | 11 |
| PostgreSQL / backend / frontend | Healthy / healthy / healthy |
| Alembic current | `0013_run_cancellation_status` (head) |
| Recent backend/frontend log markers | 0 Tracebacks, 0 internal-server-error markers, 0 HTTP 500 markers, 0 uncaught markers across 350 lines |
| Additional log scan during this continuation | No matching traceback/500/uncaught markers in the preceding three hours |
| Studio `git diff --check` | Passed |
| AgentTree Core `git diff --check` | Passed |

These counts were rechecked during this continuation using read-only SQL. Users=3, temporary `verify-structured-*` users=0, Trees=2, Providers=3, Secrets=2, Tools=4, Runs=11. The existing PostgreSQL volume was not reset. This continuation created no Studio records and submitted no Runs. The pre-existing structured-decision Core changes remain; this continuation did not modify Core.

**Earlier decision: PARTIALLY VERIFIED.** At that point browser attachment had timed out, no Run had been started, and console/Trace evidence was unavailable. This authentication limitation and the earlier suggestion to provision another restricted account are superseded by the authenticated-session recovery and actual Runs below. No additional account or credential change is required for the current browser session.

### Latest authenticated certification — 2 October 2026

#### Current repository and runtime audit

- Studio remains on `main`, HEAD `4086b80`; Core remains on `main`, HEAD `1f9649e`. At entry Studio had 106 staged modifications, 417 staged additions and 20 untracked entries, with no unstaged tracked diff. Core had the same 15 authorized modified files and three untracked regression test files recorded by the earlier closure. All existing work was preserved.
- No production source, test, configuration, authentication, permission, Provider, Tool, Tree or Core file was changed in this continuation. Only verification documentation and evidence were added. No migration, rebuild, new account, credential entry/reset or database cleanup was needed.
- The browser control session was refreshed, and a fresh Studio tab used the existing authenticated `admin` / Primary Administrator cookie. Actual Dashboard, General Analysis and Playground UI loaded successfully. No credential was read or entered. The earlier browser timeout was not evidence of an application authentication defect.
- **Actual current General Analysis is v7**, UUID `1ee77b8a-c1fc-475f-84bb-72988d03f43a`, already present before these Runs. Its Tree and version are Ready and `RuntimeBuilder.validate` passes with zero blockers. Earlier v6 descriptions are historical. All five Runs pin this same v7; no binding or routing was altered to influence outcomes.
- Root Analysis Lead uses Groq `qwen/qwen3.8-27b`; Research Manager and Research Specialist use Groq `allam-2-7b`. Synthesis Manager and Analysis Specialist use Gemini `models/gemini-flash-lite-latest`. All saved model records are available and qualified, and both Provider connections are connected. Qualification/readiness does not guarantee current provider quota.
- Docker's installed `structured_output`, Root planning, triage, decomposition, Manager review, final review and Gemini adapter source hashes match the current sibling Core checkout. These Runs exercised the authorized implementation rather than a stale wheel.

#### Contract, retry and native-output audit

The current shared boundary strictly parses JSON and runs the consuming validator before returning. Duplicate keys, invalid constants, malformed syntax, invalid field types/enums and out-of-registry capability references remain rejected. Repair context contains a safe failure class and existing contract/registered choices, with no rejected raw response. The second invalid decision fails with the typed error. The same boundary covers Manager Review and revision review, as confirmed in `ProviderManagerReviewer.review` and its existing regressions; the historical failing Manager Review is not bypassed.

One repair is allowed **per decision**, not one per Run. Collaboration has its separate bounded turn policy. With `T` accepted collaboration turns, the wrapper allows at most `T + 2` calls to `generate_with_tools`; each Tool-enabled call has at most `max_tool_rounds + 1` provider generations. Manager/final revisions remain separate configured bounds. The operation journal performs one action invocation and propagates a provider failure; its recovery/replay policy is not an automatic live retry loop. The compatible HTTP adapter used by these Groq bindings issues one HTTP request per adapter call and propagates normalized HTTP errors. Actual journaled provider generations for the five Runs were **5, 4, 2, 1, 1**. Provider-internal HTTP attempts are not separately counted by these operation records.

The generic `ProviderRequest` exposes optional `response_format`, but the current Gemini adapter explicitly rejects that field and does not wire native JSON response-schema mode into structured decisions. Its existing JSON function-declaration schema support remains separate and intact. The current reliability boundary therefore uses vendor-neutral prompt contracts plus strict validation and bounded repair. No native Gemini schema integration or retry-budget change was added: the demonstrated blocker is Groq rate limiting before Gemini execution, and no deterministic framework defect was found. Gemini SDK-internal retry counts remain unmeasured here, not asserted to be zero.

The existing ten structured-decision regression tests cover malformed/schema-invalid Manager Review, invalid references, Root planning, Manager decomposition, final review, exhausted repair, provider failure outside/during repair and budget independence. The previously passed full suites remain **Core 721 passed / 5 skipped, backend 288 passed, frontend 249 passed**, with TypeScript/build passed. They were not redundantly rerun because no production/test source changed. Working-tree `git diff --check` was rerun for both repositories and passed; the previously disclosed staged log whitespace remains unrelated.

#### Five sequential real Playground Runs

Each Run was started by clicking **Run Tree in the actual Playground**, with the exact five-line Thai university-AI prompt requested by the user. The existing Studio live-run route, real Run ID, background worker and actual configured Providers were used. Each terminal state and persisted repair outcome was inspected before submitting the next Run. Persisted timestamps prove nonoverlap, and all five input hashes match. No prompt concatenation, forced delegation, fabricated event or simulated progress was used.

| # | Run ID | Studio / Core status | Duration | Validation failures | Repairs | Repair outcome | Agent path actually reached | FinalResult | Artifacts | Durable events |
|---|---|---|---:|---:|---:|---|---|---|---:|---:|
| 1 | `fb51e905-4c06-4944-86e9-ced099cf9100` | failed / none | 4,990 ms | 2 | 2 | Root triage succeeded; Research Manager repair interrupted by rate limit | Root → Research Manager decomposition | absent | 0 | 38 |
| 2 | `2ff79c80-4621-4c52-a642-b7609d6134dd` | failed / none | 2,439 ms | 1 | 1 | Research Manager repair interrupted by rate limit | Root → Research Manager decomposition | absent | 0 | 31 |
| 3 | `0797d450-8f65-4c52-a832-09f5a778f49c` | failed / none | 2,833 ms | 1 | 1 | Root planning repair interrupted by rate limit | Root planning | absent | 0 | 18 |
| 4 | `a5ba5cf7-c5c6-4942-8604-6de7bb6e0334` | failed / none | 312 ms | 0 | 0 | No repair: provider failed before decision output | Root planning | absent | 0 | 11 |
| 5 | `b72772c9-07ae-4f7f-a1b0-642e2ff7bd11` | failed / none | 381 ms | 0 | 0 | No repair: provider failed before decision output | Root planning | absent | 0 | 11 |

All five have safe error code `PROVIDER_RATE_LIMIT` and message **Provider rate limit exceeded**. This is an external provider failure, not a new deterministic framework defect or proof that Gemini failed. No provider Retry-After/reset timestamp is retained, so the precise quota bucket and recovery time are unknown. The failures were preserved rather than cosmetically converted to success or worked around by changing Models, Tools, instructions, routing or budgets.

**Actual repair evidence:** Run 1 Root triage has `validation_failed` at durable sequence 15 (`schema_invalid`), `repair.started` at 16, second decision attempt at 17 and `repair.succeeded` at **21**, for real Root UUID `2b7c25fb-87f8-4557-b2a7-fb414156bc72`. This was a real **Groq-backed Root repair**, not a Gemini repair or Manager Review repair. Research Manager malformed decomposition at sequence 30 leads to one repair, then a safe `provider_failure` / `ProviderRateLimitError` event at 36. Run 2 follows that same Manager failure class; Run 3 has a malformed Root plan followed by rate limiting during its sole repair. No decision exceeds one repair. The raw rejected content and exact missing field are not retained in these metadata-only events and are not guessed.

**Manager Review:** zero attempts in all five Runs. No Specialist or Gemini-backed Agent was reached. Root final review, synthesis, successful FinalResult and artifact production therefore cannot be certified from this sequence. Existing historical success and artifact evidence remains valid for its own earlier Runs, and is not substituted for these five.

Safe per-Run created/started/finished times, pinned version IDs, actor IDs, journaled provider operation counts, repair metadata, input hashes and contiguous durable sequences are stored in [run-evidence.json](structured-decision-20261002/run-evidence.json). Counts use `TraceEvent.core_sequence IS NOT NULL`, not the merged legacy Trace-row count. All five sequences are contiguous and terminate with `execution.failed`.

#### Real browser, Trace, reload and transport evidence

- The actual UI moved from submitted/active Run to its real failed terminal state. Runs 1–2 showed Root completed and Research Manager failed; Runs 3–5 showed Root failed. Unreached Managers/Specialists stayed Idle. No result, Tool activity, successful hierarchy or long-running animation was fabricated. Fast failure prevented independent capture of sustained live Agent/edge motion.
- Playground → **Open Execution Trace** opened `/runs/b72772c9-07ae-4f7f-a1b0-642e2ff7bd11?trace=1`. The real Run console and full persisted Execution Inspector both showed the same ID, v7, safe rate-limit failure, **11 / 11 events**, no final output and no artifacts. Returning through its Playground button preserved this ID.
- Actual browser reload restored Run 5's submitted input, failed graph, timeline, duration and 11 durable events. Existing Welcome behavior appeared on entry and was closed without changing snooze preferences. This verifies failed-Run recovery; a newly completed successful Run/result cannot be claimed.
- Run 1 was reopened from real Recent Tree tests, then its full persisted Trace showed **38 / 38** events. Its existing event details panel exposed the actual sequence-21 `repair.succeeded` metadata with `repair_attempt=1`, `decision_attempt=2` and `failure_class=schema_invalid`; no rejected provider response or credential was present.
- Browser warning/error console retrieval returned `[]`, saved in [browser-console.json](structured-decision-20261002/browser-console.json). No independent complete HAR was available. A read-only navigation to the cookie-authenticated events endpoint was blocked by the browser tool (`ERR_BLOCKED_BY_CLIENT`); the temporary blank probe tab was closed. This was a tooling restriction, not evidence of backend 4xx/5xx, and no session-cookie extraction or bypass was attempted.
- The existing hook's terminal reconciliation reads durable events, result, Run detail and artifacts, including when terminal SSE was missed. UI event counts were verified against persistence. This continuation does not claim independent SSE reconnect receipts or that all short Runs remained active long enough for a captured live SSE subscription; the earlier separately verified replay evidence remains historical.
- Current Light/English was used without theme/navigation redesign. Real screenshots record only observed states. Dark/Thai and successful real Gemini visual acceptance in earlier sections remain historical, not new screenshots for these failed Runs.

#### Final health, preservation and exact remaining gate

PostgreSQL, backend and frontend remained **healthy**, with Alembic **`0013_run_cancellation_status` (head)**. No volume/container reset or backend restart occurred. The final 30-minute backend/frontend log scan covered 350 lines and found zero Traceback, HTTP-500, uncaught/unhandled or common credential-pattern matches; only aggregate scan evidence was saved in [log-evidence.json](structured-decision-20261002/log-evidence.json). Pattern scans are not a claim to have exhaustively detected every possible secret encoding.

Counts remained **3 users, 2 Trees, 3 Providers, 2 Secrets and 4 Tools**. Runs increased **11 → 16**, exactly the five retained acceptance IDs. All 11 preceding Run IDs remain, including the previously resolved 11th Run. Existing Tree/provider records, permissions and credentials were not mutated. No disposable account or resource was created, so no resource cleanup is necessary; the five Runs remain as meaningful failure/repair evidence. No Final Integration Polish was started.

Core still has the same pre-existing **15 modified files and three untracked tests**; it is intentionally not clean due to the earlier authorized fixes. This continuation made no Core change. Studio's existing staged implementation was preserved. The new files are verification JSON/JPEG evidence plus updates to this report and screenshots.md.

**Latest decision: PARTIALLY VERIFIED.** Actual authentication, five sequential submissions, real Root repair, bounded provider-failure behavior, failed-Run/Trace correlation, reload, health and preservation are now verified. Remaining required runtime acceptance is an execution sequence that reaches the configured **real Gemini path, routed Specialist work, Manager Review, Root final review and FinalResult**, with a successful final result correlated to the same persisted Trace. The current Groq rate limit prevents that path. Do not request another account, claim a Gemini failure, increase repair budgets or count historical successes as this sequence. Resume runtime acceptance when the unchanged configured Providers can accept the workload.

### Remaining factual limitations and final decision

- Historical failing argument payloads and the three recovered Tool errors' individual payloads/exception texts are not retained; the focused call provides measured current contract evidence.
- Process-local active execution restart recovery and independent capture of brief edge pulses are not claimed. Real live node state/result settling, SSE terminal and completed reload were verified for the earlier Artifact/runtime Runs; the latest five-run sequence verifies failed terminal state and reload.
- Core fixes are local authorized package changes and must be released for independent downstream installations. Core is intentionally modified, not clean.
- Existing cached log whitespace, build chunk warning and test deprecation remain disclosed above. Full HAR capture was unavailable.

These limitations do not invalidate the bounded-policy, focused Artifact, clean hierarchical General Analysis, persisted result/artifact and SSE/Trace acceptance recorded in sections 1–15. **Artifact/runtime certification in section 15: COMPLETE. Structured Decision Reliability Closure in section 16: PARTIALLY VERIFIED.** No Final Integration Polish was started.

## 17. FULL PROVIDER HEALTH, MODEL QUALIFICATION, AND RUNTIME ACCEPTANCE

**Decision: COMPLETE.** This section supersedes the historical partial decision in section 16. Verification used the authenticated existing Admin browser, the original Docker PostgreSQL database, real configured Provider credentials, and the existing Playground/Run/Trace/artifact infrastructure. No account, password, permission, API key or Secret was created, changed or deleted.

### Scope and current repository audit

Studio began at `4086b80` on `main`, with 523 staged files from earlier work (106 modifications and 417 additions), earlier untracked verification artifacts, and no unstaged tracked diff. Core began at `1f9649e`, already containing 15 authorized modified files and three untracked regression files from earlier runtime closure. These were preserved. The current source and existing reports were inspected before editing; earlier reported counts, bindings and browser limitations were not treated as current state.

Existing Provider discovery, durable qualification fields, normal model API, shared Agent selector, Guided Wizard, Template Setup, backend readiness, versioned Tree bindings, Core Provider factory, Studio Runs, Playground SSE reconciliation, Execution Trace and artifact store were reused. No new dependency, API version, execution endpoint, database table, migration, fallback, retry engine, authentication model or orchestration pattern was added. Final Integration Polish and other deferred phases were not started.

New evidence is in [provider-qualification-20261002](provider-qualification-20261002/). Earlier screenshots and failed Runs remain intact.

### Provider inventory and qualification counts

All four currently configured connections were inventoried. The fourth connection and third Secret were already present at this task's entry; they were not verification resources created by this task. Connection/authentication, fresh catalog discovery and one bounded basic inference were exercised for each using Studio's existing adapters/services. Catalog discovery probes did not delete diagnostic rows or run an expensive exhaustive qualification sweep.

| Provider connection | Type | Models discovered | Generation candidates | Usable | Unavailable | Temporary failures |
|---|---|---:|---:|---:|---:|---:|
| gemini | Gemini | 61 | 44 | 6 | 54 | 1 |
| gemini2 | Gemini | 61 | 44 | 6 | 54 | 1 |
| groq | Groq | 11 | 11 | 4 | 7 | 0 |
| test | Ollama | 2 | 2 | 2 | 0 | 0 |

Counts describe retained current qualification records, including earlier classifications; they do not claim every unavailable model was reprobed during this bounded audit. A usable record must satisfy all three existing conditions: `is_available`, `generation_candidate`, and `qualification_status == "qualified"`. Basic text qualification is not a guarantee of every model's tool or structured-output capability.

### Real Provider health matrix

Structured probes used real `ProviderTaskTriage` with `Task(objective=...)` and registered capabilities, exercising parsing and validation through the Core Provider abstraction. All four corrected structured probes validated on their first attempt.

| Provider | Probed Model | Auth | Discovery | Inference | Structured | Tools / functions | Rate limit | Measured probe latency | Health |
|---|---|---|---|---|---|---|---|---|---|
| gemini | `models/gemini-flash-lite-latest`; exact `models/gemini-3.5-flash-lite` also verified | Passed | Passed, 61 | Passed | Passed | Neutral function observed; 10 real Artifact calls across the full sequence passed | Not reproduced in bounded probes or acceptance | Basic 1,863 ms; structured 932 ms | Healthy selected candidate |
| gemini2 | `models/gemini-flash-lite-latest` | Passed | Passed, 61 | Passed | Passed | Correctly named `certification_echo` returned by final probe | Not reproduced | Basic 876 ms; structured 1,001 ms; function 859 ms | Healthy probed candidate |
| groq | `qwen/qwen3.8-27b` | Passed | Passed, 11 | Passed | Passed | Passed after proven compatible-adapter correction; one final request | Historical five Runs rate limited; current bounded probes succeeded | Basic 258 ms; structured 367 ms; final function 291 ms | Healthy current probes; earlier quota failure retained |
| test | `gemma4:e4b` | Passed / no credential required | Passed, 2 | Passed | Passed | Requested neutral function not emitted; plain response returned | Not reproduced | Basic 17,786 ms; structured 30,145 ms | Healthy text/structured probe; function adherence degraded |

Latency is for individual observed requests, not a performance benchmark or service guarantee. Exact current Provider identity and native returned model are recorded in [health-summary.json](provider-qualification-20261002/health-summary.json). Gemini's native response reports `gemini-3.5-flash-lite` for the configured `models/` ID; the prefix normalization and previously selected floating alias are explicit, not fallback.

**Probe corrections:** the initial diagnostic script incorrectly constructed `Task(input=...)` and initially supplied an incompatible nested function schema. Those harness failures are excluded from Provider findings. Corrected probes used `Task(objective=...)` and Core's neutral function declaration. The corrected script's first name check also looked at a top-level `name` instead of `function.name`, incorrectly labelling a returned Gemini function as absent. Counts showed one function call; the final Gemini2 probe verified its actual name. Raw historical diagnostic files remain, and the corrected health summary explains these mistakes rather than silently rewriting them into Provider failures.

### Groq rate-limit diagnosis and real adapter defect

The earlier five Runs in section 16 genuinely terminated with normalized `PROVIDER_RATE_LIMIT`. Each failed Run and contiguous Trace persisted, errors were safely presented, and the system remained healthy. **EXTERNAL PROVIDER RATE LIMIT HANDLED SAFELY.** The available historical metadata does not retain a quota subtype, RPM/TPM/day limit, Retry-After value or full upstream headers. Those details are **not observable** and are not inferred. Fresh authentication, discovery, inference and structured probes succeeded; a cleared historical rate limit does not guarantee future quota. No additional five-Run Groq sequence was submitted.

A separate real Groq function request proved a genuine adapter defect. Groq returned an assistant message containing `role` and `tool_calls`, with `finish_reason="tool_calls"`, and omitted optional `content`. Core indexed `message["content"]` and rejected this valid function-only response. Safe response-shape evidence is in [groq-response-shape.json](provider-qualification-20261002/groq-response-shape.json); no raw credential, authorization header or private response body was saved.

The current user request expressly permits Core changes for a proven Provider/runtime defect. The narrow fix accepts omitted optional text when usable function calls exist, retains message-object validation, and still rejects an empty or malformed response without text/calls. Eight new cases cover omitted/null content with a valid call, empty messages/call lists, and non-object messages. Core's complete suite passed. A rebuilt real Docker backend then made **one** bounded request to the same configured Groq connection/model: `certification_echo` was returned, actual Provider `groq`, actual Model `qwen/qwen3.8-27b`, 291 ms. Docker/local adapter source hashes matched. See [groq-function-verified.json](provider-qualification-20261002/groq-function-verified.json).

This changes Provider response normalization only. Root routing, Manager review, Tool execution, repair budgets and validation contracts were not changed by this task.

### Qualification failure classification and retry behavior

Studio now recognizes typed Core errors through their cause chain as well as raw HTTP response status:

| Evidence | Qualification outcome | Safe code / guidance |
|---|---|---|
| Rate limit / HTTP 429 | `transient_error` | `provider_rate_limited`; verify later |
| Authentication / HTTP 401 or 403 | `transient_error` | `provider_auth_failed`; check connection/credential |
| Timeout / HTTP 408 or 504 | `transient_error` | `verification_timeout`; retry later |
| Provider unavailable / other HTTP 5xx | `transient_error` | `provider_unavailable`; retry later |
| Generic normalized Provider runtime error | `transient_error` | `generation_failed`; no permanent capability claim |
| Model not found | `unavailable` | `model_unavailable` |
| Invalid request / malformed or incompatible response | `unavailable` | `incompatible_response` |

Safe guidance is constructed locally; raw upstream exception text is not persisted as qualification copy. Both the existing bulk backend path and the frontend discovery/verification workflow stop on Provider-wide rate/auth/unavailable failures. A transport rejection pauses the frontend workflow with transient retry guidance; it does not label the model permanently incompatible or continue hammering the connection. A failed initial connection test now releases the busy state so normal retry remains possible.

Backend regression coverage proves that a rate-limited first candidate leaves subsequent diagnostic candidates unqualified, preserves all records, and becomes selectable after later successful requalification. Successful verification clears the old safe failure code. No synthetic success was used in real runtime acceptance.

### Normal Provider list and all Agent model selectors

Before this revision the normal Gemini list displayed 61 diagnostic rows, including dozens of known unusable models. After the revision it displays **six** qualified usable models. All four real expanded catalogs were checked after the final rebuild: `6 / 4 / 2 / 6` for gemini2 / groq / test / gemini. Provider summary counts retain unavailable/temporary totals without rendering each failure as an ordinary model choice. Diagnostics remain in the existing `include_unusable=true` API/state.

A small shared `isUsableModel` helper implements the same three flags. It is used by the normal Provider list, shared Agent selector, Template Setup default/individual selectors and Agent unavailable-binding display. Guided Wizard, Visual Builder and Advanced configuration reuse the shared selector. Even a diagnostic catalog containing failed/unknown/verifying rows cannot make them normal selectable options. There is no separate model search path on this Providers page that can resurrect unqualified rows.

A saved unavailable binding is retained as a disabled labelled option and accompanied by the existing unavailable-model warning. No replacement callback runs merely because its model is absent. Backend readiness remains authoritative and rejects unavailable/unqualified bindings. Template Setup follows the same behavior. Automated tests cover this retained binding and the exact eligibility flags; the real normal Agent selector displayed the six usable Gemini models and was used to save the authorized canonical mapping.

New EN/TH copy explains usable models and paused verification; technical terms remain English. Real Thai Provider guidance was captured without recreating localization or changing the visual system.

### Authorized General Analysis mapping and provenance

General Analysis remains Tree `4aa0304a-ba85-4867-a419-e3823b340c1b`. The original safe mapping was captured in [initial-database-baseline.json](provider-qualification-20261002/initial-database-baseline.json) before any edit:

| Agent | Original v7 Provider / Model | Final v9 Provider / Model |
|---|---|---|
| Analysis Lead / Root | groq · `qwen/qwen3.8-27b` | gemini · `models/gemini-3.5-flash-lite` |
| Research Manager | groq · `allam-2-7b` | gemini · `models/gemini-3.5-flash-lite` |
| Research Specialist | groq · `allam-2-7b` | gemini · `models/gemini-3.5-flash-lite` |
| Synthesis Manager | gemini · `models/gemini-flash-lite-latest` | gemini · `models/gemini-3.5-flash-lite` |
| Analysis Specialist | gemini · `models/gemini-flash-lite-latest` | gemini · `models/gemini-3.5-flash-lite` |

The user expressly authorized a healthy homogeneous mapping via normal Studio UI. The existing **Edit Tree / Guided Wizard** was used. An intermediate v8 save retained the Analysis Specialist's alias; persisted inspection caught it, and normal UI selection/save produced v9 with all five exact canonical bindings. No direct SQL mapping write or hidden execution override was used. v7 and v8 remain as historical versions. Existing hierarchy, capabilities, instructions, bounded review settings and Artifact Output assignment were preserved. Current backend validation returns ready with zero blockers.

All six new Runs pin v9 `fa4c3d1e-a44b-4737-bb51-ce806009b9ce`. RuntimeBuilder resolves the actual Provider UUID/model cache key through the existing factory. Every reported usage call in the full sequence identifies `studio-829a2753-2240-4401-8d91-a4ea0a8562d7-e561dfc327db`, where the suffix is the configured model-ID hash. Native usage reports `gemini-3.5-flash-lite`. No Groq call, Provider fallback, per-Run remapping or alternate model appears in these recorded calls. The authorized healthy mapping remains in place; the original mapping is documented and preserved in v7.

### Real Playground smoke and five sequential full Runs

The smoke Run `07aca1a2-c3d0-401e-87ca-f207cb3a8795` used a newly authored short benefit/privacy prompt. It completed in **3,202 ms**, `FinalResult.success=true`, 16 durable events and 25 total Trace rows. It legitimately used Root's direct response branch. The full hierarchy acceptance comes from the subsequent five Runs, not from the smoke.

All full submissions used the exact requested Thai prompt:

```text
วิเคราะห์ข้อดีและข้อเสียของการนำ AI มาใช้ในมหาวิทยาลัย
โดยพิจารณาทั้งด้านการเรียนการสอน ประสิทธิภาพของนักศึกษา
ความเป็นส่วนตัวของข้อมูล และความเสี่ยงจากการพึ่งพา AI มากเกินไป
จากนั้นสรุปเป็นข้อเสนอแนะ 5 ข้อสำหรับมหาวิทยาลัยที่ต้องการนำ AI
มาใช้อย่างเหมาะสม
```

All five input hashes are `a978c1f357e533d467f3d427e27b3386df9b8f44957c6599dac6ca671675abe0`. Runs were submitted through the actual authenticated Playground, one at a time. Each terminal result was inspected before **Run Again / Run Tree** submitted the next new ID. Persisted start/finish timestamps independently confirm nonoverlapping execution.

| # | Run ID | Provider / Model | Status | Duration | Repairs | Manager Review | FinalResult | Artifacts | Durable events |
|---|---|---|---|---:|---:|---|---|---:|---:|
| 1 | `58e7c9fd-0608-40ca-a243-e1e60a1b8bcd` | gemini / `models/gemini-3.5-flash-lite` | Completed | 51,718 ms | 0 | 4 passed | Success | 2 | 120 |
| 2 | `cc2b049c-3e92-4287-a4f1-6df4a41f7fbb` | Same | Completed | 61,372 ms | 0 | 4 passed | Success | 2 | 120 |
| 3 | `56e77505-4616-41b2-a141-9d86cb4b199f` | Same | Completed | 60,897 ms | 0 | 4 passed | Success | 2 | 120 |
| 4 | `c0c3db68-3174-4a5a-a747-9373878e44e4` | Same | Completed | 55,848 ms | 0 | 4 passed | Success | 2 | 120 |
| 5 | `284078e8-bb6b-4ffe-a58b-b1a292155d69` | Same | Completed | 53,434 ms | 0 | 4 passed | Success | 2 | 120 |

**Every full Run** exercised Root planning/triage, both Manager decompositions, four routed Specialist task executions, two real Artifact Tool calls, four passed Manager Review operations, one passed Root final review, Root synthesis and successful FinalResult. Each recorded 16 Provider generation operations, zero structured validation failures, zero repair events and zero explicit Provider-retry events. SDK-internal transport retries are not independently observable from durable events and are not claimed to be zero.

The final durable event is `execution.completed`; Core execution ID equals Studio Run ID in all five. Durable sequences are contiguous 1–120. Each Run also contains 60 existing legacy orchestration Trace rows, yielding **180 total persisted Trace rows**. This existing dual event representation is distinct from duplicated SSE delivery; the UI exposes 120 durable events. See [acceptance-summary.json](provider-qualification-20261002/acceptance-summary.json), [run-1.json](provider-qualification-20261002/run-1.json), [run-2.json](provider-qualification-20261002/run-2.json), [run-3.json](provider-qualification-20261002/run-3.json), [run-4.json](provider-qualification-20261002/run-4.json) and [run-5.json](provider-qualification-20261002/run-5.json).

### Real structured repair preserved

No new repair was forced. The earlier real Root Run `fb51e905-4c06-4944-86e9-ced099cf9100` still contains sequence 21 `structured_decision.repair.succeeded`, strategy `triage`, `schema_invalid`, repair attempt 1 and decision attempt 2, followed by a real external Groq failure. Its screenshots and safe metadata in section 16 remain evidence of actual bounded repair. The new successful sequence needs no repair and does not weaken any validator or expand the repair budget. The older Manager Review failure's missing raw payload cannot be recovered and is not invented; the current four-per-Run successful reviews provide new positive evidence.

### Browser, FinalResult, Trace and reload acceptance

Real Chromium UI acceptance verified:

- Qualified-only Provider catalogs in English and Thai; normal Agent model selector; authorized same-model configuration and Tree Ready state.
- Smoke submission/result; all five separate real submissions; actual live routed Agent/Tool/review activity and terminal settling; final result visible.
- Final Run **Open Execution Trace** navigated to `/runs/284078e8-bb6b-4ffe-a58b-b1a292155d69?trace=1`. The existing Run console and full Execution Inspector showed the same ID, v9, Completed, 120/120 durable events and successful FinalResult. The Playground button returned to that same Run.
- Actual completed-Run reload restored input, successful result, saved-version graph, timeline, Run ID and artifacts. This was checked again after the final Core/backend rebuild. Welcome appeared according to its existing behavior and was closed without credential or snooze changes.
- Existing artifact Preview loaded real persisted content, including the 17,202-byte final recommendation report. After the final backend restart, all **10** artifact bodies across the five full Runs were retrieved through the existing Run service and matched both recorded length and SHA-256. No duplicate artifact store was added.

The final screenshot [19-final-core-rebuild-reloaded.jpg](provider-qualification-20261002/19-final-core-rebuild-reloaded.jpg) was visually inspected: same Run ID, completed graph/result, 53.5 s and 120 durable events. [20-all-provider-usable-catalogs.jpg](provider-qualification-20261002/20-all-provider-usable-catalogs.jpg) records all four filtered catalogs. The screenshot index documents all 20 new observed captures.

### Automated tests, build and warnings

| Check | Final result |
|---|---|
| Studio full backend suite | **303 passed**, 1 existing Starlette cookie deprecation warning, 40.99 s |
| Studio full frontend suite | **255 passed**, 38 files, 15.90 s |
| TypeScript | Passed (`tsc -b` in production build) |
| Production frontend build | Passed, Vite 7.3.6, 4.33 s |
| Core full suite against current source | **729 passed, 5 skipped**, 32.57 s |
| Studio / Core current `git diff --check` | Passed |
| Additional Studio staged-diff check | Existing historical evidence-log whitespace warnings; current task source passes |
| Dependency / migration additions | None |

The new backend cases cover typed/cause-chain errors, raw HTTP classification and rate-limit stop/requalification. Frontend cases cover exact eligibility, excluded diagnostic rows, paused workflow, transport failure, preserved unavailable bindings, no replacement callback, Thai technical terms and connection retry usability. Existing regression suites were retained.

The frontend log includes the existing deliberate `private-debug-marker` render-error boundary tests, i18next informational output and Vitest environment timing advice; these are not browser runtime failures. The production build retains the existing chunk-size advisory. A real Gemini function probe emits the SDK's informational warning about non-text function-call parts; the function response itself is valid. No test was removed or marked skipped to obtain these results. Core's five existing skips remain unchanged.

The first focused Core invocation accidentally imported the older installed wheel and correctly failed the newly added omitted-content case. Re-running with `PYTHONPATH=src` tested the actual modified checkout and passed; the final full suites and Docker adapter hash refer to current source. The isolated Studio backend suite used `PYTHONPATH=/home/fluke/Agenttree/src` and SQLite fixtures, not the production database.

The extra `git diff --cached --check` audit reports pre-existing whitespace in six staged historical evidence files: `verification-integration/v2-stream.txt`, Playground `disposable-cleanup.log`, `frontend-final.log`, `isolated-frontend-docker.log`, `original-frontend-docker.log`, and Visual Builder `frontend-tests.log`. These captured logs were not rewritten or restaged. The requested current `git diff --check` passes for both repositories; the staged-log warning is disclosed separately rather than called a clean whole-index result.

### Docker, logs, network and data preservation

Backend and frontend were rebuilt using the existing Compose setup; the backend consumes the sibling Core build context rather than vendored code. The final backend restart occurred only after all acceptance Runs were terminal. PostgreSQL was not reset or recreated for verification; existing database/artifact volumes remained mounted.

PostgreSQL, backend and frontend are **running / healthy**. Alembic current and head both report **`0013_run_cancellation_status`**. No migration was added or applied beyond checking the existing head. Current health/head evidence is in [docker-health.jsonl](provider-qualification-20261002/docker-health.jsonl) and [migrations.txt](provider-qualification-20261002/migrations.txt).

The actual browser traversed the normal Run creation, SSE/durable timeline, status, result, Trace, artifact-preview and catalog paths. Live/final durable event counts were reconciled with persistence; no parallel execution transport was used. Browser warning/error retrieval returned `[]` in [browser-console-final.json](provider-qualification-20261002/browser-console-final.json). Earlier live container logs were inspected during acceptance. The final available backend/frontend log scan found no Traceback, Internal Server Error, uncaught or unhandled markers; safe aggregate evidence is in [final-log-evidence.json](provider-qualification-20261002/final-log-evidence.json).

A complete browser HAR/status capture is unavailable from the current tool surface. Final container logs do not include HTTP access lines, so their empty status counter is not presented as proof of every request's status. Rebuilding replaces the preceding backend container's log history; the final scan covers the current available logs. Independent SSE reconnect receipts from earlier closure remain historical evidence; this task verifies actual live/terminal event correlation and reload, without claiming a new separately captured reconnect test.

| Original database resource | Entry | Final |
|---|---:|---:|
| Users | 3 | 3 |
| Trees | 2 | 2 |
| Provider connections | 4 | 4 |
| Secrets | 3 | 3 |
| Tool connections | 4 | 4 |
| API tokens | 7 | 7 |
| Runs | 16 | 22 |

Read-only comparison confirmed **every original ID** remains and exactly the smoke plus five acceptance Run IDs were added. General Analysis retains v7 and the authorized v9; the other original Blank Tree's mapping is unchanged. No disposable resource was created, so no cleanup is needed. The six new Runs and ten artifacts remain meaningful certification evidence.

In-memory comparison against the three actual Secret values and their stored ciphertexts found **zero matches** in the six new Run results/usage/metrics/event payloads or artifact bodies. Values were never printed or written to evidence. This measured check does not claim exhaustive detection of all possible encodings. See [final-preservation.json](provider-qualification-20261002/final-preservation.json).

### Files changed by this task

Studio implementation and tests:

- `backend/services/model_discovery_service.py`
- `tests/test_model_qualification_failures.py` (new)
- `frontend/src/lib/provider-models.ts` (new)
- `frontend/src/pages/providers.tsx`
- `frontend/src/pages/providers.test.tsx`
- `frontend/src/components/tree/provider-model-selector.tsx`
- `frontend/src/components/tree/provider-model-selector.test.tsx` (new)
- `frontend/src/components/tree/agent-details.tsx`
- `frontend/src/pages/trees/template-setup.tsx`
- `frontend/src/locales/en/translation.json`
- `frontend/src/locales/th/translation.json`

Evidence-backed Core exception:

- `/home/fluke/Agenttree/src/agenttree/providers/compatible.py` — optional-content normalization plus retained object guard.
- `/home/fluke/Agenttree/tests/test_compatible_providers.py` — eight contract regression cases.

Verification documentation/evidence:

- `docs/verification-playground-runtime-closure/report.md`
- `docs/verification-playground-runtime-closure/screenshots.md`
- New JSON, migration/health summaries and 20 JPEGs under `provider-qualification-20261002/`.

Core is **intentionally not clean**: it entered this task with earlier authorized runtime modifications, and this task adds the proven adapter correction plus one newly modified test file. It now has 16 modified tracked files and the same three untracked earlier regression files. No reset, broad staging, commit or release was performed. These local Core changes still need their normal release process for independent downstream installations.

### Remaining factual limits and final decision

- Provider quota can change. Groq's historical quota subtype/Retry-After is not retained. No current quota guarantee is claimed.
- The selected Ollama model passed text/structured probes but did not emit the requested function; it was not used for the Tool-dependent full acceptance sequence.
- Text qualification is not a full suitability certificate for every catalog model. Only the selected canonical Gemini mapping was certified with five full hierarchical Runs.
- SDK-internal retries and a complete new HAR/reconnect capture are not observable in this evidence. No active-Run backend-restart recovery claim was added; completed Run/Trace/artifact recovery passed.
- Earlier unavailable historical raw Provider/Tool failure payloads remain unavailable. Successful current review and Artifact evidence is separate and real.
- Test deprecation, deliberate error-boundary test output, existing bundle advisory and historical staged evidence-log whitespace remain disclosed; real browser warning/error output is empty.

All three requested gates passed: **model qualification UX**, **configured Provider health diagnosis**, and **real runtime reliability acceptance**. There is no remaining deterministic framework defect demonstrated by these probes. The real earlier repair, safe external failure evidence and new successful sequence are preserved with their distinct provenance. **COMPLETE.** No next phase was started.
