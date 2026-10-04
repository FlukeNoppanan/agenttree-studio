# AgentTree Studio — Thesis Baseline v0.1.3 verification

## Acceptance status and publication boundary

**Acceptance verified.** Updated 2026-10-04 (Asia/Bangkok). Backend, frontend, actual Docker/PostgreSQL, authenticated Chromium, real Gemini/Core Runs, resource deletion, history retention, Template import, catalog, responsive Dashboard and authorization checks passed as detailed below. Publication is performed only after this acceptance gate; the exact resulting commit, normal remote push and annotated tag are recorded in the ignored local [publication receipt](publication-receipt.json), which is generated after publication. This document does not assert a push before its receipt exists.

The earlier login pause was resolved by the user through normal sign-in. No browser session injection, original credential change or authentication bypass was used. The user explicitly authorized a temporary HTTP Admin test account following an automatic approval rejection; that account and the restricted account/API Key were removed in a `finally` cleanup. Core remains frozen and untouched.

## 1. Initial repository and scope

| Item | Verified state |
| --- | --- |
| Initial Studio | Clean `main`, `3ff7af00d0bbcd6da1f624964d020bc16661b825` |
| Previous baseline | Annotated `thesis-baseline-v0.1.2`, same commit |
| Candidate commit | `$Format:%H$` (expanded by archive; exact tag/remote identity in publication receipt) |
| Core checkout | Clean `a1315a4f3d9498005522fd233c4e4cd6f849b0d7` |
| Frozen Core runtime | `f01856b99a079c01e00c60988d3657819c95a188` |
| Core modifications/publication | None; no Core v0.1.3 tag |
| New dependencies | None |

The read-first findings and primary research sources are in [audit.md](audit.md). Resource lifecycle is Studio persistence/dependency work; no orchestration, provider execution, authentication, API version, Learning, A2A, distributed execution or case study was implemented. No historical tag is moved or force-pushed.

## 2. Resource lifecycle correctness

### Root cause and authoritative current state

Provider and Tool dependency guards previously joined every Tree version. Provider/Tool FKs also used `RESTRICT`, so merely filtering a dialog would leave the database blocking historical-only deletion. Live use is now defined by **`Tree.current_version_id == TreeVersion.id`**, never `MAX(version)`. Any current Agent in any Tree still protects its resource, including Root/Manager/Specialist.

Deletion locks the live resource row, checks current dependencies, backfills safe historical identity, flushes, then deletes. Nullable `SET NULL` resource FKs retain Agent configurations and Tool assignments. The identity allowlist is `id`, `name`, `resource_type`: no Secret IDs, URLs, headers, ciphertext or credentials. Existing snapshots are retained rather than rewritten to the current resource. Historical serialization preserves the original logical ID, name/type, model and deleted marker; it never substitutes or resurrects a resource.

Tool assignment counts/listings/replacement now use current versions, reject historical Agent IDs and preserve inaccessible Tree assignments. Historical bindings in execution detail are drawn from the Run's pinned version, not the current Tree.

| Resource | Actual behavior |
| --- | --- |
| Provider | Historical-only use allows deletion; any current Agent use blocks it. |
| Tool | Historical-only deletion preserves assignment/identity; current assignment blocks. |
| MCP | A `ToolConnection` resource type, using the same lifecycle; runtime unchanged. |
| Secret | Direct live Provider/Tool/Result Destination FKs still protect it. Rotation releases the old Secret. Versions do not snapshot Secret values. |
| Result Destination | Existing Tree scope and historical delivery `SET NULL` plus name/type retained. |
| Incoming Webhook | Existing Tree ownership and hashed credential retained; no historical Provider/Tool lock or Secret FK. |
| Template metadata | Portable requirement keys, no live resource FKs; never locks resource deletion. |

### Migration and historical evidence

Additive migration **`0014_resource_history`**, after `0013_run_cancellation_status`, safely backfills identities and makes resource FKs nullable/`SET NULL`. Provider/Tool deletion never cascades to Trees, versions, Runs, Trace, results or Artifacts.

