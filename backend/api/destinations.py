"""Tree result destination management endpoints."""

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from backend.db.session import get_db
from backend.schemas.destination import DestinationRead, DestinationTestRead, DestinationWrite
from backend.services.destination_service import DestinationService, ResultDeliveryService


router = APIRouter(prefix="/trees/{tree_id}/destinations", tags=["destinations"])


@router.get("", response_model=list[DestinationRead])
def list_destinations(tree_id: str, database: Session = Depends(get_db)) -> list[DestinationRead]:
    return DestinationService(database).list(tree_id)


@router.post("", response_model=DestinationRead, status_code=status.HTTP_201_CREATED)
def create_destination(tree_id: str, payload: DestinationWrite, database: Session = Depends(get_db)) -> DestinationRead:
    return DestinationService(database).create(tree_id, payload)


@router.put("/{destination_id}", response_model=DestinationRead)
def update_destination(tree_id: str, destination_id: str, payload: DestinationWrite, database: Session = Depends(get_db)) -> DestinationRead:
    return DestinationService(database).update(tree_id, destination_id, payload)


@router.delete("/{destination_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_destination(tree_id: str, destination_id: str, database: Session = Depends(get_db)) -> Response:
    DestinationService(database).delete(tree_id, destination_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{destination_id}/test", response_model=DestinationTestRead)
def test_destination(tree_id: str, destination_id: str, database: Session = Depends(get_db)) -> DestinationTestRead:
    destination = DestinationService(database)._owned(tree_id, destination_id)
    return ResultDeliveryService(database).test(destination)
