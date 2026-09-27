# Phase 8B Public API V2 audit

This audit was completed before the Phase 8B implementation. It describes the verified Phase 8A code paths and the design decisions that constrain V2.

## 1. V1 request lifecycle

`AuthMiddleware` recognizes `/api/v1/*`, establishes a validated request ID, authenticates an `ats_…` bearer token through `AuthService.resolve_token`, applies process-local authentication/invocation limits, updates `last_used_at` on its existing five-minute cadence, and then enters `public_v1`. The route resolves Tree access with `AuthService.can_use_tree`, checks the current version is ready, and calls synchronous `RunService.invoke`. The HTTP request remains open while Core runs. The response is the stable V1 text-first envelope and uses Root `FinalResult.final_output` as the user-facing output.

## 2. Phase 8A runtime lifecycle

`RuntimeBuilder` loads one explicit `TreeVersion`, validates it, decrypts provider credentials only while building scoped providers, maps persisted Agents/providers/models/Tools and directional Manager peers into public Core contracts, and returns a `RuntimeBundle`. `RunService.invoke` persists a Run and its exact version, assigns the same ID to the Core execution, submits it to the process-wide bounded `StudioAgentTreeRuntime`, waits for `ExecutionHandle.result`, then persists the safe result, state, usage, metrics, Core events, trace events, and artifact metadata. Core `ToolSession` remains authoritative. Root synthesis remains the final-output source.

## 3. Existing API authentication and authorization

Public API authentication is centralized in `AuthMiddleware`; plaintext keys are never stored. The middleware rejects inactive/revoked credentials and disabled owners and throttles `last_used_at` writes. Tree authorization is centralized in `AuthService.can_use_tree`; `public_v1.accessible_tree` deliberately returns 404 for missing or unauthorized resources. Public bearer CORS is separate from credentialed Studio cookie CORS and Studio CSRF checks.

V2 will reuse those exact middleware and Tree resolver semantics. It will not accept credentials, endpoints, Tree structure, Tool configuration, or per-Agent routing from submission input.

## 4. Current Run ownership model

V1 does not persist a creator identity. Run access is dynamic current Tree access: a caller can read a Run only while `can_use_tree(user, run.tree_id)` is true. Phase 8B retains this as the authoritative resource-read and cancellation policy for compatibility and privacy: losing the Tree grant removes historical Run/event/artifact access but does not arbitrarily terminate work already running. New submissions fail after grant removal. V2 additionally records the submitting user/token for scoped idempotency and audit correlation; creator identity does not override a revoked current Tree grant.

## 5. Durable event availability

Core events have monotonically increasing execution-local sequence numbers. Phase 8A copies them to `TraceEvent.core_sequence` and enforces `(run_id, core_sequence)` uniqueness. `TraceEvent.sequence` also contains legacy trace-only events and is not the V2 reconnect cursor. V2 durable pagination and SSE IDs must therefore use non-null `core_sequence`, ordered numerically, and persist Core events during execution rather than only at completion.

## 6. Transient output availability

Core `AgentOutputDelta` is available from independent, bounded, non-destructive subscribers attached to the active execution. It carries role, Agent ID, operation ID, attempt, local sequence, text, timestamp, and dropped-count information. It is future-only, process-local, and intentionally excludes internal structured planning/control output. Historical deltas cannot be replayed.

## 7. Artifact body availability

Phase 8A stores only `RunArtifact` metadata. Its default Core runtime uses `InMemoryArtifactStore`, so bytes disappear when the process exits. Core exposes a public `FileArtifactStore` with generated content-addressed IDs, hashed execution directories, atomic writes, no logical-path writes, ownership checks, bounded metadata decoding, and SHA-256/size verification on reads.

Phase 8B will configure that public Core file store under a Studio-controlled root and persist only metadata plus the Core artifact ID in PostgreSQL. Downloads will resolve an authorized Run first, require artifact membership in that Run, and read through the verifying store. DELETE intents are metadata-only/not downloadable. Physical paths are never serialized.

## 8. Restart limitations

Runs, final results, event rows, artifact metadata, and—after the Phase 8B file-store change—artifact bodies survive restart. Transient output does not. The Phase 8A Core `InMemoryExecutionStore`, checkpoints, operation journal, and active handles do not survive restart, so an interrupted execution cannot be resumed safely and may remain queued/running in the Studio projection until operator reconciliation. This release will not claim Core recovery.

## 9. SSE integration points

The SSE route authenticates and authorizes before `StreamingResponse` begins. It replays persisted `TraceEvent` rows after a durable cursor, polls for newly ingested durable events, and subscribes independently to Core live output when an active handle exists. Durable events receive SSE `id` values equal to `core_sequence`; transient deltas do not receive durable IDs. A bounded heartbeat keeps idle intermediaries alive. Multiple clients have independent DB cursors and Core queues; disconnect only closes that subscription and never cancels the Run.

Typed public events are derived from sanitized Core event types plus explicit artifact/final/terminal availability types. Payloads contain no provider-native objects, credentials, raw tracebacks, prompt bodies, or chain-of-thought.

## 10. Required database/schema changes

Migration 0009 adds nullable historical-compatible Run ownership/cancellation fields, durable artifact-store availability metadata, and a PostgreSQL-backed idempotency mapping scoped by API token and action. Existing Run, TraceEvent, and RunArtifact rows remain readable. No arbitrary artifact bytes are placed in PostgreSQL.

## Core ExecutionStore decision

A faithful PostgreSQL adapter would need atomic optimistic transitions, validated checkpoints, operation/attempt journaling, ordered durable events, recovery ownership, and all Core codec invariants. Implementing only part of that contract would create two mutable truths and unsafe recovery, especially around uncertain non-idempotent Tools. Phase 8B therefore keeps Core `InMemoryExecutionStore` and explicitly reports **DURABLE CORE RECOVERY IN STUDIO: NOT IMPLEMENTED**. Recovery is deferred rather than approximated; no public recovery endpoint is added.

## Retention and deployment notes

No destructive retention job is introduced. Runs, events, idempotency records, artifact metadata, and artifact bodies accumulate until a future operator-defined retention policy exists. The artifact root must be placed on persistent storage in production; Compose will use the existing Studio data volume. Process-local rate and SSE connection limits do not coordinate across multiple backend replicas.
