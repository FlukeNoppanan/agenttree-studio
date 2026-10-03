# Thesis baseline v0.1.2 — product acceptance

Status: **VERIFIED — acceptance complete; publication is independently proven by the publication receipt and remote refs.**

Verification date: 2026-10-04 (Asia/Bangkok). Studio commit: `$Format:%H$` in a Git archive. Application version remains 0.1.0. No new Core release.

## 1. Initial audit and scope

Studio started clean on `main`, matching origin at `8cad7bd38a6f2381520dd6c44cefef1afb456d20`, the immutable v0.1.1 baseline. Core started and finished clean at `a1315a4f3d9498005522fd233c4e4cd6f849b0d7`. Its difference from frozen runtime `f01856b99a079c01e00c60988d3657819c95a188` is README only. Existing reports for final integration, UX consolidation, post-freeze polish and runtime closure were read against current source before editing. Actual Chromium before screenshots were taken.

The current design is warm Modern Industrial Graph. The older Indigo identity was not reinstated. Existing Studio Runs, Core runtime, durable events, SSE, artifact storage, cancellation, Builder, Wizard, Templates and Connect are reused. No dependency, database migration, authentication, Public API contract, Core runtime, Learning, A2A, distributed execution or case study change.

Audit findings:

- Studio Run history returned an unbounded array and only had status tabs. Existing access checks needed to precede SQL count/page for the new opt-in query path.
- Trace had durable Core events and legacy orchestration rows mixed with operation/checkpoint noise. Dotted identifiers and payloads were the primary reading experience.
- Root finalization separately bounds Root and Manager revisions. Root REVISE feeds Managers' review of previous execution; Specialists rerun only when a Manager asks for revision. Root final synthesis follows finalization. These source facts guided copy; no runtime behavior changed.
- Getting Started had six useful real-state steps, explicit Tree choice and authoritative readiness. It needed deeper product documentation rather than another onboarding subsystem.
- API Keys were once-visible and hash-only. Connect already had the real V1/V2, incoming Webhook and outgoing Destination infrastructure; the starter examples needed complete status/result retrieval and accurate explanations.
- Dashboard had stacked modules and a separate full-width onboarding strip. Existing metrics could form a more deliberate workspace.

## 2. Implementation and contracts

### Human-readable Execution Trace

**VERIFIED.** A pure presentation mapper orders existing events by recorded sequence. It names observable planning, delegation, Specialist work, Manager Review, Root Final Review, synthesis, Tool/Artifact activity and terminal outcomes. It uses event Agent IDs and recorded names, resolving configuration names where available. It shows recorded objective, capability, feedback, review/revision number, duration and safe resource metadata only when present. It never invents capability matches or hidden reasoning.

Operation/checkpoint/decision-attempt noise is folded out of the human view. Duplicate lifecycle adapters show one representative; actual repeated review cycles remain. Unknown events have a neutral fallback. Every original row, sequence, actor, core sequence and sanitized payload remains in expandable Technical details. Each human activity also exposes its source event. The count is the original event count, not the shorter activity count.

**Manager Review: VERIFIED. Root Final Review: VERIFIED. Technical Trace preserved: VERIFIED.** Manager acceptance is separate from Root acceptance. `orchestration.final_result_created` is correctly described as the recorded review outcome before Root synthesis, not the already-finished user answer. Review PASS was observed in real Runs. REVISE/FAIL/limit mappings are covered by automated fixtures and current runtime-source audit; this report does not claim every review branch occurred in the acceptance Runs.

Execution detail keeps Result primary, human Trace immediately accessible, Artifacts separate, and full persisted inspector/timeline secondary. Result/Trace/Artifact anchors and Run ID correlation are preserved. Existing result rendering supports actual text/structured values; no domain-specific schema was introduced.

### Executions search and paging

**VERIFIED.** The existing `/api/runs` adds opt-in `page`, `page_size` (1–100), `search` (max 160), `status`, `tree_id`, `after`, `before`. Without `page`, legacy array callers retain their contract. Public V1/V2 are unchanged.

For pages, allowed Tree IDs constrain SQL before filters, count and limit/offset. Search is escaped case-insensitive Run ID or Tree name, not nonexistent prompt full-text. Ordering is created time descending then ID descending. Trace is not eagerly loaded for a list. Date filters use actual started time, require timezone-aware values and reject reversed ranges. Frontend local date-time fields convert to ISO with timezone.

