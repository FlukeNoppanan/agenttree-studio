# Phase 3 — Playground + Live Execution

**Status: PARTIALLY VERIFIED.** Implementation, regression suites, Docker, real Chrome, real Gemini Root execution, durable SSE reconnect, cancellation, reload, results and Run/Trace correlation have passed. Mandatory real Manager/Specialist execution and delegation-edge motion have **not** passed: the available Gemini models repeatedly failed during Root triage before a Manager started. No activity or screenshots were fabricated, and Core remains unchanged.

## 1–7. Initial audit and execution contracts

1. **Initial git state:** HEAD `4086b80`; latest ten commits inspected. Studio already had substantial dirty/untracked completed integration, onboarding, visual refresh and Builder work. All preserved. Phase 3 attribution uses a source snapshot taken before changes, rather than treating every current dirty file as new work. Core initially clean.
2. **Run architecture:** inspected current Studio/V2 APIs, RunService, async coordinator, Core adapter, schemas, authorization, persistence, cancellation, artifacts and UI. Existing cookie/CSRF `POST /api/studio/runs` supplies HTTP 202 and the real Run UUID. The same Core runtime executes API/Webhook/Studio work.
3. **SSE:** existing fetch-based Studio stream, `?after=N`, bounded backoff and durable replay; no new SSE protocol. Public V2 remains unchanged.
4. **Durable events:** journal operation events include stable actor UUID and operation key/type/phase/attempt. Transient output deltas are not durable/replayable. Detailed orchestration trace can be merged at terminal without a durable SSE sequence.
5. **Builder integration:** existing XYFlow BuilderCanvas, node styles, hierarchy/resource derivation and viewport controls reused in observation mode. No graph-library/dependency additions, duplicate graph engine, or editable execution graph.
6. **Agent identity:** Run.tree_version_id selects the immutable TreeVersion; actual AgentConfig UUID maps directly to node ID. Names/array order/role labels never determine activity. Historical selection never substitutes the current version's Agent IDs.
7. **Edges:** existing hierarchy:<child UUID>. Only actual manager.decompose or specialist.generate/revision starts can briefly emphasize their structural edge. Provider work/review alone does not invent delegation. Replay/history does not pulse. Tool identity is not guessed.

The audit recorded before implementation is [architecture.md](architecture.md). Prior visual-refresh and Builder verification reports and Phase 3 handoff were read.

## 8–17. Playground implementation

8. **Components:** lazy explicit `/trees/:treeId/playground?run=<UUID>` page, reusable Run hook, pure incremental operation journal, shared observation canvas and generic result component. Tree Detail and Builder link directly to Playground.
9. **Creation:** existing `api.submitLiveRun` with Tree ID/input; no `/api/playground/run`, memory, second history store, or execution path. Each submission is independent and creates a new Run.
10. **Readiness:** existing backend validation plus persisted Tree/version Ready status. Submit revalidates; backend remains authoritative. Blockers open Builder, preserving Agent UUID in `?agent=` where supplied.
11. **Graph state:** idle/queued/running/completed/failed/cancelled decoration kept separate from Tree config. Untouched Agents remain Idle, even when the overall Run completes. Terminal status settles only observed unfinished activity.
12. **Mapping:** unfinished operation keys support overlapping/nested activity and repeated review/revision. Incremental journal retains Agent state beyond the bounded timeline. Safe access loss clears observed data; late result requests cannot repopulate it.
13. **Timeline:** concise durable lifecycle and operation start/commit/failure entries, localized phases/attempts. Existing full persisted ExecutionInspector remains the inspection source.
14. **Live output:** only actual Root output deltas are shown as preliminary, using existing bounded live-output transport. No fake token reveal. Token streaming was not independently demonstrated with the final non-streaming Root fixture; the real final result always comes from persistence.
15. **Results:** persisted final output plus safe backend error/final_status; text, object, array and scalar values supported. JSON strings may be formatted as structured values. Raw view preserves the original output.
16. **Structured output:** independent JSON input validates and serializes to the existing string contract. Completed real JSON result Run `adec6c0d-a573-45fd-ad30-a3562a60ed6a`; a later JSON request failed during the same Gemini triage path. Both outcomes are recorded. No SOC/domain fields are embedded.
17. **Artifacts:** existing RunArtifacts metadata/preview/download endpoints reused, with a page-level transport regression test. Real acceptance Runs emitted zero artifacts. The inherited Gemini Artifact Tool schema incompatibility documented in Phase 2 remains unresolved; no artifact-success screenshot or claim.

## 18–25. Lifecycle and navigation

