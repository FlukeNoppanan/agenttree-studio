# Phase 8A Core runtime integration audit

## Scope and baseline

This audit covers the Studio backend, persistence, Public API v1, runtime
builder, provider and Secret resolution, Tools, Runs, traces, Live View,
migrations, Docker configuration, frontend contracts, tests, and existing
documentation. AgentTree Core is an explicit editable development dependency
through `-e ../Agenttree[providers,mcp]`; Docker installs the repository's
declared dependency input and must be supplied an installable Core package.
Core source is not copied into Studio.

## Existing execution path

`RunService.invoke()` loads `Tree.current_version`, creates a Studio `Run`,
builds a fresh Core `AgentTree` through `RuntimeBuilder`, and calls
`AgentTree.run()` synchronously through `SynchronousExecutionBackend`. On
return it copies the final workflow state and trace into `Run` and
`TraceEvent`. Public API v1 calls the same service, so synchronous v1 and
Studio Test Run already share one path.

The builder creates Core Root, Manager, and Specialist identities. Root triage
and final review use the Root provider. Per-Manager wrapper strategies select
each Manager's provider for decomposition and review. Specialists resolve
their own provider/model through a Core `ProviderSpecialistExecutor`.
Encrypted credentials are decrypted by `SecretService` only during build and
are held in fresh provider instances scoped to the invocation.

## Gaps and bypasses

1. Root final synthesis is not configured with `ProviderRootSynthesizer`.
   Studio formats output from serialized orchestration and therefore bypasses
   `FinalResult.final_output`.
2. `ToolAwareSpecialistExecutor` implements a second autonomous model/Tool
   loop. Core `ToolSession` now owns this behavior and the Studio loop must be
   removed from Tree execution.
3. Tool assignment storage is role-neutral, but validation, service APIs, and
   runtime binding reject Root and Manager assignments.
4. Managers and Root are not registered/bound in the shared Core provider
   registry. The instruction wrapper also lacks streaming/capability
   delegation, which would disable native streaming.
5. Manager collaboration has no persisted mapping. Manager `settings_json`
   can carry the smallest backward-compatible representation:
   `allowed_manager_peer_ids`; absence means no peers.
6. Execution uses `AgentTree.run()` rather than `AgentTree.start()` and Core
   `ExecutionRuntime`. There is no Core execution ID, cancellation service,
   live output subscription, active-handle registry, or runtime shutdown.
7. Trace events are copied only after completion and are re-numbered by
   timestamp. Core durable sequence is not retained and ingestion is not
   replay-idempotent beyond a coarse "trace exists" check.
8. Runs have no explicit final Core status, usage, metrics, or artifact index.
   No artifact metadata model exists.
9. Current output formatting returns orchestration JSON or concatenated
   Specialist output instead of Root synthesis.
10. Live View polls durable Studio records and correctly avoids claiming
    transient output. It currently cannot observe Core deltas while running.

## Persistence and identity findings

`Run.tree_version_id` already provides an immutable snapshot reference, but
the builder accepts only `tree_id` and reloads mutable `current_version` after
the Run is created. The builder must accept the captured `tree_version_id` and
load exactly that version. Core `Task.id` can equal the Studio Run UUID, making
Studio Run ID and Core execution ID identical without another correlation ID.

`TraceEvent(run_id, sequence)` already has a unique constraint. Phase 8A will
store Core durable sequence in a dedicated `core_sequence` column with a
unique `(run_id, core_sequence)` constraint, while retaining `sequence` for
existing UI ordering. Overlapping event pages can then be safely ingested.

An explicit `RunArtifact` table is required for bounded artifact metadata.
Artifact bodies will remain in the Core `ArtifactStore` for active process
lifetimes; Studio persists metadata and final-selection state but will not add
an HTTP download endpoint in Phase 8A. No artifact is applied to a workspace.

## Chosen Phase 8A architecture

Studio remains authoritative for configuration, authorization, Run status,
durable event history, result data, usage, errors, and artifact metadata.
Core remains authoritative for orchestration, Tool authorization, execution
state transitions, live output, collaboration, reviews, synthesis, and
artifact production.

Phase 8A uses one process-level, bounded `StudioAgentTreeRuntime` around Core
`ExecutionRuntime` with `InMemoryExecutionStore`. A fresh runtime-built Tree
and request-scoped provider instances belong to one Run. The active registry
stores only handles and runtime resources, is bounded, and evicts terminal
entries after synchronization. It does not persist plaintext credentials.
Synchronous v1 submits through this service, waits, synchronizes, and returns
the existing response schema. This prepares asynchronous Phase 8B without
adding v2 routes or SSE.

Core SQLite is deliberately not used, avoiding dual durable authorities and
credential-bearing provider reconstruction concerns. A backend restart marks
in-flight process-local work as non-recoverable; automatic recovery is
deferred until a faithful Studio/PostgreSQL `ExecutionStore` is justified.
The internal service will expose inspection and explicit recovery status but
will not claim restart recovery.

## Configuration mapping

- Root: persisted ID/name/instructions/capabilities, exact provider/model,
  assigned Tools, provider-backed planning/triage/final review/synthesis.
- Manager: persisted identity/instructions/capabilities, exact provider/model,
  decomposition, review, assigned Tools, directional peer IDs.
- Specialist: persisted identity/instructions/capabilities, exact
  provider/model, assigned Tools through Core `ToolSession`.
- Providers: Core provider factory contracts for Gemini, Groq, OpenRouter,
  Cerebras, OpenAI, Ollama, and custom OpenAI-compatible endpoints. Exact
  stored model IDs are passed to Core; catalogs are not hardcoded.
- Tools: existing HTTP and MCP adapters become Core tools and are bound only
  to explicitly assigned agents. The Core artifact Tool is opt-in and not
  granted globally.
- Collaboration: only Manager IDs are accepted; each directed edge is applied
  independently. Specialists have no peer configuration.

## Security and compatibility

Tree/API-key authorization stays in existing route/middleware/service paths
and is checked per invocation. Provider Secrets are decrypted only while
building scoped providers and are sanitized from Run, TraceEvent, artifact
metadata, errors, logs, and API output. Public API v1 remains synchronous and
returns `FinalResult.final_output`; orchestration is retained separately for
diagnostics. Transient `AgentOutputDelta` is process-local and best effort;
Core durable events and Studio-ingested traces are authoritative for replay.

No Public API v2, SSE route, artifact download endpoint, Live View redesign,
S3/MinIO, queue service, or automatic workspace mutation belongs to Phase 8A.

## Conceptual flow

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
