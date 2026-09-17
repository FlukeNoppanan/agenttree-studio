"""Derive the Studio operational overview from persisted domain data."""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from backend.repositories.protocols import DashboardRepository
from backend.repositories.sqlalchemy import SQLAlchemyDashboardRepository
from backend.schemas.dashboard import (
    AttentionItem,
    DashboardMetrics,
    DashboardProviderSummary,
    DashboardSummary,
    DashboardTreeSummary,
    ProviderMetrics,
    RecentRunSummary,
    RunMetrics,
    ToolMetrics,
    TreeMetrics,
)


class DashboardService:
    def __init__(
        self, database: Session, repository: DashboardRepository | None = None,
    ) -> None:
        self._repository = repository or SQLAlchemyDashboardRepository(database)

    def summary(self) -> DashboardSummary:
        trees = self._repository.list_trees()
        runs = self._repository.list_runs()
        providers = self._repository.list_providers()
        tools = self._repository.list_tools()
        today = datetime.now(timezone.utc).date()

        terminal = [run for run in runs if run.status in ("completed", "failed")]
        completed = sum(run.status == "completed" for run in runs)
        model_lookup = {
            (provider.id, model.model_id): model
            for provider in providers for model in provider.models
        }
        provider_lookup = {provider.id: provider for provider in providers}
        runs_by_tree: dict[str, list] = {}
        for run in runs:
            runs_by_tree.setdefault(run.tree_id, []).append(run)

        attention: list[AttentionItem] = []
        for provider in providers:
            if provider.status == "error":
                attention.append(AttentionItem(
                    id=f"provider:{provider.id}", kind="provider_error", severity="error",
                    title="Provider connection needs attention",
                    message=f"{provider.name} could not be reached. Test the connection and check its saved Secret.",
                    resource_name=provider.name,
                    action_label="Open Providers", action_href="/providers",
                ))

        for tree in trees:
            version = tree.current_version
            if version is None:
                continue
            unavailable = []
            for agent in version.agents:
                if not agent.provider_connection_id or not agent.model_id:
                    continue
                model = model_lookup.get((agent.provider_connection_id, agent.model_id))
                if model is None or model.qualification_status != "qualified" or not model.is_available:
                    unavailable.append(agent.name)
            if unavailable:
                attention.append(AttentionItem(
                    id=f"tree-model:{tree.id}", kind="model_unavailable", severity="warning",
                    title="Tree uses an unavailable model",
                    message=f"{tree.name}: choose a verified model for {', '.join(unavailable[:3])}.",
                    resource_name=tree.name, related_names=unavailable[:3],
                    action_label="Review Tree", action_href=f"/trees/{tree.id}",
                ))
            tree_runs = runs_by_tree.get(tree.id, [])[:5]
            if tree_runs and tree_runs[0].status == "failed":
                attention.append(AttentionItem(
                    id=f"run:{tree_runs[0].id}", kind="recent_run_failed", severity="error",
                    title="Latest Run failed",
                    message=f"The latest Run for {tree.name} did not complete. Review the Run details before trying again.",
                    resource_name=tree.name,
                    action_label="View Run", action_href=f"/runs/{tree_runs[0].id}",
                ))

        for tool in tools:
            if tool.enabled and tool.status == "error":
                attention.append(AttentionItem(
                    id=f"tool:{tool.id}", kind="tool_unavailable", severity="warning",
                    title="Tool connection is unavailable",
                    message=f"{tool.name} is enabled but its last connection check failed.",
                    resource_name=tool.name,
                    action_label="Open Tools", action_href="/tools",
                ))

        failed_deliveries = [
            delivery for run in runs[:20] for delivery in run.delivery_results
            if delivery.status == "failed"
        ]
        if failed_deliveries:
            delivery = failed_deliveries[0]
            attention.append(AttentionItem(
                id=f"delivery:{delivery.id}", kind="delivery_failed", severity="warning",
                title="Result delivery failed",
                message=f"Delivery to {delivery.destination_name} failed. Review the Run and destination configuration.",
                resource_name=delivery.destination_name,
                action_label="View Run", action_href=f"/runs/{delivery.run_id}",
            ))

        tree_summaries = []
        for tree in trees[:6]:
            tree_runs = runs_by_tree.get(tree.id, [])
            agents = tree.current_version.agents if tree.current_version else []
            usage = []
            for agent in agents:
                provider = provider_lookup.get(agent.provider_connection_id or "")
                if provider and agent.model_id:
                    label = f"{provider.name} · {agent.model_id.removeprefix('models/')}"
                    if label not in usage:
                        usage.append(label)
            tree_summaries.append(DashboardTreeSummary(
                id=tree.id, name=tree.name, description=tree.description, status=tree.status,
                agent_count=len(agents), run_count=len(tree_runs),
                last_run_at=tree_runs[0].started_at if tree_runs else None,
                provider_summary=usage[:3],
            ))

        return DashboardSummary(
            metrics=DashboardMetrics(
                trees=TreeMetrics(
                    total=len(trees), ready=sum(tree.status in ("ready", "published") for tree in trees),
                    draft=sum(tree.status == "draft" for tree in trees),
                ),
                runs=RunMetrics(
                    total=len(runs), today=sum(run.started_at.date() == today for run in runs),
                    running=sum(run.status == "running" for run in runs), completed=completed,
                    failed=sum(run.status == "failed" for run in runs),
                    success_rate=round(completed / len(terminal) * 100, 1) if terminal else None,
                ),
                providers=ProviderMetrics(
                    total=len(providers), connected=sum(provider.status == "connected" for provider in providers),
                    usable_models=sum(
                        model.is_available and model.generation_candidate and model.qualification_status == "qualified"
                        for provider in providers for model in provider.models
                    ),
                ),
                tools=ToolMetrics(
                    total=len(tools), connected=sum(tool.status == "connected" for tool in tools),
                    enabled=sum(tool.enabled for tool in tools),
                ),
            ),
            recent_runs=[RecentRunSummary(
                id=run.id, tree_id=run.tree_id, tree_name=run.tree.name,
                status=run.status, started_at=run.started_at, duration_ms=run.duration_ms,
                result_state=(run.output_json or {}).get("core_status") or run.error_code,
            ) for run in runs[:6]],
            trees=tree_summaries,
            providers=[DashboardProviderSummary(
                id=provider.id, name=provider.name, provider_type=provider.provider_type,
                status=provider.status,
                usable_models=sum(
                    model.is_available and model.generation_candidate and model.qualification_status == "qualified"
                    for model in provider.models
                ),
                unavailable_models=sum(model.qualification_status == "unavailable" for model in provider.models),
                last_checked_at=provider.last_checked_at,
            ) for provider in providers],
            needs_attention=attention[:8],
        )
