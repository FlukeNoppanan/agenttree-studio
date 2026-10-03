# External integrations

Open **Tree → Connect** after the Tree is Ready. Each invocation creates an
independent Run pinned to the current immutable Tree version.

| Integration | Authentication | Behavior |
| --- | --- | --- |
| Personal API Key | `Authorization: Bearer ats_…` | Identifies a user for V1/V2; current permissions and Tree grants apply |
| Async API, V2 (recommended) | Personal API Key | HTTP 202 submission, polling, SSE, cancellation, results, artifacts |
| Simple synchronous API, V1 | Personal API Key | Caller waits for the Run result |
| Webhook Trigger (incoming) | Separate `Authorization: Bearer athw_…` secret | External event creates a normal async Run; HTTP 202 acknowledgment |
| Webhook Result Destination (outgoing) | Existing Studio Secret reference | Completed Run result delivered to an external URL |

## Application calls

Create personal keys in **Account → API Keys**, reached through **Manage API
Keys** in Connect. Existing keys cannot be revealed again. Store the once-visible
value in your application environment, rather than a Tree record or frontend
bundle. Keys contain no copied permission scopes. Revocation, account
deactivation, password changes/reset, and current Tree access continue to use
the existing auth contracts.

Connect includes cURL, Python, and JavaScript examples using `AGENTTREE_API_KEY`.
Python examples require `requests`; JavaScript examples use server-side Node
`fetch` and `process.env`. Example input is text, as required by both public
contracts; structured events can be JSON-encoded into that text.

For V2, submit `tree_id`, `input`, and optional `metadata` to `/api/v2/runs`.
The HTTP 202 response includes `run_id`, `tree_version_id`, `status`, and relative
resource `links`. Follow them on the same origin with the same personal API key
to poll, retrieve terminal results, read events, stream progress, cancel, or
download artifacts. A terminal result is available at `/api/v2/runs/{run_id}/result`;
until then that route returns 409. An HTTP 202 acknowledges submission, not
successful completion. Use `Idempotency-Key` for retry-safe V2 submissions in
its existing 24-hour window.

V1 remains supported at `/api/v1/trees/{tree_id}/invoke`. It takes `input` and
optional `metadata.client_request_id`, waits, and returns a persisted Run result.
Inspect `status` and `error` even when the HTTP response is 200.

See [V1 contracts](public-api-v1.md) and [V2 contracts](public-api-v2.md).

## Incoming webhook events

Create a **Webhook Trigger** in Connect. Management requires the existing
`manage_trees_agents` permission and current Tree use access. Non-admins manage
their own integrations; admins may manage all integrations on accessible Trees.
The integration remains tied to its original owner, including after an admin
rotates its secret. The opaque `wh_…` ID alone grants no access.

Copy the generated secret before closing its dialog. Only its SHA-256 hash is
stored. It is separate from personal API keys and decryptable provider/tool
Secrets. Use HTTPS outside trusted local development, and send credentials only
in the Authorization header. Cookie sessions and personal `ats_` keys cannot
authenticate webhook ingress.

```bash
curl --fail-with-body -X POST "$AGENTTREE_BASE_URL/api/webhooks/$WEBHOOK_ID" \
  -H "Authorization: Bearer $AGENTTREE_WEBHOOK_SECRET" \
  -H 'Content-Type: application/json' \
  --data '{"event":{"message":"An external event"},"metadata":{"source":"my-service"}}'
```

The event and optional metadata must be JSON objects. Maximum request size is
65,536 bytes, with at most 32 levels of JSON nesting; nonfinite numbers are
rejected. The runtime receives `{ "event": ... }` as generic structured input.
Metadata is retained with `webhook_integration_id` added by Studio. No domain
fields are hardcoded. Headers are not persisted, and the authenticated secret
is scrubbed if echoed in the payload, including object keys.

A valid enabled integration rechecks its owner’s current active account,
password-change requirement, `use_trees` permission, and Tree grants. It checks
Tree readiness, prepares a version-pinned Run through `RunService`, and submits
it to the same coordinator used by V2 and Studio live Runs. Results, events,
trace, artifacts, cancellation, and outgoing delivery follow the existing path.

The acknowledgment uses the existing `RunAccepted` response with HTTP 202 and
`status: "queued"`. Returned V2 links require a separate personal API key with
current access to that Tree; the webhook secret grants submission only. Inspect
the Run in Studio or configure an outgoing Result Destination for delivery.

Invalid secrets, unknown IDs, disabled/deleted integrations, or inaccessible
owners all return a non-enumerating 404. A draft Tree returns 409; malformed JSON
returns 422; unsupported media types return 415; oversized bodies return 413;
runtime capacity exhaustion returns 503. Ingress responses include a request ID.
Throttling is process local: 120 ingress attempts per peer/minute and 30 accepted
authentication attempts per integration/minute.

**Retries create separate Runs.** Webhook ingress does not support V2’s
token-scoped idempotency or interpret an `Idempotency-Key` header. Deduplicate in
the sender, or use V2 with a personal key for retry-safe application submissions.

Rotate Secret invalidates the old credential immediately. Disable or Delete
rejects subsequent deliveries; it does not cancel already accepted Runs. Enable
restores delivery with the current credential. Last received records the latest
validated Run preparation; it is not proof of successful completion.

## Outgoing results and legacy configuration

The existing Result Destinations section retains Store in Studio, API Response,
and outgoing Webhook Result Destination. Incoming integrations do not replace
that service or its Secret-backed credentials and independent delivery outcomes.

Persisted `manual_form`, `webhook`, and OutputConfig records remain readable.
Legacy `/api/trees/{tree_id}/webhook` metadata never had an ingress handler and
remains inactive. Create a Webhook Trigger to obtain a verified receiving URL.
There is no destructive migration of legacy Trees or credentials.

## Origins and runtime limits

`AGENTTREE_STUDIO_PUBLIC_ORIGIN` supplies the public HTTPS Studio origin in
Connect. If unset, Connect uses the actual browser origin, including the
frontend’s existing `/api` proxy. The backend proxy target is internal and is
never used as the examples’ public origin. No credentialed wildcard CORS is
added, and Studio cookie CSRF protection remains in place.

Runs, durable events, terminal results, and artifact bodies persist. The worker
coordinator and active Core execution state remain process local. On startup,
Studio marks interrupted active Runs failed with `RECOVERY_UNAVAILABLE`.
Executions do not resume after restart, and there are no distributed workers,
distributed locks, or cluster guarantees. Webhook ingress uses an additive
`0012_webhook_integrations` migration and requires no changes to AgentTree Core.
