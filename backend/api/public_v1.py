"""Bearer-only external consumption API; Studio routes remain separate."""

import json

from fastapi import APIRouter, Depends, Request
from fastapi.security import HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.db.session import get_db
from backend.models.auth import User
from backend.models.run import Run
from backend.models.tree import Tree, TreeVersion
from backend.schemas.public_api import (
    AgentCounts, PublicError, PublicExecution, PublicHealth, PublicInvocation,
    PublicInvokeRequest, PublicMe, PublicRun, PublicText, PublicTree,
    PublicTreeDetail, PublicTreeList, TreeAccess,
)
from backend.schemas.run import InvocationRequest
from backend.services.auth_service import AuthService
from backend.services.run_service import RunService
from backend.core.public_api import PublicAPIError

bearer_docs = HTTPBearer(auto_error=False, description="Personal API key from Account → API Keys (ats_…)")
router = APIRouter(prefix="/api/v1", tags=["Public API v1"])


def public_user(request: Request, database: Session) -> User:
    user = database.get(User, getattr(request.state, "user_id", None))
    if user is None or not user.is_active:
        raise PublicAPIError(401, "invalid_api_key", "A valid API key is required.")
    return user


def accessible_tree(database: Session, user: User, tree_id: str) -> Tree:
    tree = database.scalar(select(Tree).options(
        selectinload(Tree.current_version).selectinload(TreeVersion.agents),
    ).where(Tree.id == tree_id))
    if not tree or not AuthService(database).can_use_tree(user, tree_id):
        raise PublicAPIError(404, "resource_not_found", "The requested Tree is not available.")
    return tree


def ready(tree: Tree) -> bool:
    return tree.status == "ready" and tree.current_version is not None and tree.current_version.status == "ready"


def tree_read(tree: Tree) -> PublicTree:
    version = tree.current_version
    assert version is not None
    return PublicTree(id=tree.id, name=tree.name, description=tree.description,
                      status="ready", version=version.version_number, agent_count=len(version.agents))


def text_output(output: dict | None) -> PublicText | None:
    if output is None:
        return None
    value = output.get("value")
    return PublicText(content=value if isinstance(value, str) else json.dumps(value, ensure_ascii=False))


def execution(run: Run) -> PublicExecution:
    return PublicExecution(started_at=run.started_at, completed_at=run.finished_at, duration_ms=run.duration_ms)


def error_for(run: Run, request: Request):
    from backend.schemas.public_api import PublicErrorBody
    return PublicErrorBody(code=(run.error_code or "execution_failed").lower(),
                           message=run.error_message or "AgentTree execution failed.",
                           request_id=request.state.request_id) if run.status == "failed" else None


@router.get("/health", response_model=PublicHealth, summary="Public API availability")
def health() -> PublicHealth:
    return PublicHealth()


@router.get("/me", response_model=PublicMe, dependencies=[Depends(bearer_docs)], responses={401: {"model": PublicError}})
def me(request: Request, database: Session = Depends(get_db)) -> PublicMe:
    user = public_user(request, database)
    trees = AuthService(database).my_trees(user)
    return PublicMe(id=user.id, username=user.username, is_admin=user.is_admin,
                    tree_access=TreeAccess(mode="all" if user.is_admin else user.tree_access_mode,
                                           count=sum(ready(tree) for tree in trees)))


@router.get("/trees", response_model=PublicTreeList, dependencies=[Depends(bearer_docs)], responses={401: {"model": PublicError}})
def trees(request: Request, database: Session = Depends(get_db)) -> PublicTreeList:
    user = public_user(request, database)
    allowed = AuthService(database).my_trees(user)
    # One eager-loaded query for versions/agents, including selected-grant filtering.
    ids = [tree.id for tree in allowed]
    if not ids:
        return PublicTreeList(data=[])
    rows = database.scalars(select(Tree).options(
        selectinload(Tree.current_version).selectinload(TreeVersion.agents),
    ).where(Tree.id.in_(ids)).order_by(Tree.name)).all()
    return PublicTreeList(data=[tree_read(tree) for tree in rows if ready(tree)])


@router.get("/trees/{tree_id}", response_model=PublicTreeDetail, dependencies=[Depends(bearer_docs)], responses={404: {"model": PublicError}})
def tree_detail(tree_id: str, request: Request, database: Session = Depends(get_db)) -> PublicTreeDetail:
    tree = accessible_tree(database, public_user(request, database), tree_id)
    if not ready(tree):
        raise PublicAPIError(404, "resource_not_found", "The requested Tree is not available.")
    agents = tree.current_version.agents
    return PublicTreeDetail(**tree_read(tree).model_dump(), agents=AgentCounts(
        total=len(agents), root=sum(a.agent_type == "root" for a in agents),
        managers=sum(a.agent_type == "manager" for a in agents),
        specialists=sum(a.agent_type == "specialist" for a in agents)))


@router.post("/trees/{tree_id}/invoke", response_model=PublicInvocation, dependencies=[Depends(bearer_docs)],
             responses={401: {"model": PublicError}, 404: {"model": PublicError}, 422: {"model": PublicError}, 429: {"model": PublicError}})
def invoke(tree_id: str, payload: PublicInvokeRequest, request: Request, database: Session = Depends(get_db)) -> PublicInvocation:
    user = public_user(request, database)
    tree = accessible_tree(database, user, tree_id)
    if not ready(tree):
        raise PublicAPIError(409, "tree_not_ready", "The requested Tree is not ready.")
    metadata = payload.metadata.model_dump(exclude_none=True)
    result = RunService(database).invoke(tree_id, InvocationRequest(input={"input": payload.input}, metadata=metadata),
                                         invocation_source="public_api_v1")
    run = database.get(Run, result.id)
    assert run is not None
    AuthService(database).event("public_api.tree_invoked", user, user)
    database.commit()
    return PublicInvocation(run_id=run.id, tree_id=run.tree_id, tree_version=result.tree_version_number,
                            status=run.status, output=text_output(run.output_json), execution=execution(run),
                            error=error_for(run, request))


@router.get("/runs/{run_id}", response_model=PublicRun, dependencies=[Depends(bearer_docs)], responses={404: {"model": PublicError}})
def get_run(run_id: str, request: Request, database: Session = Depends(get_db)) -> PublicRun:
    user = public_user(request, database)
    run = database.get(Run, run_id)
    if run is None or not AuthService(database).can_use_tree(user, run.tree_id):
        raise PublicAPIError(404, "resource_not_found", "The requested Run is not available.")
    raw_input = run.input_json.get("input", "")
    return PublicRun(id=run.id, tree_id=run.tree_id, tree_version=run.tree_version.version_number,
                     status=run.status, input=PublicText(content=raw_input if isinstance(raw_input, str) else json.dumps(raw_input)),
                     output=text_output(run.output_json), execution=execution(run), error=error_for(run, request))