Populated SQLite batch recreation could cascade-delete assignment rows while a referenced table was replaced. The migration connection now disables SQLite FK enforcement during recreation, checks `foreign_key_check`, and restores enforcement. Ordinary application FK behavior is unchanged; PostgreSQL retains transactional migration. Tests exercise populated retention, both resource deletions, safe downgrade and refusal of a lossy downgrade containing tombstones. Actual PostgreSQL current and heads both report `0014_resource_history (head)`; see [postgres evidence](checks/postgres-migration.json).

No restore/rollback/activate-version endpoint exists. Reusing a deleted ID in a new current version is rejected by existing validation; restoring history does not silently recreate a resource. Safe downgrade after tombstones requires an appropriate backup instead of erasing history.

### Mandatory original-bug answer

The original user's General Tree had already been intentionally deleted in an earlier task. The same historical/current scenario was reproduced with explicitly disposable real Trees, using historical v1 and current v2 (not a claim that the original v7 was still available). Before the fix, Provider A deletion was blocked in the real service/database; [pre-fix evidence](checks/pre-fix-runtime.txt). This pre-fix reproduction was not in the browser.

After the fix, through the authenticated real UI:

- **Can historical-only Provider A be deleted WITHOUT deleting its Tree? YES — REAL UI VERIFIED.** A `6869e26e-d658-4696-a3b4-d28afd495eb5` was deleted while its Trees remained.
- **Can a currently-used Provider be deleted? NO — BLOCKED BY CURRENT DEPENDENCY.** The dialog lists current versions only; Provider C returned independent authenticated HTTP **409**. Final Thai/Dark dialog correctly showed 12 current Agents in three Trees, excluding their historical versions.
- **Does the old version still exist? YES.** Fifteen versions and 25 Agent tombstones retained before fixture cleanup; no version was rewritten to Provider B/C.
- **Does the current Tree still work? YES.** Ready current Quick Summary executed in Chromium after A deletion, Run `fe594357-9338-4c4e-a447-f736f5e60258`, completed, 2.499 s, 25 persisted Trace rows.
- **Historical Execution remains? YES. Trace remains? YES. Final Result remains? YES.** Run `93cbba7f-186f-4e17-b54f-a2df628976ae` still pinned v1 with original A identity/deleted marker and 25 Trace rows.
- **Artifacts remain? YES.** Two Artifact records and actual file preview from historical failed Run `6a6a48ce-c1fd-4045-a293-7189e81f7804` remained accessible. Its failed status was retained truthfully.

These properties were verified before explicitly deleting the disposable Trees themselves during requested cleanup. [Post-UI database assertions](checks/post-ui-lifecycle.json), screenshots 06–14/45 and [real HTTP](checks/real-http-closure.txt) preserve the evidence.

### Tool/MCP and Secret rotation

A real HTTP Tool invoked the backend health endpoint with a harmless verification header. Live Secret A deletion was blocked; rotating the Tool to Secret B allowed deleting A while B remained blocked. Tool A historical-only deletion succeeded after current binding changed to Tool B; current Tool B stayed protected. Historical Tool identity and current readiness were retained. All fixtures were cleaned: [HTTP/Secret lifecycle](checks/live-http-secret-lifecycle.txt).

A second real-browser HTTP Tool test exercised Edit → select Secret B → Save & Test → Connected, old Secret A deletion, and the current B dependency dialog. Independent HTTP DELETE B returned **409**. Secret values were never printed or captured. Screenshots 25–26 and the post-UI assertions document it.

## 3. Templates and Tool/MCP ecosystem

### Template inventory and progression

**16 total: 5 Beginner, 7 Intermediate, 4 Advanced.** Original five retained; eleven distinct starting configurations added using the existing validated portable v2 schema, hierarchy and capabilities.

| Difficulty | Templates |
| --- | --- |
| Beginner | Blank Tree; Quick Summary; Concept Explainer; Compare Options; Structured Brief |
| Intermediate | General Analysis; Document Analysis; IT Troubleshooting; API & Data Analysis; Content Draft & Review; Incident Text Triage; Technical Q&A Review |
| Advanced | Software Design Review; Decision Board; Operations Change Plan; Research Report Artifact |

