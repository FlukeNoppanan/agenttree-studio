# Preimplementation factual map

Baseline: Studio 4086b80; Studio and Core worktrees clean.

- Tree Detail already has Overview, Agents, Tools, Connect, Runs, Versions, Settings. Visual Workspace is implemented.
- Connect currently advertises legacy /api/runtime/trees/{id}/invoke and manages existing outgoing destinations.
- V1 bearer middleware resolves SHA-256 ats_ tokens to current active users. accessible_tree and can_use_tree enforce current permissions and grants. V1 invokes RunService synchronously.
- V2 persists a version-pinned pending Run with RunService.prepare and dispatches the existing AsyncRunCoordinator. Token-scoped RunIdempotency provides 24-hour deduplication. Polling, durable events, SSE, cancellation, artifacts already exist.
- Studio live routes reuse the V2 read/stream functions and async coordinator, with cookie auth and CSRF checks at the middleware.
- API Keys exist in /account?section=api-keys. Values only returned on creation; password changes/reset revoke keys; deactivation and Tree grants are checked currently.
- Webhook audit outcome B: TreeService writes /api/trees/{id}/webhook into legacy TriggerConfig.config_json; no HTTP ingress handler exists in backend/api. Legacy editor functions are no longer wizard steps. Persisted TriggerConfig remains readable and affects task formatting for manual forms.
- OutputConfig controls output shape; ResultDestination and ResultDelivery independently handle Studio storage, API response, and outgoing authenticated webhooks. No incoming integration model exists.
- Secrets use Fernet encryption and masked metadata; a random ingress bearer secret needs verification only, so hash-only storage is sufficient and avoids a decryptable credential dependency.
- Public origin is AGENTTREE_STUDIO_PUBLIC_ORIGIN (validated HTTPS origin), required on Railway. Local frontend proxies /api preserving browser Host. Proxy target backend:8000 is internal and must never be example content.
- Core executions and the async coordinator are process local. Startup reconciliation marks interrupted active Runs failed with RECOVERY_UNAVAILABLE; stored results/events/artifacts persist. No active recovery or distributed execution guarantee.
- Existing test coverage includes auth policy completeness, current grants/deactivation/revocation/password behavior, V1 execution, V2 idempotency/events/SSE/artifacts/cancel, generic input, destination isolation, Tree/template persistence and live runs.

Implementation choice: separate owner-bound ingress integration table and additive Alembic migration; cookie management requires existing manage_trees_agents policy plus current Tree use access. Ingress uses its own athw_ bearer secret, opaque wh_ ID, nonenumerating auth errors, bounded JSON payload, owner reauthorization, normal version-pinned Run persistence and coordinator. No token scopes or new execution engine. Retry deliveries create separate Runs (documented); V2 remains the retry-safe API.
