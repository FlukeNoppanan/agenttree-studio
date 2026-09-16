"""Connection testing and durable provider model discovery."""

import json
from collections.abc import Callable

from sqlalchemy import delete
from sqlalchemy.orm import Session

from backend.models.common import utc_now
from backend.models.provider import ProviderConnection, ProviderModel
from backend.providers import ProviderAdapter, ProviderDiscoveryError, create_provider_adapter
from backend.schemas.provider import ModelDiscoveryResponse, ProviderRead
from backend.services.errors import ProviderOperationError, ServiceError
from backend.services.provider_service import ProviderService
from backend.services.secret_service import SecretService

AdapterFactory = Callable[[str, str | None], ProviderAdapter]
PROVIDER_LABELS = {"openai": "OpenAI", "gemini": "Gemini", "ollama": "Ollama"}


class ModelDiscoveryService:
    def __init__(
        self,
        database: Session,
        adapter_factory: AdapterFactory | None = None,
    ) -> None:
        self._database = database
        self._adapters = adapter_factory or create_provider_adapter
        self._providers = ProviderService(database)
        self._secrets = SecretService(database)

    def _credential(self, connection: ProviderConnection) -> str | None:
        return self._secrets.reveal(connection.secret_id) if connection.secret_id else None

    def _begin(self, connection: ProviderConnection) -> None:
        connection.status = "testing"
        connection.last_error = None
        self._database.commit()

    def _succeed(self, connection: ProviderConnection) -> ProviderRead:
        provider_id = connection.id
        connection.status = "connected"
        connection.last_checked_at = utc_now()
        connection.last_error = None
        self._database.commit()
        self._database.expire_all()
        return self._providers.get(provider_id)

    def _fail(self, connection: ProviderConnection, message: str) -> None:
        connection.status = "error"
        connection.last_checked_at = utc_now()
        connection.last_error = message
        self._database.commit()

    def test_connection(self, provider_id: str) -> ProviderRead:
        connection = self._providers.get_model(provider_id)
        self._begin(connection)
        try:
            adapter = self._adapters(connection.provider_type, connection.base_url)
            adapter.test_connection(self._credential(connection))
        except (ProviderDiscoveryError, ServiceError, ValueError):
            label = PROVIDER_LABELS.get(connection.provider_type, "Provider")
            message = f"{label} connection test failed"
            self._fail(connection, message)
            raise ProviderOperationError(message) from None
        return self._succeed(connection)

    def discover_models(self, provider_id: str) -> ModelDiscoveryResponse:
        connection = self._providers.get_model(provider_id)
        self._begin(connection)
        try:
            adapter = self._adapters(connection.provider_type, connection.base_url)
            discovered = adapter.discover_models(self._credential(connection))
            unique = {}
            for model in discovered:
                model_id = model.model_id.strip()
                if model_id and model_id not in unique:
                    unique[model_id] = model
        except (ProviderDiscoveryError, ServiceError, ValueError):
            label = PROVIDER_LABELS.get(connection.provider_type, "Provider")
            message = f"{label} model discovery failed"
            self._fail(connection, message)
            raise ProviderOperationError(message) from None

        self._database.execute(
            delete(ProviderModel).where(
                ProviderModel.provider_connection_id == connection.id,
            ),
        )
        for model_id, model in unique.items():
            self._database.add(ProviderModel(
                provider_connection_id=connection.id,
                model_id=model_id,
                display_name=model.display_name,
                metadata_json=json.dumps(model.metadata, sort_keys=True) if model.metadata else None,
                is_available=True,
                discovered_at=utc_now(),
            ))
        self._database.commit()
        provider = self._succeed(connection)
        return ModelDiscoveryResponse(
            provider=provider,
            models=self._providers.models(connection.id),
        )