Difficulty describes setup/team complexity, not a quality score. Metadata gives intended outcome, realistic input guidance, setup and scope. Supplied-text Templates do not claim live browsing, file/device modification, monitoring or database integration. Template definitions contain no environment-specific Provider, Model, Secret or Tool connection IDs. All 16 are structurally validated by automated tests.

Actual UI checks: Beginner/Intermediate/Advanced filters returned **5/7/4**, advanced report search returned one match, and Intermediate Content category returned the intended Template. Preview shows actual role labels, hierarchy and distinct required/recommended slots in both locales. Required Artifact slots produce backend-authoritative blockers; recommended Filesystem remains optional and its copy accurately describes configured allowed directories.

**Template → Visual Builder: YES, direct unsaved import.** Research preview/import showed all five Agents and missing Provider/required Artifact blockers. Cancel produced no Tree record. Quick Summary import was configured through existing Agent forms with an explicitly selected qualified Gemini Model, marked Ready, saved and reloaded. Advanced Editor matched the same three Agents/hierarchy/Model bindings. Tree `5cb34961-2092-4f07-a92d-019a3ff5293c` executed from real Thai Playground and opened the same Tree's Connect page. No random Provider/Secret binding or intermediate topology screen was added.

Create Tree's Visual Builder/Guided Wizard choice remains. Existing six-step Wizard opened, Cancel created no orphan, and Content Draft editing/validation/save worked. Existing original Blank Tree still opens unchanged in Builder. Getting Started remains state-derived and accessible; opening Connect updates only its existing UI acknowledgement. Welcome/session snooze semantics were not changed; existing regression tests pass.

### Real qualified Gemini executions

Every listed Run used actual Studio/Core execution, PostgreSQL persistence and the existing result/Artifact infrastructure. No fake progress or hardcoded graph activity. Qualified `models/gemini-3.1-flash-lite` and `models/gemini-3.5-flash-lite` were used through existing/disposable Gemini connections; original Provider configuration and credentials were not changed.

| Accepted example | Run | Final status | Duration | Persisted Trace | Artifact |
| --- | --- | --- | --- | --- | --- |
| Beginner Quick Summary | `93cbba7f-186f-4e17-b54f-a2df628976ae` | completed | 7.561 s | 25 | 0 |
| Beginner current version, browser after A deletion | `fe594357-9338-4c4e-a447-f736f5e60258` | completed | 2.499 s | 25 | 0 |
| Intermediate Content Draft & Review, browser | `eb521294-948b-4c0a-815a-7c74812fee50` | completed | 1.889 s | 25 | 0 |
| Advanced Research Report Artifact | `2250752c-3aee-47c1-b17c-6b4b13540c86` | completed | 14.419 s | 130 | 1 |
| Newly imported Beginner, Thai browser | `45aa66a9-06fd-4e07-b0e8-419cdaa421c6` | completed | 2.231 s | 25 | 0 |

Beginner and accepted Intermediate legitimately answered through Root directly; their Managers/Specialists stayed idle. **Intermediate acceptance is successful execution of its valid Template, not proof of delegation.** The earlier Intermediate `0b82c1cb-98ae-481a-ac62-3ce15c24e1a1` has database `status=completed` but `final_status=partial` and 124 Trace rows; it is explicitly NOT counted as a full success. Its delegation/review/internal failure is preserved as diagnostic evidence.

Advanced acceptance exercised multiple Managers, Specialist work, real Artifact Tool use, **Manager Review passed** and **Root Final Review passed**. Its actual persisted `data_protection_report.txt` was inspected alongside the same Run's 130-row Trace. Root-direct Software Design Review is not counted as advanced delegation acceptance. Failed final-review/rate-limit attempts and their Artifacts are recorded honestly, without changing Core routing, schemas, review or retry policy.

The accepted Intermediate final text introduced an unsupported “No downtime” detail despite its input constraint. Runtime completion is not factual-quality certification; this quality limitation is recorded instead of hidden or fixed in Core. Beginner browser input/output and advanced review evidence provide the required functional acceptance.

[All final persisted Run metadata](checks/post-ui-lifecycle.json), [advanced transport evidence](checks/alternate-provider-runtime.txt), [earlier attempts](checks/template-runtime.txt) and screenshots 12–14/20–21/36 correlate UI and persistence. Playground core-event count **16** differs legitimately from full technical Trace **25**, which includes operation/checkpoint records; neither count is hardcoded.

