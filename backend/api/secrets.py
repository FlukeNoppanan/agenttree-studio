"""Secret management endpoints."""

from fastapi import APIRouter, Depends, Response, Request, status
from sqlalchemy.orm import Session

from backend.db.session import get_db
from backend.api.auth import current_user
from backend.schemas.secret import SecretCreate, SecretRead
from backend.schemas.dependency import ResourceDependencies
from backend.services.dependency_service import DependencyService
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


@router.get("/{secret_id}/dependencies", response_model=ResourceDependencies)
def secret_dependencies(secret_id: str, request: Request, database: Session = Depends(get_db)) -> ResourceDependencies:
    return DependencyService(database, current_user(request, database)).secret(secret_id)
