"""Provider connection and discovered-model endpoints."""

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from backend.db.session import get_db
from backend.schemas.provider import (
    ModelDiscoveryResponse,
    ProviderCreate,
    ProviderModelRead,
    ProviderRead,
    ProviderUpdate,
)
from backend.services.model_discovery_service import ModelDiscoveryService
from backend.services.provider_service import ProviderService

router = APIRouter(prefix="/providers", tags=["providers"])


@router.get("", response_model=list[ProviderRead])
def list_providers(database: Session = Depends(get_db)) -> list[ProviderRead]:
    return ProviderService(database).list()


@router.post("", response_model=ProviderRead, status_code=status.HTTP_201_CREATED)
def create_provider(
    payload: ProviderCreate,
    database: Session = Depends(get_db),
) -> ProviderRead:
    return ProviderService(database).create(payload)


@router.get("/{provider_id}", response_model=ProviderRead)
def get_provider(
    provider_id: str,
    database: Session = Depends(get_db),
) -> ProviderRead:
    return ProviderService(database).get(provider_id)


@router.put("/{provider_id}", response_model=ProviderRead)
def update_provider(
    provider_id: str,
    payload: ProviderUpdate,
    database: Session = Depends(get_db),
) -> ProviderRead:
    return ProviderService(database).update(provider_id, payload)


@router.delete("/{provider_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_provider(
    provider_id: str,
    database: Session = Depends(get_db),
) -> Response:
    ProviderService(database).delete(provider_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{provider_id}/test", response_model=ProviderRead)
def test_provider(
    provider_id: str,
    database: Session = Depends(get_db),
) -> ProviderRead:
    return ModelDiscoveryService(database).test_connection(provider_id)


@router.post("/{provider_id}/discover-models", response_model=ModelDiscoveryResponse)
def discover_provider_models(
    provider_id: str,
    database: Session = Depends(get_db),
) -> ModelDiscoveryResponse:
    return ModelDiscoveryService(database).discover_models(provider_id)


@router.get("/{provider_id}/models", response_model=list[ProviderModelRead])
def list_provider_models(
    provider_id: str,
    database: Session = Depends(get_db),
) -> list[ProviderModelRead]:
    return ProviderService(database).models(provider_id)
