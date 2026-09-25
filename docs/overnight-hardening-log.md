# AgentTree Studio hardening log

Scope: Studio only. Preserve `postgres_data`, `studio_key`, and real records; leave AgentTree Core untouched.

| Area | Audit status | Finding / priority | Action | Verification |
| --- | --- | --- | --- | --- |
| Login/session | Working | Proxy-wide login rate limiting locked out unrelated LAN users (P1); generic 429 looked like bad credentials (P2) | Scoped lockout by peer plus username; distinct 429 message | Backend auth tests and frontend auth test passed |
| Tree access | Working | Backend resolver enforces `use_trees` and selected/all grants; verify direct-ID paths (P1) | Audit/tests pending | Pending |
| Tree management | Working | Ready Trees edit on Detail but not Tree list (P2); no list search | Ready edit action and search | Frontend Tree list test passed |
| Tree hierarchy/edit | Working | Versioned Ready edit, validation and drawer added in prior pass | Preserve and regression-test | Prior browser LAN + tests |
| Providers/models | Working | Ready-only selector; verify failure UX and direct references | Audit pending | Pending |
| Tools/MCP | Working | Real stdio/HTTP test and discovery exist; avoid fake runtime support | Audit pending | Pending |
| Secrets | Working | Masked metadata and encrypted values; check UI leak/error paths | Audit pending | Pending |
| Templates | Partial by architecture | `blank` is the only supported template | Preserve honest Blank Tree page | Browser + tests in prior pass |
| Blocks | Undefined | No route/API/model or authoritative contract (deferred) | Do not invent | Repository search |
| Runs/Live View | Working, partial | Live is persisted execution monitoring, not long-running runtime | Audit/filter UX pending | Pending |
| Account/tokens | Working | Token list lacked creation date and pending state (P2) | Dates, pending states, one-time copy/hide, no raw token re-display | Token lifecycle UI tests passed |
| Security events | Working, bounded | `SecurityEvent` writes existed, no Admin reader/UI (P2) | Admin-only metadata API (latest 100) and searchable UI | Backend 403/metadata test and frontend UI test passed |
| Dashboard | Working | Admin summary and permission-aware personal dashboard | Audit pending | Pending |
| Navigation | Working within implemented scope | Logs placeholder was misleading; Templates now real | Removed Logs route/link; added real Admin Security Events | Router build and UI test passed |
| Performance | Improved | Vite warned on ~706 kB main chunk (P2) | Route-level lazy loading | Main chunk 496 kB; build warning gone |
| Docker/LAN | Working | Three healthy services, DB unexposed | Rebuilt and deployed current code without volume deletion | All healthy; localhost and LAN frontend/API 200; PostgreSQL revision `0006_tree_access_mode`, one pre-existing User and Tree remain |

Research: [n8n execution filters](https://docs.n8n.io/workflows/executions/all-executions/), [Grafana trace drilldown](https://grafana.com/docs/grafana/latest/visualizations/explore/trace-integration/), [GitHub token revocation](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/token-expiration-and-revocation/). These inform status filtering, detail-on-demand, and honest token lifecycle UI; no external design is copied.

Final regression: backend 124 passed (one upstream deprecation warning); frontend 56 passed; TypeScript and Vite build passed; main JS chunk fell from 706 kB to 496 kB; `git diff --check` passed. Browser smoke passed on localhost and LAN, including disposable Tree creation/validation/Ready versioned edit, new My Trees and Security Events pages, Thai/English and 1440/1024/768 px layouts. Smoke User, Tree, Provider/Model and Tool were removed in the test's cleanup; immutable security-event history intentionally remains. `postgres_data` and `studio_key` volumes remain; `/home/fluke/Agenttree` has a clean Git status. No PostgreSQL reset or Compose down was performed during this pass.

Genuine limits: Blocks have no defined contract; only Blank Tree is an implemented template; long-running Tree Runtime is not implemented; MCP/provider live external connections depend on configured services and were not re-probed during this pass; Security Events is a bounded latest-100 view, not a full paginated audit query. No new Core or public integration semantics were invented.

## Account, navigation and audit follow-up

The subsequent Account/API Keys task supersedes the latest-100 audit limitation above. The old `/my-trees` route now redirects to Account → Tree Access, and the sidebar no longer advertises My Trees. Account has Profile, Security, Tree Access and API Keys tabs. Tree Access uses the existing effective-grant response and is read-only for normal users. Personal API key storage and backend routes remain hash-only and unchanged; the UI uses key terminology, a one-time result dialog, copy/hide/done, and confirmed revocation. Users management puts `Can use Trees` beside Selected/All and preserves explicit grants when switching modes. Security Events now provides server-side pages (25 by default, max 100), filters for actual event fields, and safe metadata detail. The study protocol is in [usability-test-plan.md](usability-test-plan.md).

Follow-up verification: backend 125 passed; frontend 61 passed; TypeScript and Vite build passed with a 495.81 kB main JS chunk and no size warning. Docker images rebuilt and deployed without resetting volumes. Real browser checks covered Account tabs in English and Thai at 1440/1024/768 px, API key one-time create/copy/hide/revoke on localhost and LAN, legacy-route redirect, Security Events filtering/detail/pagination, and User Selected → All → Selected access updates. Copy initially failed under an untrusted scripted `.click()`; trusted browser mouse input passed on localhost and on the LAN fallback path. Disposable Users, Tree, Provider/Model, Tool and keys were cleaned; legitimate Security Events remain. No Core or Public API V1 work was undertaken.