URL persists search/status/Tree/from/to/page, with page reset on filter changes. Debounce and stale-response guards avoid typing loops. Rapid combined updates retain previous filters. All real lifecycle statuses remain available. Empty history and no matches differ. Clear filters and server paging work. Restricted users obtain granted Tree names from their permitted dashboard endpoint instead of forbidden management APIs.

### Dashboard, guide and API workbench

**Dashboard: VERIFIED.** Current tokens form a quiet command header, Build/Test/Understand/Connect strip, four operational metrics plus three resource metrics, recent executions beside actions, and compact onboarding inside the actions area. Counts are real; no demo statistics. Test Run goes to the selected Tree's Playground.

**Getting Started: VERIFIED.** Ten chapters with desktop sticky contents and narrow wrapped contents cover mental model, Secret → Provider → qualified Model, Builder/Wizard/Template, capabilities, optional Tools/MCP, backend readiness, Playground vs independent Runs, history/Trace, bounded reviews, Final Result vs Artifacts, API Key/Tree/input, V1/V2 and integration directions. The existing six real-state steps remain collapsed Quick Start and can be opened. Configure still opens an explicit picker when multiple Trees exist. A final audit aligned the guide's Trees → Playground and API Key next-step Trees → Connect links with the existing management-protected route. Restricted users retain the permitted guide/API-key actions; no permission model was changed.

**Secret → Provider flow: VERIFIED.** Existing encrypted/masked Secrets and Provider Secret references were inspected in browser. Existing Gemini qualified Models were used for real execution. Credential-free services need not create a Secret. No original credential was edited or printed.

**Final Result / Artifact: VERIFIED.** Copy explains primary answer versus separately preserved additional outputs, supported preview/download and file intent versus applied file change. Actual text artifacts were previewed/downloaded. An Artifact is not an Agent, Run or Trace.

**Public API product experience: VERIFIED.** Account key education distinguishes Provider Secret (AgentTree → Provider) from API Key (application → AgentTree). Creation shows once-only warning plus next actions/security guidance. Connect has selected Tree ID, deployment-aware Base URL, V2 recommendation, V1 sync option and complete cURL/Python/server-side Node clients. Code uses environment keys, never embedded browser credentials. Keyboard tabs support arrows/Home/End. Illustrative response shapes are explicitly labelled as examples, not live evidence.

**API Key → Tree → input → Result: VERIFIED.** Public input is text, not arbitrary native JSON objects. Structured source data must be serialized. V1 accepts its existing restricted metadata; V2 retains bounded metadata/timeout/idempotency/events/result/artifact contracts. Examples check HTTP failures and bound polling; callers must also inspect actual terminal/final statuses.

**Webhook: DOCUMENTED AS OPTIONAL. Result Destination: DOCUMENTED.** Direct API submits work; incoming authenticated Webhook accepts pushed input; Result Destination sends output outward. Existing settings remain intact. No new outbound delivery endpoint was invoked merely for documentation acceptance.

## 3. Automated and deployment gates

| Gate | Result |
| --- | --- |
| Full backend suite | 311 passed; one existing Starlette per-request-cookie deprecation warning |
| Full frontend suite | 331 passed in 50 files |
| TypeScript | Passed through `tsc -b` |
| Production frontend build | Passed; existing large-chunk warning retained |
| `git diff --check` | Passed |
| Fresh Docker build | Backend/frontend built without cache; recreated using existing volumes; final frontend rebuilt without cache after the permission-link correction |
| PostgreSQL/backend/frontend | Healthy, no container restart loop |
| Migration current/head | `0013_run_cancellation_status` / same head |
| Database migration | None |
| Dependencies | None added |
| Core | Clean and unchanged |

An earlier full backend attempt hit existing SQLite StaticPool SSE fixture flakiness in `test_v2_run_reads_follow_current_tree_grant_and_request_id`; isolated related tests and subsequent complete suites passed. A final test invocation using the pytest executable omitted the repository import path; it was rerun with the repository's documented `python -m pytest`. No test was removed or weakened. A sandboxed backend rerun stalled in the existing integration fixture; it was interrupted and rerun with local service access. The final added permission test initially had a TypeScript-only Testing Library option mistake; it was corrected before the final suite/build.

