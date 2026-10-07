"""Cookie-authenticated Studio facade over the Public V2 Run services."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, sessionmaker

from backend.api.public_v1 import accessible_tree
from backend.api.public_v2 import (_async_stream, authorized_run, get_artifact,
                                   get_events, get_result, links, list_artifacts,
                                   public_user, run_read)
from backend.core.public_api import acquire_sse
from backend.db.session import get_db
from backend.schemas.public_api_v2 import (ArtifactList, CancelResponse, EventPage,
                                           RunAccepted, RunResult, RunState, RunSubmitRequest)
from backend.schemas.run import InvocationRequest
from backend.services.async_runs import RuntimeCapacityError, get_async_run_coordinator
from backend.services.run_service import RunService
from backend.services.auth_service import AuthService

router = APIRouter(prefix="/studio/runs", tags=["Studio live runs"])


@router.post("", status_code=202, response_model=RunAccepted)
def submit(payload: RunSubmitRequest, request: Request,
           database: Session = Depends(get_db)) -> RunAccepted:
    user = public_user(request, database)
    tree = accessible_tree(database, user, payload.tree_id)
    if tree.status != "ready" or tree.current_version is None or tree.current_version.status != "ready":
        raise HTTPException(409, "Tree is not ready")
    run = RunService(database).prepare(tree.id, InvocationRequest(
        input={"input": payload.input}, metadata=payload.metadata.model_dump(),
        execution_mode=payload.execution_mode,
    ), invocation_source="studio_live", submitted_by_user_id=user.id)
    factory = sessionmaker(bind=database.get_bind(), autoflush=False, expire_on_commit=False)
    try:
        get_async_run_coordinator().submit(factory, run.id, timeout_seconds=payload.timeout_seconds)
    except RuntimeCapacityError:
        RunService(database).cancel_run(run.id)
        raise HTTPException(503, "Run capacity is temporarily exhausted") from None
    return RunAccepted(execution_mode=payload.execution_mode, run_id=run.id, tree_id=tree.id,
                       tree_version_id=run.tree_version_id, status="queued",
                       created_at=RunService._utc(run.created_at), links=links(run.id))


@router.get("/{run_id}", response_model=RunState)
def status(run_id: str, request: Request, database: Session = Depends(get_db)) -> RunState:
    return run_read(database, authorized_run(database, public_user(request, database), run_id))


@router.get("/{run_id}/events", response_model=EventPage)
def events(run_id: str, request: Request, after: int = Query(0, ge=0),
           limit: int = Query(100, ge=1, le=500), database: Session = Depends(get_db)) -> EventPage:
    return get_events(run_id, request, after, limit, database)


@router.get("/{run_id}/result", response_model=RunResult)
def result(run_id: str, request: Request, database: Session = Depends(get_db)) -> RunResult:
    return get_result(run_id, request, database)


@router.get("/{run_id}/stream", response_class=StreamingResponse)
def stream(run_id: str, request: Request, after: int = Query(0, ge=0),
           database: Session = Depends(get_db)) -> StreamingResponse:
    authorized_run(database, public_user(request, database), run_id)
    identity = f"studio:{request.state.session_id}"
    if not acquire_sse(identity, limit=4):
        raise HTTPException(429, "Too many live connections")
    factory = sessionmaker(bind=database.get_bind(), autoflush=False, expire_on_commit=False)
    return StreamingResponse(_async_stream(factory, run_id, after, identity),
        media_type="text/event-stream", headers={"Cache-Control": "no-cache, no-transform",
                                          "X-Accel-Buffering": "no"})


@router.post("/{run_id}/cancel", response_model=CancelResponse)
def cancel(run_id: str, request: Request,
           database: Session = Depends(get_db)) -> CancelResponse:
    user = public_user(request, database)
    authorized_run(database, user, run_id)
    run = RunService(database).cancel_run(run_id)
    AuthService(database).event("studio_live.run_cancelled", user, user)
    database.commit()
    return CancelResponse(run_id=run_id, status=run.status,
                          cancellation_requested=run.status in {"cancellation_requested", "cancelled"})


@router.get("/{run_id}/artifacts", response_model=ArtifactList)
def artifacts(run_id: str, request: Request,
              database: Session = Depends(get_db)) -> ArtifactList:
    return list_artifacts(run_id, request, database)


@router.get("/{run_id}/artifacts/{artifact_id}")
def artifact(run_id: str, artifact_id: str, request: Request,
             database: Session = Depends(get_db)):
    return get_artifact(run_id, artifact_id, request, database)
