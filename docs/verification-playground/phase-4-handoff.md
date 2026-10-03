# Phase 4 — unify the product journey

Playground uses /trees/:treeId/playground?run=<real Run UUID>. It creates independent Runs through POST /api/studio/runs and reopens history from existing Tree Runs. Build and Connect retain the same explicit Tree ID. Trace uses /runs/:runId?trace=1 to expand the existing full persisted inspector; Run Detail can return to the same Playground Run.

## Execution view boundary

BuilderCanvas is shared by editing and observation. readOnly disables graph mutation/configuration controls while retaining viewport/minimap. executionByAgentId and executionPhases are separate from canonical TreeDraftPayload. Agent node ID is AgentConfig.id from the pinned TreeVersion; hierarchy edge is hierarchy:<child ID>. Resource IDs remain assignment pairs. Never write execution decorations into Tree config or Builder undo history.

usePlaygroundRun owns the existing cookie SSE transport, bounded text/timeline, durable cursor and incremental operation journal. reduceExecution retains latest states plus unfinished operations independently of the timeline limit. projectJournal filters by pinned Agent UUIDs. Actor names are presentation only. operation.in_flight/committed/failed/cancelled and real terminal status drive the view. Review/revision operations may reactivate completed Agents. Multiple Agents and nested operations can remain active simultaneously.

Only actual manager.decompose or specialist.generate/revision starts pulse a hierarchy edge. Initial replay/history does not animate delegation. Tool identity is not guessed; unmapped resource activity belongs in full Trace. Transient output is preliminary and non-replayable. A historical Run has no running animation.

## Remaining UX integration

- Consider a compact Build → Validate → Playground → Inspect → Connect navigation strip across authoring pages, without removing legacy Test Run/Live View.
- Keep the existing explicit Tree Picker for global entry points. Playground currently serves authors with Tree management and execution visibility; broader execution-only entry would require a deliberately scoped read contract rather than exposing configuration by relaxing permissions.
- Connect redesign should consume the existing Tree and successful Run context; API V1/V2 and Webhook remain independent of Playground.
- Explain Core final_status=partial/revision-limit outcomes alongside Studio terminal status. Do not equate terminal completion with every Agent executing or every review passing.
- Retain process-local recovery wording: browser reload can reattach, backend restart cannot resume active Core execution.

No conversation memory, domain sample library, new execution engine/API, Learning or live editing during a Run is introduced.

## Acceptance prerequisites

Before treating live hierarchy animation as fully verified, resolve the real Gemini Root triage decision-output failure under a separately authorized compatibility task. Available successful Runs exercised Root direct output; delegated Runs failed before Manager activity. Tool Artifact schema incompatibility is inherited. Do not synthesize activity to fill those gaps. Existing version GET now accepts a same-Tree authorized version_id selector. Migration 0013 widens runs.status for the existing cancellation_requested state; it introduces no Playground storage.