## 4. Real API acceptance

All six displayed clients were generated from the actual `apiExamples` export and executed against the real Docker backend with a disposable API Key. Python used requests; JavaScript was server-side Node with native fetch. No mocked runtime. V2 submitted a real 202 Run, read status, then result/events. V1 synchronously returned real output. Every client produced a new real Run ID and completed result.

| Client | Run ID | Runtime duration (ms) | Trace / durable |
| --- | --- | ---: | --- |
| V1 cURL | `6ba94fea-cb15-4df3-8f10-b556af294eb2` | 2196 | 25 / 16 |
| V2 cURL | `91b2d6e2-7900-44f4-ae1e-c447703fc803` | 1460 | 25 / 16 |
| V1 Python | `483ed36d-cd0a-47c1-995d-1fc85e7f6877` | 1434 | 25 / 16 |
| V2 Python | `a47f0489-8dae-4176-af1f-91974d880c2d` | 1434 | 25 / 16 |
| V1 JavaScript | `44319933-54ac-44ef-a897-bb5bd8d0b3a1` | 1619 | 25 / 16 |
| V2 JavaScript | `c909d069-00ea-486f-b83d-8b58c0ac2a3a` | 1330 | 25 / 16 |

These inputs legitimately used Root direct response and made no artifacts; Manager/Root review evidence comes from the delegated Runs below. See `runtime-evidence.json` and `client-results.json` (the latter contains five automated client summaries; V1 cURL is independently recorded in runtime evidence).

### Delegated Gemini Runs

1. Original General Analysis v9, Run `68554672-e27b-4ff2-96f5-b7e195d77429`: completed/final completed, 29,344 ms, 180 Trace / 120 durable events, two real final TEXT artifacts named university-ai-review.txt (1707 and 2449 bytes). Recorded actors: Analysis Lead, Research Manager, Synthesis Manager, Research Specialist and Analysis Specialist. Four Manager review starts, Root Final Review and synthesis were observed. Playground, Execution detail and Trace used the same Run ID. Result and artifacts were read from persistence before the user later deleted the Tree.

2. Explicitly disposable General Analysis Template Tree v1 using remaining existing gemini2 Provider and qualified `models/gemini-3.5-flash-lite`, Run `f18a34c0-ebef-4008-ba69-984d799df2a0`: completed/final completed, 24,435 ms, 181 Trace / 119 durable events, two TEXT artifacts (1709 and 1472 bytes). Real Manager review and Root Final Review were visible, with result/Trace surviving browser reload. Historical Playground and Connect remained the same selected Tree. This Run recorded two Tool failures (seq 74/103), then later Tool success. They are visible in human Trace and preserved technically; the safe event payload did not establish an exact upstream cause. No unsupported Gemini/Artifact fix or suppression was made. The named disposable Tree and its dependent test rows were removed after verification; safe metadata/screenshots remain in `final-run-evidence.json`.

## 5. Key security and authorization

Disposable CLI key: DB held a 64-character digest matching the raw token's hash, not plaintext. After normal revocation, actual V1 and V2 POSTs both returned 401 and created no Run. Temporary token files and the specific disposable record were removed; audit records remain.

The user separately approved browser credential creation at action time. Browser key `Disposable browser v0.1.2 verification` was created, hidden before screenshot/DOM inspection, copied successfully, then clipboard emptied. Creation guidance/security links were visible. Closing and reopening creation did not restore old raw key. Native confirmation for Revoke stalled the browser tool. The same normal backend AuthService revoked the key and removed only its test record; the user closed the stuck dialog. Reloaded Account showed no active keys. This tooling limitation does not replace the successful real revocation/rejection check above. Neither raw key appears in evidence or source.

Restricted disposable user had only use_trees/view_executions and one selected Tree grant. Real authenticated backend page returned only granted Runs (total 30; page size 2), granted Tree query returned 200, ungranted Tree query returned 403, hidden Tree-name search returned total 0, and direct mutation against the ungranted Tree returned 403. The disposable user/session were deleted through normal AuthService. Existing users/grants were not altered. Automated HTTP tests additionally cover authorization before count/page and legacy compatibility.