18. **Cancel:** existing real cancel endpoint. A real PostgreSQL 500 exposed `runs.status VARCHAR(20)` versus the 22-character `cancellation_requested`; additive migration 0013 widens it to 32. Chrome subsequently captured HTTP 200, status cancellation_requested, then persisted cancelled (`2241ba32-ab0e-4b94-8409-341947cfccae`). UI waits for backend confirmation.
19. **Reconnect:** client-only SSE interruption, not backend restart. Successful replay resumed at positive cursor (`after=3` in reconnect evidence; `after=5` in final evidence) and recovered the final result.
20. **Duplicates:** existing reducer and operation journal reject repeated durable sequences; replay correlation contains exactly sequences 1–15. Bounded timeline, delta buffers and cleanup retained; only one stream belongs to the selected Run.
21. **Reload:** active browser reload reattached to the existing Run before cancellation; completed reload recovered pinned graph, input, result and trace. Backend restart recovery remains process-local: startup closes interrupted executions with RECOVERY_UNAVAILABLE. No claim of durable active-execution recovery; startup behavior covered by existing integration tests, not a destructive restart during this acceptance Run.
22. **History:** existing Tree Runs drive selection; saved Run input/result/version reopened without live history animation. Run Again prepares editable input and submits a new UUID.
23. **Build loop:** actual missing-Model draft blocked Run; real Builder selection/Save & mark Ready repaired it; Playground then enabled Run. Existing Builder data/save/Advanced Editor semantics retained.
24. **Trace:** Open Execution Trace uses `/runs/<same UUID>?trace=1` and opens the existing full persisted inspector. Run Detail pins the same version and can return to Playground when management access exists. View Run preserves the same ID.
25. **Connect:** success CTA opens existing `/trees/<same Tree UUID>?tab=connect`. No Connect/API/Webhook redesign.

## 26–32. Presentation and interaction

26. **Light:** inspected actual input, result, shared graph, status, timeline and navigation in refreshed Light tokens.
27. **Dark:** same actual pages inspected; retained refreshed surfaces/Indigo identity. Small observation graphs omit minimap overlap; larger graphs retain it. No theme redesign.
28. **Thai:** real live language switch; natural explanatory language with Playground/Tree/Agent/Root/Manager/Specialist/Provider/Model/Run/Execution Trace/API unchanged. Prohibited transliterations absent from rendered Playground check.
29. **English:** switched back without reload; rendered controls/text correct and no Thai leakage in Playground labels.
30. **Accessibility:** labeled input/selects, semantic buttons, text state/phase beyond color, visible focus; keyboard-accessible Run/Cancel/Build/Trace/Connect. Observational nodes hide configuration/ports and refuse mutation callbacks. Desktop-first stack at narrower widths.
31. **Motion:** real Root state transitions, result appearance, terminal settling and timeline changes observed. Reduced motion verified through Chrome media emulation. Details and unobserved delegation limits in [motion.md](motion.md).
32. **Performance:** actual 1 Root/4 Managers/20 Specialists graph rendered all 25 nodes, Fit worked, zero graph DOM mutations over 1.2s idle; 900px viewport had no page overflow. Navigation/fit measurement includes deliberate waits and is not a benchmark. Larger resource-heavy execution was not exercised. No auto-follow camera oscillation or per-node idle animation loops.

## 33–40. Engineering results

33. **Phase 3 files changed/created:**

- `frontend/src/pages/trees/tree-playground.tsx`, `.css`, `.test.tsx`
- `frontend/src/lib/use-playground-run.ts`, `.test.tsx`; `playground-execution.ts`, `.test.ts`
- `frontend/src/components/playground-result.tsx`, `.test.tsx`
- `frontend/src/components/tree/builder/canvas.tsx`, `canvas.test.tsx`
- `frontend/src/pages/trees/tree-detail.tsx`, `tree-builder.tsx`
- `frontend/src/pages/runs/run-detail.tsx`
- `frontend/src/router.tsx`, `frontend/src/lib/api.ts`
- EN/TH `frontend/src/locales/*/translation.json`
- `backend/api/trees.py`, `backend/services/tree_service.py`, `backend/models/run.py`
- `alembic/versions/0013_run_cancellation_status.py`
- `tests/test_trees.py`, `test_studio_live_runs.py`, `test_destinations.py`
- `docs/verification-playground/` reports and evidence

34. **Backend:** optional `version_id` query on existing authorized Tree version GET, scoped to that Tree (foreign/missing version 404). No execution/auth/protocol changes. Run status column width adjusted for existing cancellation contract.
35. **Migration:** 0013 additive widening, preserves rows. Actual disposable PostgreSQL downgrade/upgrade round-trip preserved 18 Runs, returned VARCHAR(32)/head. Downgrade refuses to narrow while long statuses remain. Partial legacy schema compatibility retained. Original database preserved and migrated to head.
36. **Backend suite:** **233 passed**, one inherited Starlette per-request cookies deprecation warning.
37. **Frontend suite:** **232 passed / 37 files**, including operation mapping, long histories, concurrency/revision, identity filtering, failed/cancelled states, authorization races, readonly graph, readiness, creation/Run Again, bridges, artifact transport, structured rendering, locales and existing regressions.
38. **TypeScript:** passed `npx tsc --noEmit`; production build also checks project types with `tsc -b`.
39. **Build:** production Vite build passed. Existing >500kB main-chunk advisory remains; shared canvas is lazy. No added dependency.
40. **Diff:** `git diff --check` passed. Preexisting work retained, no test coverage reduction.

