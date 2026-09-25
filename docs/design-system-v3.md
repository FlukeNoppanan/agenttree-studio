# AgentTree Studio — Design System & UX V3

## Research and decisions (before implementation)

Reviewed official product documentation on 2026-09-25. These are pattern references, not promises of equivalent functionality:

| Reference | Relevant pattern | Studio decision |
| --- | --- | --- |
| [Linear views](https://linear.app/docs/custom-views) | Focused, filtered work lists | Stable navigation groups, compact page headers, filter bars |
| [Vercel observability](https://vercel.com/docs/observability) | Monitoring aligned with actual architecture | Execution counts and persisted events, no invented runtime |
| [GitHub keyboard navigation](https://docs.github.com/en/get-started/accessibility/keyboard-shortcuts) | Efficient keyboard access | Native buttons, visible focus, navigable topology |
| [Grafana logs](https://grafana.com/docs/grafana/latest/visualizations/explore/logs-integration/) | Dense logs with contextual details | Audit table and execution timeline rather than cards per event |
| [Datadog log inspector](https://docs.datadoghq.com/logs/explorer/side_panel/) | Selection retains list context | Right-side Agent and audit inspectors |
| [Temporal UI](https://github.com/temporalio/documentation/blob/main/docs/web-ui.mdx) | Execution history, metadata, relationships | Separate topology from persisted chronological execution evidence |
| [n8n executions](https://docs.n8n.io/workflows/executions/all-executions/) | Scoped execution lists and filters | Tree-scoped status/search and recent activity |
| [LangSmith trajectories](https://www.langchain.com/blog/langsmith-trajectories-tracing) | Ordered path with deeper trace inspection | Compact timeline, expandable safe payloads; never chain-of-thought |

## Audit

The shell consumes excessive width; branding repeats on each page. Large gradient welcome panels compete with work. Seven equal metric cards obscure priorities. The hierarchy uses oversized nodes and nested canvas borders; specialist levels are not aligned. Live View repeats unavailable-runtime metadata and puts every count/execution in a card. Resource and form surfaces use the same heavy shadow and radius. Secondary technical text is often too small.

## System

- Midnight navigation, blue actions/selection, cyan operational connections, violet agents/models. Green means success only.
- Light: background #F7F8FA, surface #FFFFFF, secondary #F1F5F9, text #111827, muted #64748B, border #E2E8F0. Dark uses slate/navy surfaces, not green.
- Type: system/Inter + Noto Sans Thai/Leelawadee fallback; titles 28–32px, sections 16–20px, body/control 14px, metadata 12px. Thai uses generous line height. IDs use monospace.
- Layout: 248px sidebar, max 1440px workspace, 16/24/32px responsive gutters; 24px section rhythm; 12–16px compact rows. No decorative animation.
- Tables for resources; flat sections for settings/forms; split-pane execution list/activity; node-link topology; right drawers for selection. Cards remain only for genuinely self-contained choices.
- No new visualization dependencies: CSS connectors and semantic buttons keep the hierarchy lightweight. Wide topologies scroll only inside their canvas.
- Preserve routing, permission checks, API contracts, key handling, model filtering, and all persistent data.

## Verification log

Implementation, test results, browser coverage and remaining limitations are tracked in [design-system-v3-verification.md](design-system-v3-verification.md). The verification script uses disposable fixtures, never real credentials or user-resource mutations for screenshots.
