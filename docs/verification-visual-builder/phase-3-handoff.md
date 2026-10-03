# Phase 3 execution decoration handoff

The Builder edits configuration. Runtime monitoring must remain a separate projection.

## Rendering boundary

- BuilderCanvas accepts optional executionByAgentId: Record<string, ExecutionState>.
- ExecutionState is idle | queued | running | completed | failed | cancelled.
- Agent node ID is the real persisted AgentConfig.id; hierarchy edge ID is hierarchy:<child Agent ID>.
- Resource node ID is resource:<Agent ID>:<ToolConnection ID>; attachment edges use the same assignment pair. Resources are not Agents.
- AgentNodeData.executionState becomes data-execution-state on the card. Shared semantic tokens define decorations; no idle animation loop exists.
- Nodes retain configuration, capabilities and bindings. Decorations must never update the draft, save history, readiness or Template records.

## Event adapter to add in Playground

Read the selected Run's pinned Tree version and render that version's Agent IDs. Current persisted trace payloads identify actors by actor_id; normalize actual event types/stages into a separate execution map. Verify event semantics before assigning states, and retain the durable event cursor when consuming the existing SSE API.

Use real Run status for terminal cancellation/failure; do not infer Agent completion from elapsed time. Tool events may decorate the matching assignment when both actor and Tool identity are present. Do not infer that every configured Tool was called.

Ready configuration replacement generates new Agent IDs. An old Run's actor IDs belong to its immutable version, not the current Builder version. Never merge those events by name, array order or role.

Phase 2 introduces no SSE protocol, fake events, live execution animation, Playground or runtime changes.
