"""Secret management endpoints."""

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from backend.db.session import get_db
from backend.schemas.secret import SecretCreate, SecretRead
from backend.services.secret_service import SecretService

router = APIRouter(prefix="/secrets", tags=["secrets"])


@router.get("", response_model=list[SecretRead])
def list_secrets(database: Session = Depends(get_db)) -> list[SecretRead]:
    return SecretService(database).list()


@router.post("", response_model=SecretRead, status_code=status.HTTP_201_CREATED)
def create_secret(
    payload: SecretCreate,
    database: Session = Depends(get_db),
) -> SecretRead:
    return SecretService(database).create(payload)


@router.delete("/{secret_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_secret(
    secret_id: str,
    database: Session = Depends(get_db),
) -> Response:
    SecretService(database).delete(secret_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
