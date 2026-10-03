# Playground architecture audit — before implementation

HEAD 4086b80. Studio already contains uncommitted completed integration, onboarding, visual identity and Builder work; preserve all of it. Core status was clean. Previous visual refresh and Builder verification artifacts were read. Source baseline captured outside the repository for attribution.

## Existing contracts

- Cookie/CSRF Studio POST /api/studio/runs accepts tree_id and independent input string, checks current user/Tree access and authoritative Ready version, persists a pinned Run and returns HTTP 202/run_id. RunService and AsyncRunCoordinator execute real Core. No Playground execution endpoint is needed.
- Studio status, events, stream, result, cancellation and artifact endpoints reuse V2. SSE durable IDs are core_sequence; replay uses ?after=N. Transient agent.output.delta carries real agent_id/operation_id and is not replayable. Existing run-live transport reconnects with bounded backoff and deduplicates durable events.
- Durable operation events identify actor UUID and operation_key/type/phase/attempt. operation.in_flight proves activity; operation.committed/reconciled closes it. Detailed orchestration review/delegation trace can be merged only at terminal and does not always have a durable SSE cursor. Never infer live activity from names or role order.
- Runs, final results, events and artifacts survive browser reload. Active execution remains process-local; backend restart marks interrupted Runs failed with RECOVERY_UNAVAILABLE. No distributed recovery.
- Builder canonical document uses real Agent UUIDs and parent_agent_id. Hierarchy edges are hierarchy:<child UUID>; resource nodes represent Agent/Tool assignment pairs. Canvas already accepts executionByAgentId. Preserve controlled measured dimensions and all editing behavior.
- Builder/Advanced Editor save the same configuration. Ready replacement makes an immutable version with new Agent IDs. Historical graph must use Run.tree_version_id, not current Tree IDs.
- Existing version GET exposes only current version: a small additive optional version_id selector is needed, constrained to the same Tree. Existing management permission/Tree authorization remains authoritative. Playground is a design-time authoring view under manage_trees_agents AND view_executions; submitting additionally retains current use_trees/grants. No permission expansion.
- Existing Run Detail supplies full persisted timeline/trace; RunArtifacts supplies actual previews/downloads. Reuse these bridges.

## Implementation decisions

Dedicated explicit /trees/:treeId/playground?run=<real ID>. Independent tests and existing persisted Tree Runs provide history; no conversation database or memory. Reuse BuilderCanvas in observation mode (no mutation handles/actions), real operation projection supports simultaneous activity and review cycles. Only observed Agents change state; untouched Agents remain idle even on terminal Runs. Real operation-start events can emphasize a structural edge to their identified Agent; replay/history never pulses. Unreliably identified Tool activity remains timeline/Trace rather than guessed resource animation.

Readiness comes from existing validation and persisted Ready state. Text/JSON input both use the existing string payload; JSON mode validates and serializes input without domain schemas. Transient output is explicitly preliminary; final output remains the persisted result. Bounded live output and event state reuse transport limits. No Core/provider changes, new API version, runtime, Learning, chatbot or Connect redesign. Real PostgreSQL cancellation exposed an existing status-column width bug; additive migration 0013 widens runs.status from 20 to 32 without changing rows.

## Known inherited limitations

Gemini rejects the built-in Artifact Tool function schema's additional_properties. Do not conceal or fix this unrelated Core incompatibility. Browser-local Builder layouts are not shared across devices. Main application bundle warning is inherited. Detailed semantic trace may arrive only at terminal; live visualization therefore follows durable operation activity.
