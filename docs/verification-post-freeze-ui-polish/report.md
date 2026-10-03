# Post-freeze UI polish + Thai README — acceptance record

**Local acceptance: PASSED.** This immutable report records the verified revision before publication. The post-commit **Git publication result**, literal commit/tag identities and remote README checks are recorded in local `publication-receipt.json`; that receipt is intentionally excluded from the commit it identifies. Public verification uses the repository branch/tag refs below. No remote success is inferred solely from this report.

## Scope and initial state

Audit started 2026-10-03; final checks crossed into 2026-10-04 Asia/Bangkok. Studio and Core were clean on `main`:

- Studio `6438d29e96c8fdff577bc5858e5c23ca090705a2`, historical annotated `thesis-baseline-v0.1` at that exact commit.
- Core `f01856b99a079c01e00c60988d3657819c95a188`, historical annotated `thesis-baseline-v0.1` at that exact commit.
- Studio remote: `https://github.com/FlukeNoppanan/agenttree-studio.git`; Core remote: `https://github.com/FlukeNoppanan/Agenttree.git`.
- Both default branches are `main`. Read-only remote preflight found Studio remote main `4086b80eecd0628914d860866f788a9f64e462b9`, Core remote main `1f9649e4f9c10bc38defdf1e3fef70bebf95df99`; neither remote had the baseline tags at initial check. Local baseline commits descend directly from those tips.
- Status/diffs/history/branches/remotes/tags and both peeled baseline targets were inspected before edits. Previous Final Integration Polish, Final UX Consolidation and thesis baseline reports/screenshots were read alongside current source.

## UI audit and presentation changes

Current identity is **Modern Industrial Graph**: stone/ivory Light, charcoal Dark, restrained accents, neutral working surfaces. Shared tokens and application versions are unchanged; there is no palette redesign.

| Area | Audit finding | Revision |
| --- | --- | --- |
| Dashboard | Oversized headings/panel gaps, cramped metric labels, resource cards within panels, desktop content stacking too early | Compact responsive metric grid, smaller type, reduced spacing, operational Provider rows, concise warnings; recent activity/actions remain adjacent at normal desktop widths |
| Restricted Dashboard | Larger metric type and spacing than operational pages | Same scoped density classes, existing scoped API/permission logic unchanged |
| Secrets | Sparse list and English-only action/feedback strings | Accessible compact table, small credential icons, explicit masked/encrypted-at-rest guidance, locale-aware dates and localized safe feedback/dialog controls |
| Users | Card-like account list, dominant wide form, weak access/status scanning | Semantic administrative table with role/access/status, small status badges and selection; narrower existing form beside table at desktop, stacked at narrow widths; no invented Team/Role model |
| Settings | Large health banner, nested visual weight and oversized rows | Compact language and health sections, neutral service rows, concise version/runtime facts; existing refresh and locale actions preserved |

A first browser screenshot pass revealed early stacking at the default 1280px viewport. The Dashboard/Users breakpoint was refined and the final layouts were recaptured. Shared CSS is scoped under `operational-page` / `dashboard-workspace` / `settings-workspace`, so unrelated Tree/graph/resource pages retain their styling. Secrets still displays only backend-supplied masks. There is no new reveal operation.

Thai cleanup is limited to these surfaces: Secret instructions/actions and Users permission labels retain Secrets, Tools, MCP, Executions and Live View; Settings retains its product name. Normal explanatory language is Thai. English and Thai keys remain aligned.

## README source audit and rewrite

Both root READMEs were rewritten as primarily Thai landing pages with English product/technical terms. They describe actual hierarchy, controller/runtime ownership, Provider adapters, Tool/MCP runtime, artifacts, versions, known limitations and license status. No LICENSE file exists, so no license was invented.

Studio documents the **actual sibling-Core additional Docker build context**, not the outdated claim that no local Core checkout is needed. Setup uses both repositories, frozen Core tag, existing Compose, `.env.example`, real ports and persistent volumes. Environment documentation contains names only. V2 is the recommended background integration; V1 remains synchronous. Incoming Webhook and outgoing Destination are distinct. Getting Started is reopened from the top bar. Planned Wazuh/Network/Software case studies remain explicitly planned.