### Real catalog: nine entries, no fake installations

| Classification | Entries |
| --- | --- |
| Ready (1) | Artifact Output — existing Run-scoped adapter, no Secret/connection needed |
| Setup required (3) | Web/API Request; Generic MCP Server; GitHub Account API |
| Catalog addable (3) | Filesystem MCP; Fetch MCP; Knowledge Graph MCP — honest external registration guides |
| Coming soon (2) | Database; Monitoring / Observability — unavailable connectors, disabled actions |

Catalog profiles use existing adapters; no new runtime Tool, MCP installer, marketplace or unrestricted shell was added. Source/scope/permissions explain file read/write/move, network access and external knowledge-graph persistence. Profile ID is retained on compatible edits and omitted on incompatible type changes so requirements match actual profile identity, never a display-name guess.

**MCP “+” actual semantics:** opens configuration/registration; it does not import a server binary, connect automatically, or install software. After user configuration, Test connects/launches the configured transport, Discover lists actual Tools and explicit selection chooses what Agents may use. Existing stdio transport launches the explicitly configured executable inside the backend container. That executable/directories must be accessible there. A user-configured package runner may resolve software externally; Studio adds no installation action.

**MCP '+' does not mean local software installation.** No arbitrary server was launched by browsing the catalog. Real browser Filesystem guide → existing MCP form → Cancel worked without creating a record.

For real MCP acceptance, an owned disposable clone of the existing Filesystem server connected, discovered **14** Tools, selected `read_text_file`, and invoked it once against an owned harmless file. Returned content matched. No original configuration or write Tool was touched; clones/file were removed. [Connect](checks/live-mcp.txt), [read invocation](checks/live-mcp-read.txt). The recorded selected count zero is the initial connection state before explicit selection.

EN/TH setup, optional-resource help, technical nouns and Catalog were reviewed in the rendered UI. Final iteration corrected Artifact description/instructions/operations to natural Thai while keeping **Artifact Output**, **Web/API Request**, **Tool**, **MCP**, **Run** and **Secret** recognizable; live language switching is tested. See [catalog guide](../template-tool-catalog.md).

## 4. Dashboard structural and visual acceptance

**Old problem:** seven equally weighted metrics, duplicate quick actions, long repetitive Tree rows, and separated Provider/attention cards diluted the next action. Warm stone/olive surfaces competed with the technical graph identity. Genuine v0.1.2 frontend BEFORE screenshots were captured before deploying the candidate frontend. Backend was already candidate and verification data was populated; these are honest frontend visual comparisons, not pre-migration database snapshots.

**New structure:** readiness/active Executions/qualified Models lead into recent Runs and compact explicit Tree Build → Playground → Connect rows. A quieter right rail groups attention, last-checked Provider status, small inventory and compact Getting Started. Repeated large action buttons and a wall of equal metrics are removed. Run ID, date, duration and real status are visible. No chart, uptime or AI-performance data is invented.

Admin uses existing `/api/dashboard/summary`; restricted users use `/api/dashboard/me`, with permission-filtered data. The static Root→Manager→Specialist reference is explicitly **not Live Execution**. No animation implies a Run happened.

Shared cool-neutral surfaces and blue interaction accents refine existing tokens throughout the UI. Final Light/Dark palettes and source research are in [visual-review.md](visual-review.md). No new theme system or dependency. Existing graph role cues, focus/reduced-motion rules and component language retained.

Actual screenshot-set review led to two iterations: connect the small architecture reference with correct parent/child branches instead of disconnected Specialist stubs; correct Template preview role badges and optional Filesystem semantics. Final rendered Catalog review identified and fixed Thai Artifact fallback. This is not a claim based only on CSS/build output.

| Real visual gate | Result |
| --- | --- |
| Populated Dashboard | Passed with actual completed/partial/failed Runs, ready/draft Trees and Provider state |
| Minimal Dashboard | Passed after cleanup: original one draft Tree, zero Runs, real next-step guidance |
| Light / Dark | Both reviewed; surfaces, sidebar, status/inputs/dialogs remain readable |
| English / Thai | Live switch, natural descriptions/technical terms; original user-stored descriptions remain unchanged |
| 1440×900 / 1366×768 | Passed; readable grouping and action placement |
| Narrow 700×900 | Stacks columns, hides decorative reference; document width does not exceed viewport |
| Visual review after final iteration | Completed on actual screenshots as a set, including before/after and minimal state |