## 41–50. Real acceptance and evidence

41. **Docker:** original agenttree-studio and disposable ats-playground PostgreSQL/backend/frontend healthy; migration 0013 at head; original frontend proxy/backend health passed. Original before/after counts unchanged: 2 Users, 3 Providers, 0 Trees, 0 Runs. Original volumes never reset/deleted. Disposable ats-playground containers and its own volumes were removed after verification; Run IDs in evidence refer to that now-removed verification database.
42. **Chrome:** actual headless Google Chrome/CDP, actual login/cookie requests, real UI navigation and real network. Ready Run, independent Run Again, readiness/Builder repair, expected Provider failure, active/completed reload, cancellation, reconnect, themes/locales, full Trace/Connect, large/narrow graph exercised. No jsdom substituted for this evidence.
43. **Gemini:** disposable connection used existing working Gemini credential privately; stable `models/gemini-3.1-flash-lite` for successful acceptance. Already-qualified `models/gemini-3-flash-preview` also tried for delegation. No credentials in report/browser evidence; fixture secrets stored privately and removed during cleanup.
44. **Primary successful acceptance Run:** `5f007636-e68a-474a-8c33-5c5c13dc8c98`, Tree `1a6e2277-ed2e-439f-b4b6-c96a2f0f7368` (Playground Analysis), completed, 2872ms, persisted output available. A fresh Run on the final deployed source also completed: `32977c5b-e3a6-4c7c-9c66-ffd857cb5c0c`, 24 persisted trace events, actual Root Running observed (post-deploy-acceptance.json). Independent earlier successful Runs include `9caed002-cea4-45da-844b-5afb339020c9` and `8aa880c1-e3cc-4abb-bcfe-d6f505cce671`.
45. **Counts:** 24 persisted trace entries, 15 durable journal events, zero artifacts for final successful Run.
46. **Correlation:** Playground UUID = Run Detail UUID = full Execution Trace UUID. Durable sequences 1–15 equal the non-null core_sequence subset of the 24 stored trace entries; remaining detailed trace entries are legitimately non-SSE records. Pinned historical UUIDs verified after current version replacement.
47. **Console:** final/UI/performance captures have zero app console errors. No fabricated Manager/Specialist Running states. Chrome background registration messages are outside the app console.
48. **Network:** final Run/stream/result/artifact requests succeeded; actual 202 creation, 200 stream/replay/status/result/cancel. Final stream reconnect after=5. No final unexplained HTTP failures or API loops. Intentional SSE interruption and navigation can abort client stream reads; these are not Run failures. One verification-fixture attempt to edit an already Ready immutable version returned expected 409; corrected to a fresh draft. Initial cancellation 500 was investigated and fixed, not hidden.
49. **Logs:** backend/frontend logs inspected; final deployment logs contain no unexplained 500/traceback/runtime errors. Provider triage failures are real terminal Run errors returned safely, not server 500s. Evidence/private-value scans found no known credential/password/encryption-key leak.
50. **Evidence:** 32 real Chrome screenshots, [screenshots.md](screenshots.md), actual PNGs in `screenshots/`; `final-acceptance.json`, `reconnect-acceptance.json`, `cancellation-acceptance.json`, `ui-acceptance.json`, `performance-acceptance.json`, failed-delegation records, post-deploy-acceptance.json, checks/ suite/build/Docker logs, audit, motion and handoff documents. Screenshots only depict observed states; omitted Manager/Specialist/concurrent/tool/artifact states are explicit gaps.

## 51–53. Safety, limitations and handoff

51. **Core:** `git -C /home/fluke/Agenttree status --short` empty before and after work. No Core vendoring or edits. Learning, A2A, distributed execution, Human Approval, chatbot/RAG, conversation memory, provider architecture and Public API V1/V2/Webhook infrastructure untouched.
52. **Remaining acceptance limits:** Gemini Root planning can choose a direct answer; those successful Runs correctly leave Managers/Specialists Idle. Delegated attempts instead failed in real triage parsing (missing required objective), including alternate qualified model and non-streaming setting. Consequently live Manager/Specialist, delegation edge pulse, concurrent Agents, review/revision and Tool execution have automated contract coverage but no successful real-provider browser evidence. Artifact schema incompatibility inherited. Token deltas were not observed in the final fixture. Active backend restart recovery is unsupported. Existing layouts remain browser-local; Playground uses a readable automatic observation layout, not editable saved positions. These facts prevent a COMPLETE claim.
53. **Phase 4:** [phase-4-handoff.md](phase-4-handoff.md) documents stable node/edge mapping, non-mutating execution decoration, live hook/replay boundaries and Build → Validate → Playground → Inspect → Connect navigation work. Next acceptance step is a separately scoped investigation of Gemini triage structured output, then a successful real delegated Run to finish live hierarchy/motion verification. Do not bypass that issue by simulating activity or modifying Core without explicit scope.