Core README focuses on the framework, public imports, Capability routing, per-Agent Provider/Model, Tool/MCP, ExecutionRuntime/store capabilities and optional extras. Its offline example was extracted and executed against current frozen source: **completed, success=true, 21 Trace events**, with no credentials or external service. Core README is its only modified path; there is no new Core test certification.

All relative README links were checked against the final files; Mermaid blocks use GitHub-supported flowchart syntax. Installation commands were checked against actual package/Compose configuration and the existing real build. Fresh clones were not installed over the existing repositories/database. Git clone URLs/tag availability and default-branch README bytes are checked again at publication.

## Automated verification

| Gate | Result | Evidence |
| --- | --- | --- |
| Full Studio frontend | **314 passed**, 47 test files; baseline 310 retained, four new scoped tests | `checks/frontend-tests.log` |
| Full Studio backend | **309 passed** | `checks/backend-tests.log` |
| TypeScript | Passed (`npx tsc -b`) | `checks/typescript.log` |
| Production frontend build | Passed | `checks/frontend-build.log` |
| Studio/Core diff checks | Passed | `checks/diff-check.txt` |
| Core runtime source | Unchanged against frozen baseline; README only | `checks/core-documentation-only.txt` |

New tests cover accessible masked Secret metadata, transient-value clearing on Cancel, Thai Secret controls and the real system-health service/locale boundary. Existing suites continue checking authoritative Dashboard metrics, restricted grants, Primary Admin protections and User permission saves.

One existing Starlette TestClient cookie deprecation warning remains. Vite retains the existing >500kB chunk advisory; the build succeeds. Vitest prints an environment-performance suggestion. No coverage was removed, test skipped or warning concealed.

## Real Docker and database preservation

The original Compose project was rebuilt with `docker compose up -d --build`. No volume was deleted, database reset, resource reseeded or migration created. PostgreSQL/backend/frontend are **healthy**. Current and head are both **`0013_run_cancellation_status`**.

Counts and sorted ID-set hashes match before/after for all twelve audited tables:

3 Users, 2 Trees, 4 Providers, 4 Tools, 3 Secrets, 7 API tokens, 23 Runs, 10 Tree versions, 1,906 Trace events, 15 artifact metadata records, four Result Destinations, zero Webhooks.

See `checks/db-before.json`, `checks/db-after.json`, `checks/docker-health.txt` and migration checks. No stored meaningful configuration was saved/edited/deleted; normal browser preference changes are local only. No disposable database resources were required.

## Real browser acceptance

Used the existing authenticated Admin session in real Chromium (Codex in-app browser), without reading/changing credentials. All four modified pages were inspected in **Light EN, Dark EN, Light TH and Dark TH**, with real saved data. Screenshots were reviewed individually and as a set; compact neutral rows, shared surfaces, visible semantic states and consistent controls were retained.

- Dashboard: actual counts/statuses/Recent Runs/Provider data loaded, compact onboarding retained, links/actions remain available.
- Secrets: all three rows remain masked; Add Secret dialog inspected with an empty value and cancelled; no create/delete/reveal submitted.
- Users: all three existing accounts and Tree-access summaries loaded; selecting Primary Admin retains disabled Administrator controls and no Delete/deactivate. No password, grant, permission or User save submitted.
- Settings: actual API/Core/database/migration health loaded, Refresh health returned operational state; English → Thai → English updated immediately without reload.
- Default 1280×720 viewport, explicit 1440×900 desktop and 760×900 narrow layout inspected. Document width never exceeded viewport in the four narrow checks; table content remains locally scrollable where necessary. Overrides were reset.
- Unchanged-product smoke: Trees → existing General Analysis Ready v9 → Visual Builder (five Agents and Artifact Output, Saved / Configuration valid) → Playground (same explicit Tree, real history, idle graph); Executions history, Providers' four existing entries and Tools catalog/My Tools count four loaded.
- No paid Provider generation/qualification was requested. This is a UI-only regression check, not new runtime certification.