Dashboard final screenshots 27–30 and 46–47 distinguish iterative evidence from final styling. The new populated page is shorter (captured content ~1857 px versus old ~2551 px at the same width); counts differ naturally because more real tests occurred. Long content still scrolls normally. Backend data and existing qualification rules remain source of truth.

## 5. Real transport, authorization and regression

A named disposable restricted user with `manage_trees_agents`, `use_trees`, `view_executions` and one explicit Tree grant was tested against actual HTTP backend authorization. Allowed Tree GET **200**; ungranted GET **403**; direct ungranted mutation denied **403/404**. Provider/Tool/Secret lists and Admin Dashboard returned **403**. Own Dashboard returned **200**, only its granted Tree, and hidden resource counts `null`. This is backend enforcement, not an inference from hidden navigation. Restricted Dashboard rendering has automated component coverage; no restricted browser login was fabricated.

Temporary Admin normal cookie login independently verified both current resource DELETEs **409**. Original Admin credentials/users were unchanged. Test Admin/restricted user and API Key removed in `finally`. Evidence includes safe identity/permission fields only.

Real V1/V2 reads of the same completed Run, result, events and Artifacts returned **200**. Real V2 SSE replay with `Last-Event-ID: 1` returned exactly persisted core sequences **2–16**, with no duplicates. No API contract/protocol changed. This candidate did not submit new Runs through all six language/API examples; existing full endpoint tests passed and previous client evidence remains in v0.1.2. New runtime acceptance used Studio service/UI, not claims about unexecuted API-client submissions.

Earlier verification-helper errors are not hidden: Studio cookie-only routes reject bearer-only authentication (**401**), so the helper was corrected to normal cookie login. A replay helper initially compared full Trace sequence rather than durable core sequence; corrected comparison passed. Expected **403/409** are intentional permission/dependency tests.

Actual authenticated browser flows covered Template → Builder configuration → Ready/save/reload → Advanced Editor consistency → Playground real Run → result/Trace → Connect exact Tree; original Builder read; six-step Wizard editing/Cancel; Create Tree selector; Getting Started. Existing onboarding/Builder/Playground/Run/Trace/V1/V2/Webhook/API Key/cancellation suites remain passing.

## 6. Engineering, Docker and inspection

| Check | Final result |
| --- | --- |
| Backend full suite | **345 passed**, 1 existing Starlette per-request-cookie deprecation |
| Frontend full suite | **340 passed**, 51 files |
| TypeScript | `tsc -b` passed |
| Production build | Passed, largest entry **773.22 kB / 227.15 kB gzip**; existing >500 kB warning retained |
| Diff whitespace | `git diff --check` passed |
| Docker | PostgreSQL, backend, frontend healthy; both images rebuilt, final copy correction redeployed |
| Migration | Actual PostgreSQL **0014_resource_history (head)** |
| Dependencies | None added |
| Core | Clean and unchanged; frozen runtime retained |

Test/build transcripts and [automated summary](checks/automated-summary.json) are preserved. Tests include current-pointer-not-highest semantics, all roles/multiple Trees, historical Provider/Tool/MCP deletion, Secret rotation, retained results/Trace/Artifacts, deleted-ID reuse rejection, current-only assignment replacement, populated migration/downgrade, all Templates, catalog permissions/classifications, required/optional slots, profile retention, filters/cancel, Dashboard zero state, safe pinned bindings and live EN/TH Artifact guidance.

Browser console warning/error inspection returned **[]** during final authenticated acceptance. Backend/frontend logs across the final acceptance were inspected: no ERROR/CRITICAL/FATAL or traceback. A transient Tools supplemental-options warning disappeared on normal reload after deployment; no repeated request loop or persistent failure was observed. Catalog final capture has no warning.

