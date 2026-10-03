"""Aggregated product dashboard API."""

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.db.session import get_db
from backend.schemas.dashboard import DashboardSummary, MyDashboard, RecentRunSummary, GettingStartedTree
from backend.api.auth import current_user
from backend.models.auth import User
from backend.models.provider import ProviderConnection, ProviderModel
from backend.models.run import Run
from backend.models.secret import Secret
from backend.models.tool import ToolConnection
from backend.models.tree import Tree
from backend.services.auth_service import AuthService
from backend.services.dashboard_service import DashboardService

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
def dashboard_summary(database: Session = Depends(get_db)) -> DashboardSummary:
    return DashboardService(database).summary()


@router.get("/me", response_model=MyDashboard)
def my_dashboard(request: Request, database: Session = Depends(get_db)) -> MyDashboard:
    user = current_user(request, database)
    permissions = {item.permission for item in user.permissions}
    def can(permission: str) -> bool:
        return user.is_admin or permission in permissions

    result = MyDashboard()
    # UI guidance derives from existing workspace state; no onboarding records.
    auth = AuthService(database)
    accessible = auth.my_trees(user) if can("use_trees") else []
    setup_trees = auth.accessible_trees(user) if can("manage_trees_agents") else accessible
    result.onboarding.trees = [GettingStartedTree(
        id=tree.id, name=tree.name, template=tree.template,
        ready=tree.status == "ready" and tree.current_version is not None and tree.current_version.status == "ready",
    ) for tree in setup_trees if tree.status not in {"archived", "paused"}]
    accessible_ids = {tree.id for tree in accessible}
    result.onboarding.runnable_tree_id = next((tree.id for tree in result.onboarding.trees if tree.ready and tree.id in accessible_ids), None)
    if can("manage_providers_models"):
        result.onboarding.provider_ready = bool(database.scalar(select(ProviderModel.id).join(ProviderConnection).where(
            ProviderConnection.status == "connected", ProviderModel.is_available.is_(True),
            ProviderModel.generation_candidate.is_(True), ProviderModel.qualification_status == "qualified",
        ).limit(1)))
    if can("view_executions"):
        completed = select(Run.id).where(Run.status == "completed", Run.tree_id.in_(accessible_ids)).order_by(Run.started_at.desc())
        if not user.is_admin:
            # Older synchronous Studio runs lack ownership; count them only on
            # currently granted Trees. Owned runs must belong to this account.
            completed = completed.where((Run.submitted_by_user_id == user.id) | Run.submitted_by_user_id.is_(None))
        result.onboarding.successful_run_id = database.scalar(completed.limit(1))
        result.onboarding.has_successful_run = result.onboarding.successful_run_id is not None
    if can("manage_trees_agents"):
        result.trees_count = len(setup_trees)
    if can("use_trees"):
        trees = AuthService(database).my_trees(user)
        result.available_trees = [{"id": tree.id, "name": tree.name, "status": tree.status} for tree in trees]
        if result.trees_count is None:
            result.trees_count = len(trees)
    if can("manage_providers_models"):
        result.providers_count = database.scalar(select(func.count()).select_from(ProviderConnection)) or 0
        result.ready_models_count = database.scalar(select(func.count()).select_from(ProviderModel).where(
            ProviderModel.is_available.is_(True), ProviderModel.generation_candidate.is_(True),
            ProviderModel.qualification_status == "qualified")) or 0
    if can("manage_tools_mcp"):
        result.tools_count = database.scalar(select(func.count()).select_from(ToolConnection)) or 0
    if can("manage_secrets"):
        result.secrets_count = database.scalar(select(func.count()).select_from(Secret)) or 0
    if can("view_executions"):
        result.runs_count = database.scalar(select(func.count()).select_from(Run).where(auth.tree_access_filter(user, Run.tree_id))) or 0
        runs = database.scalars(select(Run).where(auth.tree_access_filter(user, Run.tree_id)).order_by(Run.started_at.desc()).limit(5)).all()
        result.recent_runs = [RecentRunSummary(
            id=run.id, tree_id=run.tree_id, tree_name=run.tree.name,
            status=run.status, started_at=run.started_at,
            duration_ms=run.duration_ms, result_state=(run.output_json or {}).get("core_status") or run.error_code,
        ) for run in runs]
    return result