## 6. Real Chromium acceptance and visuals

**Light, Dark, Thai, English, responsive and cross-page consistency: VERIFIED.** Actual authenticated Chromium was used, not jsdom as visual evidence. No browser credential was changed.

- Dashboard real metrics/actions and compact onboarding in both themes/locales.
- Executions combined Run-ID search/status/Tree/local from-until, URL state, reload, clear/no matches, 25-row page and page 2 (26–30). Native date inputs were changed with real keyboard interaction; automation fill alone had not emitted the React change event.
- Human chronological Trace, Manager Review, Root Final Review, complete 180/181-event technical view, raw source event, formatted result and Artifact preview/download.
- Guide contents, natural Thai role/review/credential explanations, real setup progress, explicit Tree picker, developer code tabs including keyboard navigation, copy and response guide.
- Connect correct selected Tree ID, public `localhost:5173` origin (not internal Docker host), V1/V2 code, directions and existing integration controls.
- API Key masked creation/copy/next steps/once-visible close/reopen and cleanup.
- Create Tree dropdown retains Visual Builder and existing six-step Guided Wizard. Cancel creates no record. Template opens Builder draft directly and cancel creates no record.
- Existing Blank Tree Builder, Advanced Editor, and backend readiness-blocked Playground retain same Tree; no arbitrary selection or duplicate configuration was created.
- Secrets remain masked; Provider form references stored Secrets safely.
- Desktop 1440×900, 1366×768 and narrow 768×1024 checked. Dashboard, guide, API Keys, Connect, Executions and Execution detail/Trace have no document horizontal overflow. Inner code/table scrolling is intentional. Default viewport restored at end.

Visual set was manually inspected. Quiet warm surfaces, restrained role/accent colors, clear active navigation, grouped operational metrics and chronological Trace belong to the same product. Light/Dark use current shared tokens, not a new palette. Thai technical nouns remain English; model-generated output retains its actual language. See `visual-review.md` and screenshot index. One immediate-resize clipped Dashboard screenshot is excluded as primary visual proof in favor of the final stable capture.

No new continuous motion was introduced. Current reduced-motion behavior is preserved. Semantic labels, status text/icons, native disclosure controls, keyboard code tabs and focus controls remain usable. This is not a claim of a complete assistive-technology audit or mobile graph editing.

## 7. Console, network and logs

Browser warn/error captures were empty. Backend logs have no traceback; frontend logs have no uncaught exception marker. No 500 or crash/restart loop was observed. A temporary running-container-only Vite observer recorded METHOD/path/status, excluding headers, bodies, credentials and query values. It was removed and its original config restored; container/repository SHA-256 matched. `network-summary.json` records 451 requests: 443×200, 2×204, 1×201, 1×202, 3×404 and 1×502.

Explained non-success records:

- Two Tree 404s followed the user's intentional deletion of General Analysis.
- API-token DELETE 404 followed the native-dialog request reaching an already removed disposable key. It did not weaken revocation.
- One old Groq Provider `discover-catalog` returned the existing controlled 502 ProviderOperationError before the user deleted that Provider. Source maps discovery failures to this response without a traceback. Exact upstream provider diagnosis is unavailable after deletion; this is not reported as a successful Groq discovery or a new runtime certification.
- Separate scripted security checks intentionally returned 401 (revoked keys) and 403 (ungranted Tree). An initial attempt to use bearer auth on the cookie-only Studio Trace endpoint returned expected 401; acceptance read public V2 events thereafter.

No source observer, authorization header, raw credential or secret payload was captured. Observed repeated requests corresponded to explicit navigation/reload, normal live polling and final reconciliation; no unexplained request loop or duplicate Run submission was observed. This is an observed acceptance window, not a long-duration load test.

## 8. Database preservation and cleanup — explicit user exception

PostgreSQL volume was retained; no reset, destructive migration or `down -v` occurred. During acceptance the user intentionally deleted original General Analysis (`4aa0304a-ba85-4867-a419-e3823b340c1b`) and original Groq Provider (`c8b1373b-a73e-49ad-a8c7-8650c2aa2b47`). Successful DELETEs occurred at 2026-10-03 20:57:02/07 UTC. The user explicitly confirmed: “ตั้งใจลบเอง — บันทึกเป็นการเปลี่ยนแปลงระหว่างตรวจ”. They were not recreated.

