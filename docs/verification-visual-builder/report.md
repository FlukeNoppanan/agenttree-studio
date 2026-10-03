# Phase 2 — Visual Tree Builder verification

Status: **COMPLETE** — implementation, automated suites, actual Docker, Chrome interaction/visual verification and real Gemini execution passed.

## 1. Initial git state

HEAD 4086b80; git status and latest ten commits inspected before edits. Integration, onboarding and visual-refresh work was already uncommitted. It was retained; the whole working-tree diff is larger than this phase. Previous verification report, visual review and screenshot index were read before design decisions. Core was clean.

## 2–3. Existing workspace and Tree model

See [architecture audit](architecture.md). Existing Visual Workspace and Template Setup remain available. Advanced Editor uses the same Tree payload. Flat Agent records have real UUIDs, role and parent_agent_id. Tools/MCP are assignment pairs, not Agents. Provider/Model remain Agent metadata. Draft versions can have incomplete hierarchy; Ready configuration replacement is immutable and generates new Agent IDs.

## 4–5. Graph library and dependencies

Added @xyflow/react 12.12.0; 19 packages were installed in total. Its controlled nodes, handles, viewport, selection and accessibility avoid recreating graph infrastructure. Existing custom CSS workspace lacked those interactions. No separate layout, animation or workflow engine dependency was added. The Builder is lazy-loaded: final build approximately 210 KB minified / 68 KB gzip; exact output is retained in frontend-build.log. Standard React Flow attribution is preserved.

## 6–7. Canvas and graph derivation

A single canonical TreeDraftPayload drives graph nodes and edges, configuration and save. UI history includes that document plus layout preferences. Agent IDs are persisted IDs. Resource IDs represent Agent/Tool assignment pairs. No graph-only execution structure is saved.

## 8–10. Nodes, resources and edges

Root uses existing Indigo role tokens, Manager Cyan and Specialist restrained neutral cues. Cards show name, capabilities, Provider/Model, Tool count and backend issues. Tool/MCP cards use the actual available resource catalog. Solid hierarchy edges and dashed attachment edges distinguish control hierarchy from resources. Selecting an assignment for deletion detaches it without deleting the shared Tool.

## 11–12. Root and connection validation

Root is disabled in the palette once present; model logic also rejects duplicates. Valid edits are Root→Manager and Manager→Specialist. Reparenting updates parent_agent_id; unsupported links are rejected before saving. Invalid pointer connection was verified with destructive preview, concise feedback and unchanged edge count. Incomplete/disconnected draft Agents stay visible and are reported by backend readiness.

## 13. Drag/drop

Native HTML palette drag carries a validated typed payload. Dropping on a suitable Agent explicitly establishes parent or Tool assignment; dropping an Agent on open Canvas creates an unconnected draft Agent. Unsupported resource targets receive feedback. Actual Chrome mouse drag, intercepted browser DragData, drop highlight, canonical insertion and Undo are recorded in native-drag.json. Palette buttons also support accessible creation without drag.

## 14. Configuration

The existing AgentForm, capability selector and Provider/Model selector are reused in a right-side drawer. Agent fields update the canonical document and card immediately. Existing unknown settings are preserved; role-specific runtime settings, parent, collaboration peers and Tool assignments remain supported. Resource creation still belongs to existing Tools pages. Explicit Save persists configuration.

## 15. Authoritative readiness

Added read-only POST /api/trees/validate-draft, optionally carrying current tree_id for Template context. It constructs transient ORM records and calls the existing readiness validator; it writes no rows or remote Provider requests. Current permission and CSRF rules apply. Debounced preview ignores stale responses; missing Tree name is handled before sending an invalid request. Preview never marks a Tree Ready. Save & mark Ready uses existing validation endpoints.

## 16–18. Layout and persistence

Auto Layout spaces hierarchy branches and resource lanes without overlapping fixed-size cards. Disconnected draft branches remain visible. Manual movement and collapse preferences are stored safely in browser-local, user/Tree/version namespaces, with finite-coordinate validation and corrupt-storage fallback. No configuration or credentials enter this preference store. New immutable Ready versions receive new Agent IDs and a fresh deterministic layout; the UI states this behavior. Cosmetic positions are not synchronized across browsers.

## 19–20. Selection

Click/keyboard Configure opens the shared drawer. Shift-click and drag-box support multi-selection and group movement; Shift selection does not unexpectedly open configuration. Multi-edit of Agent fields is intentionally absent. Fit, zoom, pan and minimap remain available.

## 21. Delete

