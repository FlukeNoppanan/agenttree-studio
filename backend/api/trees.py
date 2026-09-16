"""Tree draft, version, and validation endpoints."""

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from backend.db.session import get_db
from backend.schemas.tree import (
    TreeDetailRead,
    TreeDraftPayload,
    TreeListRead,
    TreeUpdate,
    TreeValidationRead,
    TreeVersionRead,
)
from backend.services.tree_service import TreeService

router = APIRouter(prefix="/trees", tags=["trees"])


@router.get("", response_model=list[TreeListRead])
def list_trees(database: Session = Depends(get_db)) -> list[TreeListRead]:
    return TreeService(database).list()


@router.post("", response_model=TreeDetailRead, status_code=status.HTTP_201_CREATED)
def create_tree(
    payload: TreeDraftPayload,
    database: Session = Depends(get_db),
) -> TreeDetailRead:
    return TreeService(database).create(payload)


@router.get("/{tree_id}", response_model=TreeDetailRead)
def get_tree(tree_id: str, database: Session = Depends(get_db)) -> TreeDetailRead:
    return TreeService(database).get(tree_id)


@router.put("/{tree_id}", response_model=TreeDetailRead)
def update_tree(
    tree_id: str,
    payload: TreeUpdate,
    database: Session = Depends(get_db),
) -> TreeDetailRead:
    return TreeService(database).update(tree_id, payload)


@router.delete("/{tree_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tree(tree_id: str, database: Session = Depends(get_db)) -> Response:
    TreeService(database).delete(tree_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{tree_id}/version", response_model=TreeVersionRead)
def get_tree_version(
    tree_id: str,
    database: Session = Depends(get_db),
) -> TreeVersionRead:
    return TreeService(database).get_version(tree_id)


@router.put("/{tree_id}/version", response_model=TreeDetailRead)
def save_tree_draft(
    tree_id: str,
    payload: TreeDraftPayload,
    database: Session = Depends(get_db),
) -> TreeDetailRead:
    return TreeService(database).save_draft(tree_id, payload)


@router.post("/{tree_id}/validate", response_model=TreeValidationRead)
def validate_tree(
    tree_id: str,
    mark_ready: bool = Query(default=False),
    database: Session = Depends(get_db),
) -> TreeValidationRead:
    return TreeService(database).validate(tree_id, mark_ready=mark_ready)
