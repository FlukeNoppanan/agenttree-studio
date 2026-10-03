# Builder architecture audit

Audited current git status/log10, previous visual-refresh report/review/screenshots, dependencies, router, Visual Workspace/template setup, Advanced Editor, Tree schemas/models/service/APIs, binding/configuration components, readiness, templates, authorization and existing tests before implementation. HEAD: 4086b80. Prior integration/onboarding/visual work is uncommitted and retained. Core status is clean.

## Existing contracts

- A version contains flat AgentDraft records. UUID IDs are global primary keys; Studio's generateClientId supports browser and LAN contexts.
- parent_agent_id defines Root → Manager → Specialist. Drafts may temporarily have null parents; readiness requires exactly one Root, at least one Manager, a Specialist under every Manager, capabilities and verified Provider/Model bindings.
- Tools use (agent_config_id, tool_connection_id). MCP is a ToolConnection type; it additionally requires selected discovered Tools for readiness. All Agent roles support tools. Neither resources nor providers are execution Agents.
- Backend validation (including Core compatibility and Template requirements) owns readiness. Cosmetic graph checks prevent impossible edits but cannot declare Ready.
- Draft PUT /api/trees/{id}/version writes the active draft. Ready PUT /configuration validates atomically, remaps Agent IDs, retains the previous version and rejects invalid replacements. No weakening of immutable Ready semantics.
- Template setup already edits the same records through its endpoints. Advanced Editor is a form Wizard using the same version/configuration APIs. Builder reads again on entry and uses those APIs, not a parallel graph store.
- Existing custom CSS canvases provide hierarchy presentation and click configuration. No graph dependency, DnD, undo/redo, pan/zoom editor or position storage exists.

## Decision

Add @xyflow/react: controlled custom nodes/handles, validated connections, pan/zoom/Fit, selection/keyboard, minimap and drag support fit React 19 and TypeScript. Extending the CSS Tree would require duplicating viewport, pointer and accessibility infrastructure. No generic workflow engine is added. Native HTML DnD supplies the external palette, as recommended in the [official guide](https://reactflow.dev/examples/interaction/drag-and-drop); [accessibility](https://reactflow.dev/learn/advanced-use/accessibility) stays enabled. Measure the lazy Builder chunk after build. A deterministic hierarchy layout avoids another layout dependency.

## Editing and persistence

One local draft payload is the editing source; graph nodes/edges derive from its Agents and assignment pairs. Explicit Save/Validate, dirty/stale validation indications, beforeunload protection and guarded navigation. History stores atomic document+position snapshots, capped at 100, and resets after server commits/ID remapping. Only browser-local per-user/Tree/version layout preferences (coordinates/collapse) are persisted; no credential, prompt, capability or runtime data in browser storage. No backend schema/migration is required. Draft payloads preserve legacy Trigger/Output and unknown Agent settings. Ready replacements receive new Agent IDs, so the new version starts with deterministic hierarchy layout; the UI explains this. Old-version browser layouts stay separate. No unsafe name/order mapping is used.

Tools are visual attachment nodes per assignment; solid hierarchy and dashed resource edges are distinct. Resource delete detaches, never deletes the shared Tool. Parent deletion explicitly confirms descendant/attachment removal. Phase 3 decoration accepts real execution state separately from configuration; this phase supplies no fake execution events.

## Validation preview

An additive, read-only POST /api/trees/validate-draft endpoint projects an unsaved payload into transient ORM records and calls the existing readiness validator, retaining the current Template snapshot when tree_id is supplied. It writes no Tree/version/Agent rows and makes no remote Provider calls. Existing cookie permissions and CSRF middleware apply. This is needed to show current authoritative issues before explicit Save. No database migration or runtime contract change.