Delete/Backspace and toolbar Delete open confirmation. Deleting a parent explains removal of its subtree and attachments; descendants cannot become silently orphaned. Peer references are cleaned. Shared Tool records remain intact. Browser verification exercised multi-selection, confirmation cancellation, actual Manager-plus-Specialist removal and Undo before Save.

## 22–23. History and keyboard

Undo/Redo retain up to 100 atomic document/layout/collapse snapshots. Drag completion is one edit rather than one entry per pointer frame. Keyboard Arrow movement also records a completed edit; actual Chrome verified Ctrl-Z restoration and Escape clearing controlled selection. Transient localized feedback clears on language changes. History resets after server commit and immutable ID replacement. Ctrl/Cmd-Z, Shift-Z, Escape and Delete are safe around inputs/dialogs. Configure is a semantic focusable button; its key events are isolated from graph selection. Browser sends the complete native Enter sequence to verify activation.

## 24–25. Motion and reduced motion

Insertion, selection, connection pulse, rejection and drawer entry use restrained motion. Auto Layout interpolates positions over 360 ms before animated Fit. Browser frame samples verify intermediate positions. Reduced-motion CSS disables transitions/animations and JS applies layout/Fit directly. Collapse keeps configuration intact and changes visibility immediately. See [motion verification](motion.md).

## 26. Future execution states

The rendering boundary accepts a separate executionByAgentId map with idle/queued/running/completed/failed/cancelled states. No runtime events, live execution animation or SSE changes were introduced. See [Phase 3 handoff](phase-3-handoff.md).

## 27. Advanced Editor

Builder Save→Advanced Editor shows the same Agents/configuration. A real Advanced Editor name change was saved through its existing Wizard; returning to Builder reflected it. Reload preserved the new name and hierarchy. New Advanced Editor creation remains available at /trees/new/advanced.

## 28. Templates

Existing General Analysis Template instantiated through the actual Templates UI, then existing Default Provider setup and Tool requirement resolution reached Ready. Its current five-Agent hierarchy and required Artifact Tool were retained. Saving a Builder Tree as a Template and instantiating it preserved five Agent roles/hierarchy while environment-specific Provider/Model bindings were not copied.

## 29. Existing Trees

A Tree created through the pre-Builder API opened correctly, retained Provider/Model bindings and an unknown custom Agent setting after Builder configuration replacement. Users do not need to rebuild existing Trees.

## 30–31. Locales and themes

Actual Chrome inspected Light/Dark and switched EN→TH→EN. Existing visual tokens were retained; no global theme redesign. Natural Thai Builder guidance keeps Tree/Agent/Root/Manager/Specialist/Provider/Model/Tool/MCP terminology in English. Localized port, minimap, configuration and navigation instructions use the existing i18n system. Screenshot set includes both themes, locales, resources and drawer. Transient feedback clears on language change; the language chooser intentionally retains the Thai autonym ไทย in English mode. Existing readiness issue codes were checked against Builder translations; missing codes received natural English/Thai presentation rather than English-only fallback.

## 32. Performance and narrower layout

Actual Canvas rendered 1 Root, 4 Managers, 20 Specialists and 20 resource attachments: 45 nodes. Fit, pan and minimap worked. Thirty sampled frames were approximately 16.7 ms apart on this verification machine; this is a local smoke measurement, not a benchmark guarantee. At 900 px no horizontal page overflow occurred. Desktop remains the main editing target.

## 33. Files changed in this phase

Frontend:
- package.json and package-lock.json.
- src/router.tsx; src/lib/api.ts.
- src/pages/trees/tree-builder.tsx and tree-builder.test.tsx.
- src/pages/trees/tree-detail.tsx and template-setup.tsx.
- src/components/tree/builder/model.ts, model.test.ts, canvas.tsx, canvas.test.tsx and canvas.css.
- src/components/tree/types.ts, agent-form.tsx, capability-selector.tsx and provider-model-selector.tsx.
- src/locales/en/translation.json and th/translation.json.

Backend:
- backend/api/trees.py; backend/services/tree_service.py.
- tests/test_trees.py; tests/test_auth.py.

Evidence/documentation: this directory and docs/visual-tree-builder.md. The frontend list was compared against a source copy taken before this phase, rather than attributing all preexisting dirty files to the Builder.

## 34–35. Backend and migration scope

Only an additive authenticated draft-readiness preview and tests. No schema migration, Core, execution coordinator, API V1/V2, auth model, provider architecture, Learning or A2A changes. Persisted save validation remains authoritative. PostgreSQL migrations remain 0012_webhook_integrations at head, inherited from the prior phase.

