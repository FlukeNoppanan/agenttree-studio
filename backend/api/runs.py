"""Synchronous Test Run and persisted run-history endpoints."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.db.session import get_db
from backend.schemas.run import RunDetailRead, RunRead, RunStatus, TestRunRequest, TraceEventRead
from backend.services.run_service import RunService


router = APIRouter(tags=["runs"])


@router.post("/trees/{tree_id}/test-run", response_model=RunDetailRead)
def test_run(
    tree_id: str,
    payload: TestRunRequest,
    database: Session = Depends(get_db),
) -> RunDetailRead:
    return RunService(database).test_run(tree_id, payload)


@router.get("/runs", response_model=list[RunRead])
def list_runs(
    status: RunStatus | None = Query(default=None),
    tree_id: str | None = Query(default=None),
    database: Session = Depends(get_db),
) -> list[RunRead]:
    return RunService(database).list(
        status=status.value if status else None,
        tree_id=tree_id,
    )


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
