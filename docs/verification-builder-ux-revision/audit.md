# Builder UX revision — preimplementation audit

Audited current source after checking Studio `git status`, the latest ten commits and the Phase 1, Phase 2 and Phase 3 verification reports. HEAD is `4086b80`. The working tree contains extensive uncommitted work from those completed phases; it is being preserved. Core is a separate repository and must remain untouched.

## Current contracts

- XYFlow React (`@xyflow/react` 12) is already installed and powers the shared Builder/Playground canvas. Native source/target handles and connection preview/validation are already available.
- Hierarchy data is `AgentDraft.parent_agent_id`; each child has at most one parent. `canConnect` permits Root→Manager and Manager→Specialist; `connectAgents` writes that same canonical parent field, so reconnecting a Specialist reparents it. Unsupported role pairs are rejected before Save.
- Existing Agent source handles (Root/Manager bottom, all Agent incoming top) already permit hierarchy drawing. However, clicking an Agent name opens its configuration dialog, and a single right-side resource handle is marked non-connectable. Existing handle/graph support can be improved in place.
- Real Tool/MCP assignment is the existing pair `{agent_config_id, tool_connection_id}`. MCP is a `ToolConnection` with `tool_type === "mcp"`; each Agent assignment is independent. No backend/Core/runtime change is needed to share a visual resource.
- Current resource derivation loops over assignments and uses `resource:<agent-id>:<tool-id>` node keys. Thus a shared Tool is visually duplicated once per assignment, even though the database has one Tool and multiple assignment rows. This is visual-only duplication, not cloned Tool data. Resource binding edges are dashed and currently non-deletable; Tools are attached by drop-on-Agent or Agent form.
- Agent edit already reuses `AgentForm`/`agentPayload`/`fromAgent` in the Builder dialog; `TreeWizard` and Advanced Editor share the same persisted Tree endpoints. A read-only Inspector can summarize canonical data and invoke the existing edit form without duplicating configuration logic.
- The Builder uses a 640px fixed-height workspace with a 460px minimum. It also sits inside AppLayout's `max-w-[1440px]` container, leaving viewport width unused on wide displays. Footer controls and a separate readiness block consume additional vertical space.
- Agent relationships, assignments, and configuration persist through the existing draft save or immutable Ready-version replace APIs. Undo/Redo stores up to 100 Builder snapshots. Canvas positions/collapse are browser-local per user/Tree/version. No layout migration is justified.
- Existing Auto Layout recursively reserves per-Agent attachment lanes, contributing to resource duplication and uneven hierarchy spacing. Resource filters must affect only graph derivation, not document assignments/readiness.
- Generic Create Tree currently routes directly to `/trees/new` (Visual Builder). This is used by Trees page header/empty state, Dashboard and Getting Started. `/trees/new/advanced` opens the existing six-step Wizard; the Wizard creates only on save and edits the same Tree API/model. Template browsing is a distinct intentional flow: `/templates` instantiates the selected Template and routes to its setup (`/trees/:id/setup`), so it should not be forced through a generic method prompt. Wizard itself links to Templates.

## Implementation decisions

- Preserve the existing graph/editor, run-time model, readiness API, history, layout storage, Wizard steps and Template-specific setup flow.
- Change resource IDs to `resource:<tool-id>` and derive one visual node from the unique assigned Tool IDs plus explicitly placed browser-local resource positions. Assignment edges remain per Agent. Dragging the same resource again focuses the same node.
- Enable Agent→resource native handles and make both hierarchy and binding edge deletion edit existing canonical data; edge removal never deletes an Agent's child subtrees accidentally or a global Tool.
- Single-click selects and opens a read-only Inspector. “Edit Agent” opens the existing Agent form. Tool details show type/status/transport, assignment list and discovered-tool count only; no Secret or raw configuration values.
- Expand the workspace into the available app viewport, break out of the 1440px page cap only on the Builder page, add collapsible Components/Inspector rails and a reversible app-level Focus Canvas mode. Put readiness details behind a compact issue control.
- Route generic `/trees/new` to a two-method selector with a Templates shortcut. Visual Builder uses a new blank Builder route; Guided Wizard uses the existing Wizard route. Nothing is created by opening/canceling the selector. Selected Template flow remains specific and unchanged.