General Analysis deletion normally cascaded its original Runs/Trace/Artifacts/versions/destinations and the seven already verified acceptance Runs. Thus **original database is retained, but original resource counts are not unchanged**, by the user's confirmed action. Prior safe metadata/screenshots remain valid evidence of what was actually persisted and observed before deletion; deleted Runs are not claimed to remain queryable now.

After separately cleaning the one named disposable final Tree, both test keys and restricted user, ID comparison shows original users 3/3, Tools 4/4, Secrets 3/3, API tokens 7/7, remaining original Blank Tree intact, remaining Providers 3/4. Counts: Trees 1, Runs 0, versions 1, Trace 0, artifacts 0, destinations 2, Webhooks 0. Missing IDs are the confirmed deleted Tree/Provider and their dependent rows; no unexpected extras. `database-comparison.json` records the comparison. Original blank Tree, Provider credentials, Tools, Secrets, users and remaining destinations were not rewritten.

## 9. Limitations and next use

- Core/Gemini Tool failures remain faithfully observable; this presentation revision does not change model/runtime/tool semantics or prove their upstream cause.
- Groq catalog discovery's exact upstream failure cannot be recovered after the user's deletion.
- Browser native confirmation tooling could not finish the Revoke click; actual AuthService revocation and real V1/V2 rejection passed.
- Existing bundle warning and SQLite fixture intermittency remain documented. No test coverage reduction.
- Browser reload restores persisted completed Runs; no claim of active execution resumption after backend process restart.
- Unknown future event types use neutral fallback; no generated AI reasoning. Historical model output is not translated by locale switching.
- No Wazuh/Network/Software Development case study completed. Webhook/Destinations were documented and preserved, not newly certified end-to-end with an external service.

Next user test: give a new Thai technical user a small delegated Template task, ask them to configure/test it, explain Manager versus Root review, distinguish Artifacts, then invoke the same Tree with the provided server-side client without external documentation.

## 10. Freeze and publication

All implementation/automated/real browser/runtime/API acceptance gates above are verified with the explicit user-directed data deletion recorded. Historical Studio v0.1/v0.1.1 and Core v0.1 refs were verified unchanged before publication. Only normal Studio main/new annotated v0.1.2 tag pushes are authorized. No Core commit/tag/push.

The receipt is deliberately local/ignored to avoid a commit changing its own SHA. Remote branch/tag refs are authoritative. See `../thesis-baseline-v0.1.2.md`, `publication-receipt.json`, screenshots and safe JSON evidence. This report does not infer publication merely from a tag name.

## Files changed

- `backend/api/runs.py`
- `backend/schemas/run.py`
- `backend/services/run_service.py`
- `frontend/src/components/account/api-keys-panel.test.tsx`
- `frontend/src/components/account/api-keys-panel.tsx`
- `frontend/src/components/execution-inspector.tsx`
- `frontend/src/components/getting-started.tsx`
- `frontend/src/components/human-execution-trace.tsx`
- `frontend/src/components/live/run-artifacts.tsx`
- `frontend/src/components/tree/api-examples.tsx`
- `frontend/src/components/tree/connect-tab.test.tsx`
- `frontend/src/components/tree/connect-tab.tsx`
- `frontend/src/index.css`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/trace-activity.test.ts`
- `frontend/src/lib/trace-activity.ts`
- `frontend/src/locales/en/translation.json`
- `frontend/src/locales/th/translation.json`
- `frontend/src/pages/dashboard.tsx`
- `frontend/src/pages/getting-started-guide.test.tsx`
- `frontend/src/pages/account-page.tsx`
- `frontend/src/pages/getting-started.tsx`
- `frontend/src/pages/onboarding-empty-states.test.tsx`
- `frontend/src/pages/runs/run-detail.tsx`
- `frontend/src/pages/runs/run-list.test.tsx`
- `frontend/src/pages/runs/run-list.tsx`
- `frontend/src/pages/trees/tree-live.test.tsx`
- `tests/test_auth.py`
- `tests/test_runs.py`

Plus this verification directory, the v0.1.2 manifest, and Git attributes/ignore entries for reproducible SHA substitution and the post-commit receipt. README and Core are unchanged.
