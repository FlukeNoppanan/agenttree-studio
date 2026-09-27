# Studio ↔ AgentTree Core runtime integration

## Architecture

```text
                       AgentTree Studio
                              |
                     PostgreSQL Config
                              |
          +-------------------+-------------------+
          v                   v                   v
      TreeVersion          Providers           Tools
          |                   |                   |
          +-------------------+-------------------+
                              v
                    StudioRuntimeBuilder
                              |
                              v
                       AgentTree Core
                              |
                    ExecutionRuntime
                              |
          +-------------------+-------------------+
          v                   v                   v
       Events             Live Output         Artifacts
          |                   |                   |
          +-------------------+-------------------+
                              v
                      Studio Run Service
                              |
              +---------------+---------------+
              v               v               v
            Run           TraceEvent      RunArtifact
                              |
                              v
                         Existing UI
```

Studio's database is the configuration and durable application-record authority. AgentTree
Core is the orchestration, Tool authorization, streaming, artifact, and execution-semantics
authority. Studio does not copy or reimplement Core classes. Development installs Core from
`-e ../Agenttree[providers,mcp]`; production must install a compatible AgentTree package before
installing Studio's requirements.

## Runtime builder

`RuntimeBuilder` is the single conversion boundary. It loads one explicit `TreeVersion`, validates
its hierarchy and ready-model references, decrypts provider Secrets only while constructing
request-scoped provider instances, and creates Root, Manager, and Specialist Core agents. Exact
model IDs are preserved. Supported mappings are Gemini, Groq, OpenRouter, Cerebras, OpenAI,
Ollama, and custom OpenAI-compatible endpoints.

Root planning, triage, final review, and `ProviderRootSynthesizer` use the Root binding. Each
Manager gets its own provider-backed decomposer and reviewer. Every Specialist gets its own
provider/model binding. Provider instances live for one built execution bundle and are never put
in database rows, API responses, events, or registry metadata.

The builder translates every persisted Tool assignment into a Core `ToolBindingRegistry` entry.
Root, Manager, and Specialist assignments are role-neutral and explicit; unassigned Tools remain
unauthorized. HTTP and MCP adapters are retained. The optional `artifact` Tool type maps directly
to Core's structured artifact Tool and is never granted implicitly. The old Studio autonomous
Specialist loop remains available only as an isolated legacy unit, but the production builder does
not instantiate it; Core `ToolSession` is the only model-driven Tool loop.

Directional Manager collaboration is stored as
`AgentConfig.settings_json.allowed_manager_peer_ids`. Missing metadata means no peers, preserving
legacy Trees. A to B does not imply B to A. Specialists are never added to the peer policy.

## Run and execution lifecycle

For Phase 8A, Studio Run ID equals Core execution ID. The Run captures `tree_version_id` before
building or submitting, so later versions cannot alter an in-flight execution. The current V1
synchronous flow creates the Run, submits through `StudioAgentTreeRuntime`, waits for Core, then
returns its existing response shape. `output.value` is always `FinalResult.final_output`; the safe
orchestration document remains separately available under `output.orchestration`.

Core states map to Studio as follows:

| Core | Studio |
|---|---|
| queued | pending |
| running / cancellation requested | running |
| completed | completed |
| failed | failed |
| cancelled | cancelled |

`Run.final_status` preserves Core's more specific final status, including partial and revision-limit
outcomes. Usage, execution metrics, timing, normalized errors, safe state, trace linkage, and
artifact metadata are persisted. A late normal result cannot be written after Core reports
cancellation. `RunService.cancel_run` resolves the active execution and calls Core cancellation;
HTTP exposure is intentionally deferred to Phase 8B.

The process-wide `StudioAgentTreeRuntime` owns a bounded active-handle registry and one Core
`ExecutionRuntime`. Entries and MCP clients are released after synchronous completion. Multiple
runs have separate Tree/provider/Tool bundles. Application shutdown stops workers cleanly.

## Events and live output

Core durable events are copied to `TraceEvent` with their original `core_sequence`. The database
unique constraint `(run_id, core_sequence)` and overlapping-page lookup make ingestion
idempotent. Existing workflow trace events are retained for Live View compatibility; Studio's
display `sequence` is chronological, while `core_sequence` remains authoritative for durable
reconnect ordering.