## 36–40. Automated verification

- Backend: 229 passed (baseline 224, five added tests).
- Frontend: 193 passed across 33 files (baseline 158, 35 added behavior tests).
- TypeScript: passed, npx tsc --noEmit.
- Production build: passed.
- git diff --check: passed.
- Existing build warning: main application chunk exceeds 500 KB. Builder is separate and lazy-loaded; this warning is reported, not suppressed.
- Existing backend warning: Starlette cookie deprecation in auth test.
- Tests cover graph conversion/layout, uniqueness/hierarchy, cascade/resources, readiness preview, CSRF/auth, canonical saving/history/navigation, locales, controlled node measurements and keyboard controls.

## 41. Docker

Acceptance uses explicit disposable project ats-visual-builder, separate PostgreSQL/key volumes and ports 18000/15173. Original project agenttree-studio uses 8000/5173 and was updated with the tested images while retaining its PostgreSQL container and volumes. Health, migrations, direct/proxy endpoints and backend/frontend logs are recorded in docker-health.json. The disposable project, its volumes, private fixtures and own browser profiles were removed afterward; cleanup.json confirms the original stack remains healthy. No original Trees, Providers, Runs, Templates, Tools, Secrets, keys or webhooks were removed.

## 42. Real Chrome flows

Actual Chrome 153.0.8010.36/CDP, not jsdom: Blank Tree creation/configuration; real native palette drag; Root uniqueness; valid/invalid port connections; movement/history/animated layout/reduced motion; Tool/MCP binding; Ready save/reload; existing Tree; Template instantiate/setup/round-trip; Advanced Editor consistency; multi-selection/delete protection; Light/Dark and EN/TH; 45-node Tree and 900 px viewport. Screenshot index and JSON evidence are linked below.

## 43–44. Real Provider and persisted trace

The Builder-created Tree executed through the existing Studio Test Run UI using qualified Gemini models/gemini-3.1-flash-lite. A real completed Run (2c9180b0-115e-4b1c-bdd1-64d85be7c677) and 24 persisted trace events were verified, including reload. Final repeat details are in browser-acceptance.json. Actual MCP echo discovery, selection and test execution were also verified.

Earlier verification Runs failed safely. A preexisting Gemini/Artifact schema incompatibility returned a sanitized provider failure: Google rejects additional_properties in the built-in Artifact function schema. Artifact assignment persistence was tested separately; the successful runtime Tree retained the real MCP binding and omitted the incompatible Artifact assignment. Core/provider code was not changed to conceal this limitation. Another early generic provider failure was not assigned an unproven cause.

## 45–46. Console, network and logs

Final browser evidence retains request URL/status only, never bodies or credentials. Intentional invalid graph edits did not call invalid persistence endpoints. Successful preview/save/Template/MCP/Run requests use existing expected 2xx statuses. Final console/network results and Docker log inspection are in JSON evidence. Private fixture credential strings were checked against logs/evidence before export. Final complete acceptance recorded 99 expected API responses, zero failed requests and zero browser errors; native drag and compatibility passes also recorded zero errors. Earlier measurement, offscreen drawer, attribution warning and keyboard interception issues were corrected and regression-tested.

## 47. Screenshot evidence

See [screenshot index](screenshots.md), plus browser-acceptance.json, native-drag.json and compatibility.json. Previous onboarding/visual-refresh evidence remains untouched. Screenshots were captured from the real disposable Studio, not generated mockups.

## 48. Core safety

git -C /home/fluke/Agenttree status --short was empty before and after implementation. No Core files were copied, vendored or modified.

## 49. Remaining limitations

Browser-local layout has no cross-device synchronization and resets for a new immutable version's new IDs. History is an unsaved editing history, not a persistent server undo log. Collapse visibility is immediate. Mobile graph editing is not a primary target. Large-Tree sampling is not a formal performance guarantee. Existing Gemini/Artifact schema compatibility requires separate Core/provider investigation. Build retains the existing large-main-chunk warning. No Playground or real runtime-driven decoration is implemented in this phase.

## 50. Phase 3 handoff and next user test

See [Phase 3 handoff](phase-3-handoff.md) for actor/Agent IDs, assignment edge identities and immutable Run-version constraints. Next: ask a new technical user to assemble two Manager branches, intentionally try an invalid link, configure one Specialist, recover with Undo, Save and Run without coaching. Observe whether ports, explicit parent selection and Ready-version layout behavior are understood.
