"""Stable external invocation API for reusable Trees."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.db.session import get_db
from backend.schemas.run import InvocationRequest, RunDetailRead
from backend.services.run_service import RunService


router = APIRouter(prefix="/runtime", tags=["runtime"])


@router.post("/trees/{tree_id}/invoke", response_model=RunDetailRead)
def invoke_tree(tree_id: str, payload: InvocationRequest, database: Session = Depends(get_db)) -> RunDetailRead:
    return RunService(database).invoke(tree_id, payload, invocation_source="api")
