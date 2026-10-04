# v0.1.3 audit and implementation plan

Baseline: clean Studio main, `3ff7af00d0bbcd6da1f624964d020bc16661b825`, existing annotated v0.1/v0.1.1/v0.1.2 tags retained. Core main clean at `a1315a4f3d9498005522fd233c4e4cd6f849b0d7`; runtime remains frozen. PostgreSQL/backend/frontend healthy; migration head 0013_run_cancellation_status.

## Resource lifecycle

- Authoritative active configuration: `Tree.current_version_id`, not maximum version number. Ready configuration replacement creates new Agent IDs and remaps hierarchy/bindings, retaining the previous version. No restore/rollback/activate endpoint exists.
- Provider guard joins ALL AgentConfig/TreeVersion rows. FK AgentConfig.provider_connection_id RESTRICT therefore blocks history even if UI filtering alone were fixed.
- Tool/MCP guard joins ALL ToolAssignment versions, with a nonnullable RESTRICT resource FK. MCP is a ToolConnection type, not another resource table.
- Secret has direct RESTRICT references from ProviderConnection, ToolConnection and ResultDestination. These connections are live independent resources: rotating their Secret releases the old reference. Tree versions do not directly snapshot Secret IDs/values.
- ResultDestination is Tree-scoped, not version-scoped. Historical ResultDelivery already uses SET NULL plus destination name/type snapshot. Incoming Webhook uses its own hashed credential, no Secret FK. Neither has the version-lock bug.
- Run pins TreeVersion, and independently persists result, Trace, Artifact metadata/bytes. Provider/Tool deletion must never cascade to those objects.
- Proposed additive fix: nullable SET NULL historical resource references plus safe immutable identity snapshots (ID/name/type only), current-version-only guards. Lock resource before dependency inspection to serialize deletion with FK-backed writers. Historical serialization retains original identity and a deleted marker. Missing historical bindings never substitute a new resource. Existing reference validation rejects deleted resource IDs; existing readiness evaluates current rows only.

## Templates / catalog

Five built-ins, portable v2 TemplateDefinition with validated Root→Manager→Specialist hierarchy and local Agent key mapping. Use Template already navigates directly to unsaved Visual Builder; retain this flow and no-record-on-cancel behavior. Required Tool slots feed backend readiness; recommended slots do not. Expansion will use these schemas and metadata for difficulty/setup/output, not a second engine.

Catalog contains Artifact, generic HTTP, generic Streamable HTTP MCP, GitHub account HTTP, and three coming-soon entries. Plus/configure creates a connection after an actual test; it is not a software installer. Custom stdio MCP can launch a configured installed executable; catalog must distinguish registration from installing packages. Curated server guidance will cite official sources, describe permissions, and never run package installers automatically.

## Dashboard

Admin uses real /api/dashboard/summary, restricted users use permission-filtered /api/dashboard/me. Current admin composition has seven equal metrics, a quick-action column, repeated Tree actions, and equally weighted Provider/attention sections. Warm stone/olive tokens mix into surfaces. Redesign will use an operational overview, prominent recent Execution list, compact Tree readiness rows and contextual resource/attention rail; retain explicit Tree selection and compact onboarding. Refine shared tokens, not hardcoded per-page colors. No fake health/trends/usage.

## Research references

- [Vercel projects](https://vercel.com/docs/projects): resource overview → explicit project context.
- [Vercel dashboard redesign](https://vercel.com/blog/dashboard-redesign): prioritize operational status and next actions.
- [LangSmith Studio](https://docs.langchain.com/langsmith/studio): architecture visualization, real testing and inspection.
- [Temporal Web UI](https://docs.temporal.io/web-ui): persisted Execution state and inspection, scope-aware resources.
- [LangGraph Templates](https://blog.langchain.dev/launching-langgraph-templates/): portable starting points with explicit Provider setup.
- [MCP reference servers](https://github.com/modelcontextprotocol/servers): real transports/setup/permissions, not invented integrations.

Browser authentication expired when navigating from cached Getting Started to Dashboard. User has been asked to sign in; read-only source audit continues. Before screenshots and original bug browser reproduction are still pending. No product source edits preceded this audit.

## Closure annotation (2026-10-04)

The initial authentication pause above was resolved by normal user sign-in. Genuine old-frontend before screenshots, candidate visual iteration and authenticated lifecycle/Template/Dashboard acceptance were completed; see final report. Pre-fix deletion reproduction used the real service/database, not browser.
