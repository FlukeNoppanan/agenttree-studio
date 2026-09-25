"""Aggregated product dashboard API."""

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.db.session import get_db
from backend.schemas.dashboard import DashboardSummary, MyDashboard, RecentRunSummary
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
    if can("manage_trees_agents"):
        result.trees_count = database.scalar(select(func.count()).select_from(Tree)) or 0
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
        result.runs_count = database.scalar(select(func.count()).select_from(Run)) or 0
        runs = database.scalars(select(Run).order_by(Run.started_at.desc()).limit(5)).all()
        result.recent_runs = [RecentRunSummary(
            id=run.id, tree_id=run.tree_id, tree_name=run.tree.name,
            status=run.status, started_at=run.started_at,
            duration_ms=run.duration_ms, result_state=(run.output_json or {}).get("core_status") or run.error_code,
        ) for run in runs]
    return result