Screenshots: [index](screenshots.md). Original v0.1 historical screenshots/reports were not overwritten.

## Console, network and logs

Browser console inspection returned **zero warnings/errors** (`checks/browser-console.json`). Temporary HTTP first-line observation recorded method/path/status only, excluding query strings, headers, cookies and bodies. At final aggregation, **146 observations were all HTTP 200**. The two POST observations target read-only Tree validation during Builder/Playground load; they are not creation/save requests. Normal initial development fetches and health polling were observed, without an unexplained failure/retry loop.

This is sampled network evidence, not a full HAR or packet-body archive. See `checks/network-status.jsonl` / `checks/network-summary.json`. Backend/frontend log inspection found zero traceback, ASGI exception, HTTP 500 or frontend error markers (`checks/log-summary.json`); raw logs remain temporary outside version control. Frontend Docker serving still uses the existing Vite configuration; production build was verified separately.

## Sensitive-data and scope review

Diffs, new artifacts and commit candidates were audited before staging. Real environment values were compared in-memory, never printed. The scan found the same historical synthetic-fixture/translation-label/example-file matches (17 Studio, five Core), no new credential or local-environment-value match. Images were visually checked: masks/empty password fields only. No `.env`, real key/token, cookie/session export, dump, certificate, browser state or raw service log is included.

Backend, auth/RBAC, public APIs, database schema/migrations, Core runtime, Builder/Wizard/Playground logic and case-study behavior remain unchanged. Core version stays 0.2.2 alpha; Studio stays 0.1.0. Original baseline tags are neither moved nor recreated.

## Changed files and Git identity

Studio UI commit: `frontend/src/index.css`; EN/TH `translation.json`; `pages/dashboard.tsx`, `limited-dashboard.tsx`, `secrets.tsx`, `users.tsx`, `settings.tsx`; new `pages/administration-polish.test.tsx`.

Studio documentation commit: `README.md`, `.gitattributes`, `.gitignore`, `docs/thesis-baseline-v0.1.1.md`, this verification directory (report/index, safe checks, real before/after screenshots).

Core documentation commit: **`a1315a4f3d9498005522fd233c4e4cd6f849b0d7` — `README.md` only**. Studio UI commit: **`46be37c6038c3becc0141b11352af3d7425b9aa7`**.

Exact final Studio revision in an exported archive: **`$Format:%H$`**. Canonical tag: annotated **`thesis-baseline-v0.1.1`**, first message line **AgentTree Thesis Baseline v0.1.1 - UI polish**. The deterministic `export-subst` field avoids claiming a pre-manifest SHA as the tagged revision; normal checkout resolution is `git rev-parse 'thesis-baseline-v0.1.1^{commit}'`. Actual full SHAs also appear in the tag message and ignored post-commit receipt.

## Publication verification record

Publication destinations are exactly:

- [Studio default branch](https://github.com/FlukeNoppanan/agenttree-studio): `main`, historical `thesis-baseline-v0.1` and new `thesis-baseline-v0.1.1`.
- [Core default branch](https://github.com/FlukeNoppanan/Agenttree): docs-only `main` and historical `thesis-baseline-v0.1`; **no Core v0.1.1**.

The final local `publication-receipt.json` records normal-push results, verified remote branch/tag targets, default branch names, remotely fetched Thai README content hashes, final clean states and archive expansion. It is produced after the immutable commits/tags and is ignored for the same self-identity reason as the earlier freeze receipt. Public refs and the Thai README on each default branch permit independent verification. If a gate fails, publication must stop without forcing refs and the final user status must state the blocker.

## Remaining limitations and next step

Existing runtime restart limits, browser-local graph layout, external Provider/model variation, non-hermetic upstream dependencies and build/deprecation advisories remain. Administrative form fields are still the existing form; narrow viewports intentionally stack rather than introducing a new drawer subsystem. Sensitive writes/deletes and paid execution were not exercised because the user requested preservation and UI-only work; existing automated tests cover mutation semantics.

After verified publication, stop. Next planned user test: review the compact operational/admin pages with a thesis demo user, then begin the separately authorized **Wazuh → AgentTree → Discord** case study. No case study is started here.
