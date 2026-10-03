# External integration consolidation — verified

Verified on 2026-10-01 against Studio baseline `4086b80`.

1. **Audit before modification.** Both worktrees were clean. Latest Studio commits contained Visual Tree Workspace and template/tool resolution work. Code inspection covered both Public APIs, Studio live routes, runtime, auth middleware/service, Tree/Run persistence, schemas, Account API Keys, Connect, legacy triggers/output, destinations, and the relevant tests. [Preimplementation factual map](audit.md).

2. **Existing features reused.** Account → API Keys, current User/Tree authorization, Tree readiness, immutable version pinning, `RunService.prepare`/`execute`, `AsyncRunCoordinator`, Core ExecutionRuntime, durable events, SSE, results, trace, artifacts, cancellation, safe persistence, and the existing outgoing delivery service.

3. **Webhook gap.** Outcome B: `TriggerConfig` stored `/api/trees/{tree_id}/webhook` metadata, but no ingress handler existed. Tree ID and route metadata supplied no authentication.

4. **Changes.** Connect recommends Async API V2, retains Simple synchronous API V1, provides cURL/Python/JavaScript and Copy controls, links to the existing Account API Keys page, and survives reload through the `tab=connect` URL. Origins come from the public-origin setting or actual browser proxy origin. Added authenticated incoming integrations, once-visible hash-only secrets, owner reauthorization, rotation, enable/disable/delete, last received, payload bounds, and normal async Run submission. Removed unused legacy Trigger/Output editor components while retaining stored models and compatibility serialization. Corrected API Key help and the missing `completed` final-status label in English/Thai. Updated user docs after runtime verification.

5. **Intentionally unchanged.** Public V1/V2 implementations and contracts, API key storage/lifecycle/scopes, Visual Tree Workspace, Learning behavior, A2A, distributed execution, Core code, and outgoing destination execution. No new orchestration engine or Public API version.

6. **Files modified/created.** [Exact file manifest](files.md), including source, migration, tests, documentation, sanitized evidence, and eleven real screenshots.

7. **Migration.** Additive `0012_webhook_integrations`, after `0011_template_instances`, adds one table with Tree/User foreign keys. Existing rows are retained. SQLite upgrade regression passes; PostgreSQL upgrade was exercised on both existing and disposable Docker databases. Both reached head. Existing resource counts remain 2 Users, 4 Trees, 3 Providers. No database reset.

8. **New API contracts.** Cookie-only `GET /api/auth/integration-config`; Tree management GET/POST `/api/trees/{tree_id}/webhooks`, PATCH/DELETE `/api/trees/{tree_id}/webhooks/{webhook_id}`, POST `.../{webhook_id}/rotate`; separately authenticated POST `/api/webhooks/{webhook_id}`. Ingress accepts `{ "event": {...}, "metadata": {...} }`, returns the existing V2 `RunAccepted` shape with HTTP 202, and requires a webhook-specific `athw_…` bearer secret. V1/V2 contracts are unchanged. [User contract](../external-integrations.md).

9. **V1.** Preserved. Real curl invoked the Ready Tree, received HTTP 200 and a completed synchronous result. Run `b01d2120-bdc2-46c9-88ce-455fce65baf1` persisted with trace in the disposable PostgreSQL database.

10. **V2.** Preserved. Real curl submission returned HTTP 202; Run `299f2793-9e69-4a9f-943e-7d32cca831c0` completed. Status/result/artifacts endpoints returned 200. An idempotent retry returned the same Run. SSE returned 15 durable event frames. Existing SSE, live output, cancellation, artifact integrity/body/restart, and idempotency regressions pass.

11. **API Keys.** Existing UI/service reused. Chrome created the once-visible key used by curl. A subsequent real UI check verified the Copy control, once-only dismissal, and revocation. PostgreSQL stored only SHA-256 hashes. Revoked-key requests returned 401. Current grants, deactivation, password changes/reset, and permission regressions pass.

12. **Webhook.** Chrome created an integration and captured its once-visible secret privately. Invalid secret returned 404; valid ingress returned 202 and created Run `5c3fa329-95b7-4e9d-97c7-4e918c1baf8e`, which completed with 15 normal durable events. Disabling in Chrome caused subsequent curl delivery to return 404. Automated tests additionally cover secret rotation, deletion, ownership isolation, current grant/permission removal, inactive/reset-required owner, draft Trees, legacy Tree-ID bypass attempts, capacity exhaustion, malformed/nonfinite/deep/oversized input, duplicate deliveries, and echoed-secret redaction including JSON keys.