**Network evidence boundary:** real authenticated HTTP requests/statuses and real SSE payload/cursor reconciliation are saved in `real-http-closure.txt`. Browser tooling does not expose HAR/network-panel export; service logs contain no access-request rows, so there is no invented browser status histogram or claim that every browser request was captured. UI successful loads/saves/reloads and independent real HTTP verify the important transport boundaries. No credentials, headers, Secret values or ciphertext appear in evidence. [Inspection summary](checks/recent-log-summary.json).

## 7. Original database preservation and disposal

Original PostgreSQL volume retained throughout. No reset, `down -v`, deletion/reconfiguration of original user resources or recreation of original accounts. Final inventory compared with initial safe IDs:

- **3 original users, 1 original Tree, 3 Providers, 4 Tools, 3 Secrets** — every original ID retained.
- Blank Tree remains draft with unchanged current version `f5a3be68-a849-4dad-9948-aeb382cbe476`; original one Agent/version remains.
- Original **7 inactive API Keys, 2 Result Destinations, 0 Webhooks** remain; no new persistent credential remains.
- Initial **0 Runs / Trace / Artifacts** restored after intentionally removing only verification-owned Trees and their dependent evidence. This cleanup is separate from Provider-only lifecycle verification, which first proved history preservation.

Seven exact named disposable Trees, remaining Provider C, browser HTTP Tool, current rotated Secret B and their 10 Runs / 745 Trace rows / 5 Artifact metadata records were removed through normal services. Provider A and old Secret A had already been deleted in UI acceptance. Only the three Artifact directories derived from owned execution IDs were removed, with path/symlink guards; no blanket Artifact-store cleanup. Earlier HTTP/MCP clones and owned file also removed. Temporary test users/Key were already removed in `finally`. Audit Security Events legitimately remain.

[Cleanup](checks/cleanup.json), [final preservation](checks/preservation-final.json), [Docker](checks/docker-final.json). Prior user-confirmed General Analysis/Provider deletion from v0.1.2 was not restored or misrepresented as this task's deletion.

## 8. Files, evidence and publication

[Exact file list](checks/files-changed.txt) includes the Studio migration, models/schema/safe identity/dependency services, Template/catalog definitions, shared CSS, Dashboard/Template/Tool/Run detail UI, EN/TH copy, tests and documentation. No Core file changed.

[Baseline manifest](../thesis-baseline-v0.1.3.md), [screenshots](screenshots.md), [visual review](visual-review.md), [catalog guide](../template-tool-catalog.md). Screenshots are real captures, not generated mockups; loading/pre-iteration screenshots are identified and do not replace final-state proof.

Publication uses normal `main` push and a new annotated Studio `thesis-baseline-v0.1.3` only after all gates above. Historical v0.1/v0.1.1/v0.1.2 object/commit identities and Core frozen refs are independently rechecked. Exact resulting SHA/tag/remote GitHub state, clean working tree and test/acceptance receipt are stored post-commit locally, as prior baselines; tag annotations retain revision identity. No force push or Core publication.

## 9. Remaining limitations and next user test

- Qualified Provider responses still depend on quota and model behavior. Failed/partial attempts and unsupported Intermediate prose are explicit evidence, not hidden passes. Template topology does not guarantee delegation; Advanced delegation/review/Artifact acceptance did occur.
- Browser HAR export unavailable; independent authenticated HTTP/SSE and logs supply transport evidence, without claiming unavailable tooling output.
- Existing large bundle and Starlette cookie warning remain; no unrelated infrastructure rewrite.
- No version restore endpoint exists. Deleted binding reuse is rejected; migration downgrade deliberately refuses data loss after tombstones.
- MCP catalog registration requires an appropriately installed/configured external server and scoped permissions. Database/Monitoring remain coming soon. External knowledge graph does not create Core conversation memory.
- Existing browser-local Builder positions and Playground/backend process-local execution limits are unchanged; no claim of recovery after backend restart was added.
- No new case studies, Learning/A2A/distributed execution, new API version, installer or orchestration changes.

Recommended next evaluation: give a new Thai technical user the minimal Dashboard, ask them to choose a Beginner Template, explicitly select Provider/Model, run it, inspect the same Run/Trace and distinguish optional from required Tools. Then compare their ability to understand historical-only deletion and current dependency protection without verbal assistance.
