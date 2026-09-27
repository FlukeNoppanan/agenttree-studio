# Phase 8C.5 Core capability inventory

Source of truth: the read-only `/home/fluke/Agenttree/src/agenttree` tree, especially `framework.py`, `config.py`, `core/execution_runtime.py`, `core/execution_store.py`, `core/collaboration.py`, `core/artifacts.py`, `providers/`, `tools/`, and the Core `docs/` pages for execution, collaboration, providers, Tools, and artifacts. Studio source was checked separately. This inventory describes the current public Core contracts, not older Studio phase assumptions.

## Orchestration and results

Core has one Root, Managers under Root, and Specialists under Managers. Root triages/plans or directly responds, reviews the final work, and synthesizes `FinalResult.final_output`; Manager decomposes, reviews, and requests bounded revisions; Specialist executes its assigned work. `AgentTreeConfig` exposes matching behavior and Manager/final revision limits. `FinalResult` has an exact `passed`, `partial`, or `failed` status, a separate final output, trace, usage, metadata, and selected final artifact references. A partial result is a completed execution with one or more unsuccessful branches, not a passed result. Studio's `RuntimeBuilder` uses provider driven Root synthesis and keeps the final output separate from artifacts and orchestration data.

## Providers and agents

Core public provider adapters include OpenAI Responses, Gemini, Ollama, Groq, OpenRouter, Cerebras, and a custom OpenAI-compatible adapter. Groq, OpenRouter, Cerebras, and custom compatible use OpenAI-compatible wire contracts but retain distinct public provider types. Core exposes provider capability flags, SDK-independent error classes, native generation, and native streaming where an adapter supports it. Provider model IDs are opaque strings; slash-containing IDs must be retained exactly. Provider/model routing binds independently to every Root, Manager, and Specialist. Studio's canonical provider identifiers are `openai`, `gemini`, `ollama`, `groq`, `openrouter`, `cerebras`, and `openai_compatible` in `backend/schemas/provider.py`. Studio has encrypted Secret references and durable discovery/qualification; no fixed model catalog is authoritative.

## Tools and collaboration

Core `ToolRegistry`, `ToolBindingRegistry`, `ToolExecutor`, and the shared `ToolSession` enforce explicit per-agent authorization, rounds, call counts, timeout, argument/result size, and deadline. Function Tools and MCP Tools are public contracts. Studio maps configured HTTP API Tools to Core function Tools, supports MCP stdio and Streamable HTTP, and provides the Core artifact creation Tool as an explicit Tool connection. The artifact Tool is never globally granted. Root, Manager, and Specialist can each receive Tool bindings. Core's Manager collaboration permissions are directional (`A → B` does not imply `B → A`), bounded by per-manager, total, per-thread, decision turn, payload, and timeout limits. Specialists have no peer communication contract.

## Execution, streaming, and durability

Core `ExecutionRuntime` supports background queues, queued/running/cancellation-requested/completed/failed/cancelled states, cooperative cancellation, deadlines, usage accounting, metrics, durable ordered events, checkpoints, an operation journal, explicit recovery, and machine-readable recovery-blocked errors. Its built-in in-memory and SQLite stores have different restart guarantees. `AgentOutputDelta` is a transient, attributed stream; durable events carry independent sequences and cursors. Studio uses its own process-local coordinator plus Core's in-memory runtime. It persists Studio Run rows, durable trace events, artifact metadata, and file-backed bodies, but does not persist Core checkpoints or the operation journal. Startup closes interrupted Studio Runs with `RECOVERY_UNAVAILABLE`. PostgreSQL `ExecutionStore` integration is an architectural gap and is outside Phase 8C.5.

## Artifacts

Core artifact types are `text`, `code`, `json`, `file`, `patch`, and `reference`; file intents are `none`, `create`, `modify`, and `delete`. `ArtifactRef` records producer role/agent, logical path, media type, size, SHA-256, and immutable ID. An optional `supersedes_artifact_id` is stored in artifact metadata. Operation staging precedes commit; all committed versions remain in history; `FinalResult.artifacts` selects final accepted versions. Core never applies a patch or file intent to the host workspace. Studio's artifact fetch verifies Run ownership, body size, and digest; the UI previews text as inert text and downloads other bodies.

## Configuration classification

| Core option | Studio scope | Reason |
| --- | --- | --- |
| Per-agent provider/model, instructions, capability, Tools | Agent | Each role owns its binding. |
| Directional Manager peers | Manager | Authorization is source-specific. |
| Manager/final revisions, Tool rounds/calls, collaboration message budgets, provider streaming | Tree/Root advanced settings | Bounded and meaningful to Tree authors. |
| V2 Run timeout/deadline | Per submission | A run-specific operational choice. |
| Backend worker/pending capacity | Studio admin/runtime only | Deployment resource control. |
| Provider/Tool transport timeout | Connection config | Belongs to the external connection. |
| Artifact count/byte limits, low-level payload/decision limits | Runtime only | Safety guardrails; presenting every internal limit would invite unusable configurations. |
| Core checkpoint/journal recovery | Deferred architecture | Requires durable Core store and reconstruction/ownership semantics. |
