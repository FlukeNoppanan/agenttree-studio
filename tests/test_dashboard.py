"""Dashboard aggregation uses persisted Studio state without fabricated data."""

from datetime import datetime, timezone

from backend.models.destination import ResultDelivery
from backend.models.provider import ProviderConnection, ProviderModel
from backend.models.run import Run
from backend.models.tool import ToolConnection
from backend.models.tree import AgentConfig, Tree, TreeVersion
from backend.services.dashboard_service import DashboardService


def test_dashboard_empty_state_data(database) -> None:
    summary = DashboardService(database).summary()

    assert summary.metrics.trees.total == 0
    assert summary.metrics.runs.total == 0
    assert summary.metrics.runs.success_rate is None
    assert summary.recent_runs == []
    assert summary.trees == []
    assert summary.needs_attention == []


def test_dashboard_summary_and_actionable_attention_from_real_rows(database) -> None:
    provider = ProviderConnection(
        name="Gemini Workspace", provider_type="gemini", status="error",
    )
    database.add(provider)
    database.flush()
    model = ProviderModel(
        provider_connection_id=provider.id, model_id="models/gemini-2.5-flash",
        is_available=True, generation_candidate=True, qualification_status="unavailable",
    )
    tree = Tree(name="Support Tree", description="Handles support", status="ready")
    version = TreeVersion(tree=tree, version_number=1, status="ready")
    agent = AgentConfig(
        tree_version=version, agent_type="root", name="Support Root",
        provider_connection_id=provider.id, model_id=model.model_id,
        capabilities_json=["support"],
    )
    tree.current_version = version
    tool = ToolConnection(
        name="Ticket API", tool_type="http_api", enabled=True, status="error",
    )
    database.add_all([model, tree, version, agent, tool])
    database.flush()
    run = Run(
        tree=tree, tree_version=version, status="failed", input_json={"ticket": 1},
        error_code="provider_failed", error_message="sanitized", started_at=datetime.now(timezone.utc),
    )
    database.add(run)
    database.flush()
    database.add(ResultDelivery(
        run=run, destination_name="Support webhook", destination_type="webhook",
        status="failed", attempted_at=datetime.now(timezone.utc),
    ))
    database.commit()

    summary = DashboardService(database).summary()

    assert summary.metrics.trees.model_dump() == {"total": 1, "ready": 1, "draft": 0}
    assert summary.metrics.runs.total == 1
    assert summary.metrics.runs.today == 1
    assert summary.metrics.runs.failed == 1
    assert summary.metrics.runs.success_rate == 0
    assert summary.metrics.providers.connected == 0
    assert summary.metrics.providers.usable_models == 0
    assert summary.metrics.tools.enabled == 1
    assert summary.recent_runs[0].tree_name == "Support Tree"
    assert summary.trees[0].agent_count == 1
    assert {item.kind for item in summary.needs_attention} == {
        "provider_error", "model_unavailable", "recent_run_failed",
        "tool_unavailable", "delivery_failed",
    }
