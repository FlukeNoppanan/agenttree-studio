"""Connection testing, durable discovery, and real generation qualification."""

import json
from collections.abc import Callable
from typing import Protocol

import httpx
from agenttree.providers import ProviderRequest
from sqlalchemy.orm import Session

from backend.models.common import utc_now
from backend.models.provider import ProviderConnection, ProviderModel
from backend.providers import ProviderAdapter, ProviderDiscoveryError, create_provider_adapter
from backend.providers.generation import create_generation_provider
from backend.schemas.provider import ModelDiscoveryResponse, ModelQualificationSummary, ProviderRead
from backend.services.errors import ProviderOperationError, ServiceError
from backend.services.provider_service import ProviderService
from backend.services.secret_service import SecretService

AdapterFactory = Callable[[str, str | None], ProviderAdapter]
PROVIDER_LABELS = {"openai": "OpenAI", "gemini": "Gemini", "ollama": "Ollama"}


class GenerationProvider(Protocol):
    def generate(self, request: ProviderRequest): ...


GenerationFactory = Callable[
    [ProviderConnection, str, str | None, str | None], GenerationProvider,
]


def runtime_model_id(provider_type: str, provider_native_id: str) -> str:
    """Keep the provider-native ID used by AgentTree and the provider SDK."""
    del provider_type
    return provider_native_id


def _root_error(error: Exception) -> Exception:
    current = error
    visited: set[int] = set()
    while current.__cause__ is not None and id(current) not in visited:
        visited.add(id(current))
        current = current.__cause__
    return current


def _qualification_failure(error: Exception) -> tuple[str, str, str]:
    """Classify an SDK failure without persisting its credential-bearing text."""
    root = _root_error(error)
    status = getattr(root, "status_code", None) or getattr(root, "code", None)
    try:
        numeric_status = int(status) if status is not None else None
    except (TypeError, ValueError):
        numeric_status = None
    lowered = str(root).casefold()
    transient = (
        isinstance(root, (TimeoutError, ConnectionError, httpx.TimeoutException, httpx.NetworkError))
        or numeric_status == 429
        or (numeric_status is not None and numeric_status >= 500)
        or any(token in lowered for token in ("rate limit", "temporarily", "timeout"))
    )
    if transient:
        return (
            "transient_error", "temporarily_unavailable",
            "Temporarily unavailable — try verification again later",
        )
    return (
        "unavailable", "generation_failed",
        "Not available for AgentTree text generation with this connection",
    )


class ModelDiscoveryService:
    def __init__(
        self,
        database: Session,
        adapter_factory: AdapterFactory | None = None,
        generation_factory: GenerationFactory | None = None,
    ) -> None:
        self._database = database
        self._adapters = adapter_factory or create_provider_adapter
        self._generation = generation_factory or create_generation_provider
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

        now = utc_now()
        existing = {model.model_id: model for model in connection.models}
        for model in existing.values():
            if model.model_id not in unique:
                model.is_available = False
                model.qualification_status = "unavailable"
                model.qualification_checked_at = now
                model.qualification_error_code = "not_discovered"
                model.qualification_message = "No longer returned by this provider connection"

        for model_id, model in unique.items():
            stored = existing.get(model_id)
            if stored is None:
                stored = ProviderModel(provider_connection_id=connection.id, model_id=model_id)
                self._database.add(stored)
            stored.display_name = model.display_name
            stored.metadata_json = json.dumps(model.metadata, sort_keys=True) if model.metadata else None
            stored.is_available = True
            stored.generation_candidate = model.generation_candidate
            stored.discovered_at = now
            stored.qualification_status = "unknown"
            stored.qualification_checked_at = None
            stored.qualification_error_code = None
            stored.qualification_message = None
            if not model.generation_candidate:
                stored.qualification_status = "unavailable"
                stored.qualification_checked_at = now
                stored.qualification_error_code = "not_generation_capable"
                stored.qualification_message = "Cannot generate text required by AgentTree"
        self._database.commit()

        credential = self._credential(connection)
        self._database.expire(connection, ["models"])
        for model in connection.models:
            if not model.is_available or not model.generation_candidate:
                continue
            try:
                provider = self._generation(
                    connection,
                    runtime_model_id(connection.provider_type, model.model_id),
                    credential,
                    connection.name,
                )
                response = provider.generate(ProviderRequest(
                    prompt="Reply with exactly OK",
                    temperature=0,
                    max_tokens=8,
                    metadata={"purpose": "studio_model_qualification"},
                ))
                if not getattr(response, "content", "").strip():
                    raise ValueError("Provider returned no text")
            except Exception as error:  # SDK exception types differ by provider
                status, code, message = _qualification_failure(error)
                model.qualification_status = status
                model.qualification_error_code = code
                model.qualification_message = message
            else:
                model.qualification_status = "qualified"
                model.qualification_error_code = None
                model.qualification_message = "Ready to use"
            model.qualification_checked_at = utc_now()
        self._database.commit()

        provider = self._succeed(connection)
        all_models = self._providers.models(connection.id, include_unusable=True)
        return ModelDiscoveryResponse(
            provider=provider,
            models=all_models,
            summary=ModelQualificationSummary(
                discovered_count=len(unique),
                candidate_count=sum(1 for item in all_models if item.is_available and item.generation_candidate),
                usable_count=sum(1 for item in all_models if item.qualification_status == "qualified"),
                unavailable_count=sum(1 for item in all_models if item.qualification_status == "unavailable"),
                transient_error_count=sum(1 for item in all_models if item.qualification_status == "transient_error"),
            ),
        )