`StudioAgentTreeRuntime.stream_output` exposes Core `AgentOutputDelta` while an execution is still
running. These deltas are deliberately transient and best effort. They are not persisted or
presented as reconnect-safe; durable Core events and Run state are the reconstruction authority.
Phase 8A adds no SSE endpoint or Live View V2 client.

## Artifacts

Studio uses Core's in-process ArtifactStore for bytes during execution and persists metadata in
`RunArtifact`. Revision history is retained; only refs selected by `FinalResult.artifacts` have
`is_final=true`. Metadata includes Core artifact ID, type, name, logical path, operation, media
type, size, SHA-256, producer, status, and safe metadata. Bodies are not copied into Run JSON.
Service lookup starts from an authorized Run and cannot cross Run ownership. No artifact is ever
applied to a user workspace. A durable external body store and authorized download endpoint are
Phase 8B concerns.

## Durability and recovery

Phase 8A deliberately uses Core `InMemoryExecutionStore`; Studio PostgreSQL/SQLite is authoritative
for durable Run status, ordered events, artifact index, safe result, and diagnostics. It does not
create an uncontrolled Core SQLite database, so provider credentials cannot be persisted there.
Core checkpoints and live artifact bodies do not survive backend restart. Runs interrupted by a
restart remain inspectable but are not resumed blindly. `inspect_recoverable` returns no automatic
candidates and `recover` reports the explicit Phase 8A limitation. A faithful SQLAlchemy/PostgreSQL
Core `ExecutionStore` adapter is recommended for a later recovery phase.

## Security and compatibility

Existing route authorization and dynamic Tree grants remain before runtime construction. Normal
users never receive the decrypted provider Secret. Persistence passes through credential-aware
sanitization, Core config contains no plaintext key, and normalized API failures contain no raw
provider response or traceback. Custom endpoints come only from stored provider configuration;
prompt input cannot override endpoint, authentication, or TLS behavior.

Public API V1 remains synchronous and text-first. It still creates the same Studio Run/history and
uses the same authentication and grant checks. Public API V2, SSE, artifact download, and Live View
V2 are not part of this phase.

## Known limitations and future mapping

- Backend restart recovery and live artifact bodies require a durable Core store/artifact-store
  integration.
- Live output is process-local and has no reconnect guarantee.
- Manager collaboration is configured through version metadata; a dedicated editor can be added
  later without changing the runtime mapping.
- Artifact creation is available through backend configuration, while a richer artifact Tool UI
  and download experience belong to later Studio phases.
- Phase 8B can map Run submission, ordered event pagination/SSE, cancellation, and scoped artifact
  download directly onto the service boundaries introduced here.

## Phase 8B asynchronous public projection

Public API V2 now maps the same runtime into an asynchronous resource contract without changing
V1. Submission captures the exact TreeVersion before returning HTTP 202. A bounded Studio worker
owns execution monitoring and copies Core events into `TraceEvent` throughout the Run, so polling
and SSE use `core_sequence` as a durable exclusive cursor. Core cancellation-requested state is
exposed distinctly; `Run.final_status` continues to preserve partial and other exact final states.

SSE replays durable rows and independently subscribes to bounded, future-only
`AgentOutputDelta`. Durable events receive sequence IDs; transient deltas do not. Multiple clients
have independent cursors/queues, and disconnect never requests cancellation. Live View V2 remains
out of scope until Phase 8C.

Core's public `FileArtifactStore` is configured beneath a Studio-controlled persistent root.
PostgreSQL stores metadata only. Authorized V2 downloads resolve Run ownership first and use the
Core store's execution ownership and SHA-256/size verification; physical paths are never exposed.
Artifact bodies survive backend restart when that root is persistent, and Studio never applies
their contents.

Core execution semantics still use `InMemoryExecutionStore`. Run rows, final results, copied
events, artifact metadata, and file-backed bodies survive restart, but active execution records,
checkpoints, and operation journals do not. A partial PostgreSQL adapter was deliberately rejected
because it would be unsafe for uncertain non-idempotent Tools. **DURABLE CORE RECOVERY IN STUDIO:
NOT IMPLEMENTED.**