13. **Destinations.** Existing outgoing Webhook Result Destination adapter/service retained. Existing independent delivery, failure isolation, sanitization, and Secret-backed configuration regressions pass. Connect labels outgoing destinations separately from incoming Webhook Triggers.

14. **Automated tests.** Final backend: **218 passed** (one existing Starlette per-request-cookie deprecation warning). Final frontend: **107 passed across 25 files**. New coverage includes 15 webhook/config/ownership backend cases and 5 Connect/completed-label frontend cases.

15. **TypeScript/build.** `npm run build` passed `tsc -b` and the production Vite build. Vite reports the existing main bundle above 500 kB as a warning. `git diff --check` passed.

16. **Docker.** Built and applied final backend/frontend images. PostgreSQL, backend, and frontend healthy. Migration head, direct backend health and frontend `/api` proxy health confirmed. Execution E2E used explicit disposable project `ats-integration-e2e`, with a validated generic Ready Tree and an encrypted copy of the existing qualified Gemini provider configuration (`models/gemini-3.1-flash-lite`). Real provider execution succeeded. Its containers, network, and both volumes were removed afterward. Existing Studio containers and persistent volumes remain healthy and intact. Private temporary credential fixtures were deleted.

17. **Real browser.** Chrome 153 performed login, Tree Connect, recommendation order, V2 URL/Tree ID, V1 option, both API language tab groups, Account API Keys navigation, key creation/copy/dismissal/revocation, Connect reload, webhook creation/disable, completed V2/webhook Run inspection, persisted execution timeline, and reload verification. No mock screenshots.

18. **Real curl/API.** V2 submission/status/SSE/result/idempotent retry/artifact listing, V1 synchronous invocation, invalid/valid incoming webhook, webhook event retrieval, revoked key, and disabled webhook. [API evidence](api-verification.json), [revocation evidence](revocation-verification.json), [SSE capture](v2-stream.txt).

19. **Security verification.** Hash-only API keys and webhook secrets verified in PostgreSQL. No raw existing credentials in list/read responses or integration configuration. Owner current access is enforced; inaccessible webhooks are non-enumerating. Cookie management retains CSRF and denies bearer-key fallback. Personal API keys cannot authorize ingress. CORS behavior is unchanged. Network captures store response URL/status only, without credential headers or bodies.

20. **Persistence/reload.** V2 and webhook completed Runs and timelines survived real Chrome reload. All three real Runs were independently confirmed as completed with persisted results and traces. Last received, disabled integration, and revoked key persisted. [Storage evidence](storage-verification.json).

21. **Logs/network.** Inspected backend and frontend Docker logs from both stacks and 3 Chrome network captures. No unexplained 500, traceback, unhandled error, or API key/webhook/provider credential leak was found. [Runtime evidence](runtime-verification.json). Helper selector/clipboard/module-name issues were confined to the browser harness; they did not produce backend errors.

22. **Screenshots.** All files are under `docs/verification-integration/screenshots/`:
    - [Recommended Async API](screenshots/01-connect-async.png)
    - [V1 synchronous and cURL examples](screenshots/02-connect-sync-curl.png)
    - [Python examples](screenshots/03-examples-python.png)
    - [JavaScript examples](screenshots/04-examples-javascript.png)
    - [Existing Account API Keys](screenshots/05-account-api-keys.png)
    - [Webhook configuration](screenshots/06-webhook-configuration.png)
    - [Successful V2 Run](screenshots/07-v2-run.png)
    - [Webhook Run](screenshots/08-webhook-run.png)
    - [Webhook execution timeline](screenshots/09-webhook-trace.png)
    - [Disabled webhook](screenshots/10-webhook-disabled.png)
    - [Revoked API key](screenshots/11-api-key-revoked.png)

23. **Core worktree.** `/home/fluke/Agenttree`: `git status --short` and `git diff --check` returned no output. Core remains clean and separate.

24. **Factual limitations.** Incoming webhook retries create separate Runs; V2 token-scoped idempotency is not coupled to ingress secrets. Execution and throttling remain process local; startup marks interrupted active executions failed with `RECOVERY_UNAVAILABLE`, and active Core execution does not resume. The E2E Tree produced no artifacts (listing returned 200); artifact body/integrity/restart and cancellation were covered by automated regressions rather than an additional external artifact-producing/cancellation workflow. Real provider testing used Gemini, and browser/runtime testing used local Docker HTTP; external HTTPS/Railway deployment and other webhook vendor protocols were not exercised. Outgoing live delivery was covered by existing adapter/service regressions. E2E data belonged to the disposable project and was removed during cleanup.
