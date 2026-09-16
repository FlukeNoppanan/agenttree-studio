"""Provider, secret, and discovery service/API contracts."""

import asyncio
import json

import pytest
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError
from sqlalchemy import func, select

from backend.api.secrets import create_secret as create_secret_route
from backend.api.secrets import list_secrets as list_secrets_route
from backend.main import handle_validation_error
from backend.models.provider import ProviderModel
from backend.models.secret import Secret
from backend.providers.base import DiscoveredModel, ProviderAdapter, ProviderDiscoveryError
from backend.schemas.provider import ProviderCreate
from backend.schemas.secret import SecretCreate
from backend.services.errors import (
    ProviderOperationError,
    ResourceConflictError,
    ServiceError,
)
from backend.services.model_discovery_service import ModelDiscoveryService
from backend.services.provider_service import ProviderService
from backend.services.secret_service import SecretService


def create_secret(database, value: str = "sk-super-secret-9X2A"):
    return create_secret_route(
        SecretCreate(name="Primary key", secret_type="api_key", value=value),
        database,
    )


def create_openai_provider(database, secret_id: str):
    return ProviderService(database).create(ProviderCreate(
        name="OpenAI Main",
        provider_type="openai",
        secret_id=secret_id,
    ))


def test_create_and_get_secrets_never_expose_raw_value(database) -> None:
    raw_value = "sk-never-return-this-9X2A"
    created = create_secret(database, raw_value)

    response_json = created.model_dump_json()
    assert "value" not in created.model_dump()
    assert "encrypted_value" not in created.model_dump()
    assert created.masked_value == "sk-••••••••9X2A"
    assert raw_value not in response_json

    listed = list_secrets_route(database)
    assert listed == [created]
    assert raw_value not in json.dumps([item.model_dump(mode="json") for item in listed])

    stored = database.scalar(select(Secret))
    assert stored is not None
    assert stored.encrypted_value != raw_value
    assert raw_value not in stored.encrypted_value


def test_delete_secret(database) -> None:
    secret = create_secret(database)

    SecretService(database).delete(secret.id)

    assert SecretService(database).list() == []


def test_create_provider_and_validate_required_fields(database) -> None:
    with pytest.raises(ServiceError, match="OpenAI requires a secret"):
        ProviderService(database).create(ProviderCreate(
            name="No key",
            provider_type="openai",
        ))

    secret = create_secret(database)
    created = create_openai_provider(database, secret.id)

    assert created.provider_type == "openai"
    assert created.secret_id == secret.id
    assert created.status == "not_configured"
    assert created.models_count == 0


def test_ollama_can_exist_without_a_secret(database) -> None:
    created = ProviderService(database).create(ProviderCreate(
        name="Local Ollama",
        provider_type="ollama",
    ))

    assert created.secret_id is None
    assert created.base_url == "http://localhost:11434"


def test_secret_in_use_cannot_be_deleted(database) -> None:
    secret = create_secret(database)
    create_openai_provider(database, secret.id)

    with pytest.raises(ResourceConflictError, match="provider connection"):
        SecretService(database).delete(secret.id)


def test_provider_test_failure_is_handled_without_leaking_credentials(database) -> None:
    secret_value = "sk-must-not-leak-from-errors"
    secret = create_secret(database, secret_value)
    provider = create_openai_provider(database, secret.id)

    class FailingAdapter(ProviderAdapter):
        def discover_models(self, credential):
            raise ProviderDiscoveryError(f"failed with {credential}")

    service = ModelDiscoveryService(
        database,
        adapter_factory=lambda provider_type, base_url: FailingAdapter(),
    )

    with pytest.raises(ProviderOperationError) as failure:
        service.test_connection(provider.id)

    assert str(failure.value) == "OpenAI connection test failed"
    assert secret_value not in str(failure.value)
    stored = ProviderService(database).get(provider.id)
    assert stored.status == "error"
    assert secret_value not in stored.model_dump_json()


def test_model_discovery_stores_and_returns_models(database) -> None:
    secret = create_secret(database)
    provider = create_openai_provider(database, secret.id)

    class CatalogAdapter(ProviderAdapter):
        def discover_models(self, credential):
            assert credential == "sk-super-secret-9X2A"
            return (
                DiscoveredModel("model-z", "Model Z", {"owned_by": "test"}),
                DiscoveredModel("model-a"),
            )

    service = ModelDiscoveryService(
        database,
        adapter_factory=lambda provider_type, base_url: CatalogAdapter(),
    )
    result = service.discover_models(provider.id)

    assert result.provider.status == "connected"
    assert result.provider.models_count == 2
    assert [model.model_id for model in result.models] == ["model-a", "model-z"]
    assert result.models[1].metadata == {"owned_by": "test"}

    stored = ProviderService(database).models(provider.id)
    assert stored == result.models


def test_delete_provider_cascades_related_models(database) -> None:
    provider = ProviderService(database).create(ProviderCreate(
        name="Local",
        provider_type="ollama",
    ))

    class CatalogAdapter(ProviderAdapter):
        def discover_models(self, credential):
            return (DiscoveredModel("local-model"),)

    ModelDiscoveryService(
        database,
        adapter_factory=lambda provider_type, base_url: CatalogAdapter(),
    ).discover_models(provider.id)

    ProviderService(database).delete(provider.id)

    count = database.scalar(select(func.count()).select_from(ProviderModel))
    assert count == 0


def test_validation_error_response_does_not_echo_credentials() -> None:
    credential = "raw-key-that-must-not-appear"
    try:
        SecretCreate(name="", secret_type="api_key", value=credential)
    except ValidationError as exc:
        request_error = RequestValidationError(exc.errors())
    else:  # pragma: no cover - the invalid name must always fail
        raise AssertionError("Expected request validation to fail")

    response = asyncio.run(handle_validation_error(None, request_error))
    body = response.body.decode("utf-8")

    assert response.status_code == 422
    assert credential not in body
    assert '"input"' not in body
