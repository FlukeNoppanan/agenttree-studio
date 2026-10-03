"""Synchronous Test Run and persisted run-history endpoints."""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from backend.db.session import get_db
from backend.api.auth import current_user
from backend.services.auth_service import AuthService
from backend.schemas.run import RunDetailRead, RunPageRead, RunRead, RunStatus, TestRunRequest, TraceEventRead, TreeLiveRead
from backend.services.run_service import RunService


router = APIRouter(tags=["runs"])


@router.get("/trees/{tree_id}/live", response_model=TreeLiveRead)
def tree_live(tree_id: str, database: Session = Depends(get_db)) -> TreeLiveRead:
    return RunService(database).live(tree_id)


@router.post("/trees/{tree_id}/test-run", response_model=RunDetailRead)
def test_run(
    tree_id: str,
    payload: TestRunRequest,
    database: Session = Depends(get_db),
) -> RunDetailRead:
    return RunService(database).test_run(tree_id, payload)


@router.get("/runs", response_model=list[RunRead] | RunPageRead)
def list_runs(
    request: Request,
    status: RunStatus | None = Query(default=None),
    tree_id: str | None = Query(default=None),
    database: Session = Depends(get_db),
    page: int | None = Query(default=None, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    search: str = Query(default="", max_length=160),
    after: datetime | None = Query(default=None),
    before: datetime | None = Query(default=None),
) -> list[RunRead] | RunPageRead:
    allowed = {tree.id for tree in AuthService(database).accessible_trees(current_user(request, database))}
    # Preserve the original array contract for callers that do not opt into pages.
    if isinstance(page, int):
        if any(value is not None and value.utcoffset() is None for value in (after, before)):
            raise HTTPException(422, "Date filters must include a timezone")
        if after and before and after > before:
            raise HTTPException(422, "Start must be before end")
        return RunService(database).page(allowed_tree_ids=allowed, page=page,
            page_size=page_size, status=status.value if status else None,
            tree_id=tree_id, search=search, after=after, before=before)
    return [run for run in RunService(database).list(
        status=status.value if status else None, tree_id=tree_id,
    ) if run.tree_id in allowed]


@router.get("/runs/{run_id}", response_model=RunDetailRead)
def get_run(run_id: str, database: Session = Depends(get_db)) -> RunDetailRead:
    return RunService(database).get(run_id)


@router.get("/runs/{run_id}/trace", response_model=list[TraceEventRead])
def get_run_trace(
    run_id: str,
    database: Session = Depends(get_db),
) -> list[TraceEventRead]:
    return RunService(database).trace(run_id)


@router.get("/trees/{tree_id}/runs", response_model=list[RunRead])
def list_tree_runs(
    tree_id: str,
    status: RunStatus | None = Query(default=None),
    database: Session = Depends(get_db),
) -> list[RunRead]:
    return RunService(database).list(
        status=status.value if status else None,
        tree_id=tree_id,
    )
