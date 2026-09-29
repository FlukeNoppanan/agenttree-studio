"""Connection testing, durable catalog discovery, and model qualification."""

import json
from collections.abc import Callable
from typing import Protocol

import httpx
from agenttree.providers import ProviderRequest
from sqlalchemy import update
from sqlalchemy.orm import Session

from backend.models.common import utc_now
from backend.models.provider import ProviderConnection, ProviderModel
from backend.providers import ProviderAdapter, ProviderDiscoveryError, create_provider_adapter
from backend.providers.generation import create_generation_provider
from backend.providers.http import url_targets_loopback
from backend.schemas.provider import (
    ModelDiscoveryResponse,
    ModelQualificationSummary,
    ProviderModelRead,
    ProviderModelVerificationResponse,
    ProviderRead,
)
from backend.services.errors import ProviderOperationError, ResourceNotFoundError, ServiceError
from backend.services.provider_service import ProviderService
from backend.services.secret_service import SecretService

AdapterFactory = Callable[[str, str | None], ProviderAdapter]
PROVIDER_LABELS = {
    "openai": "OpenAI", "gemini": "Gemini", "ollama": "Ollama",
    "groq": "Groq", "openrouter": "OpenRouter", "cerebras": "Cerebras",
    "openai_compatible": "Custom OpenAI-compatible",
}


class GenerationProvider(Protocol):
    def generate(self, request: ProviderRequest): ...


GenerationFactory = Callable[
    [ProviderConnection, str, str | None, str | None], GenerationProvider,
]
OllamaClientFactory = Callable[..., httpx.Client]


class IncompatibleProviderResponse(Exception):
    """A provider completed a request but returned no usable text response."""


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
    """Classify a failure with a safe reason; never persist exception text."""
    root = _root_error(error)
    if isinstance(root, (TimeoutError, httpx.TimeoutException)):
        return "transient_error", "verification_timeout", "Verification timed out"
    if isinstance(root, (IncompatibleProviderResponse, ValueError)):
        return (
            "unavailable", "incompatible_response",
            "Incompatible response — no final text was returned",
        )

    status = getattr(root, "status_code", None) or getattr(root, "code", None)
    try:
        numeric_status = int(status) if status is not None else None
    except (TypeError, ValueError):
        numeric_status = None
    lowered = str(root).casefold()
    transient = (
        isinstance(root, (ConnectionError, httpx.NetworkError))
        or numeric_status == 429
        or (numeric_status is not None and numeric_status >= 500)
        or "timeout" in lowered
        or "timed out" in lowered
    )
    if transient:
        return "transient_error", "generation_failed", "Generation failed — try verification again"
    return "unavailable", "generation_failed", "Generation failed"


class ModelDiscoveryService:
    OLLAMA_VERIFICATION_TIMEOUT_SECONDS = 120.0
    OLLAMA_VERIFICATION_PROMPT = "Reply with exactly OK. Do not explain."

    def __init__(
        self,
        database: Session,
        adapter_factory: AdapterFactory | None = None,
        generation_factory: GenerationFactory | None = None,
        ollama_client_factory: OllamaClientFactory | None = None,
    ) -> None:
        self._database = database
        self._adapters = adapter_factory or create_provider_adapter
        self._generation = generation_factory or create_generation_provider
        self._ollama_client = ollama_client_factory or httpx.Client
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

    @staticmethod
    def _failure_message(label: str, action: str, error: Exception) -> str:
        message = f"{label} {action} failed"
        diagnostic = getattr(error, "diagnostic", None)
        return f"{message} ({diagnostic})" if diagnostic else message

    def test_connection(self, provider_id: str) -> ProviderRead:
        connection = self._providers.get_model(provider_id)
        self._begin(connection)
        try:
            adapter = self._adapters(connection.provider_type, connection.base_url)
            adapter.test_connection(self._credential(connection))
        except (ProviderDiscoveryError, ServiceError, ValueError) as error:
            label = PROVIDER_LABELS.get(connection.provider_type, "Provider")
            message = self._failure_message(label, "connection test", error)
            self._fail(connection, message)
            raise ProviderOperationError(message) from None
        return self._succeed(connection)

    def discover_catalog(self, provider_id: str) -> ModelDiscoveryResponse:
        """Persist a provider catalog without blocking on generation checks."""
        connection = self._providers.get_model(provider_id)
        try:
            adapter = self._adapters(connection.provider_type, connection.base_url)
            discovered = adapter.discover_models(self._credential(connection))
            unique = {}
            for model in discovered:
                model_id = model.model_id.strip()
                if model_id and model_id not in unique:
                    unique[model_id] = model
        except (ProviderDiscoveryError, ServiceError, ValueError) as error:
            label = PROVIDER_LABELS.get(connection.provider_type, "Provider")
            message = self._failure_message(label, "model discovery", error)
            # Catalog failure is separate from connection health. A successful
            # connection test remains connected and can be retried independently.
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

    def _verify_ollama(self, connection: ProviderConnection, model_id: str) -> None:
        base_url = (connection.base_url or "http://localhost:11434").rstrip("/")
        request_body = {
            "model": model_id,
            "prompt": self.OLLAMA_VERIFICATION_PROMPT,
            "stream": False,
            "think": False,
            "options": {"temperature": 0, "num_predict": 32},
        }
        with self._ollama_client(
            timeout=self.OLLAMA_VERIFICATION_TIMEOUT_SECONDS,
            follow_redirects=False,
            trust_env=not url_targets_loopback(base_url),
        ) as client:
            response = client.post(f"{base_url}/api/generate", json=request_body)
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict):
            raise IncompatibleProviderResponse()
        content = payload.get("response")
        if not isinstance(content, str) or not content.strip():
            # Do not accept private reasoning as an answer. If an Ollama server
            # returns thinking without response despite think=false, report the
            # response shape as incompatible without exposing its contents.
            raise IncompatibleProviderResponse()

    def _verify_generation(self, connection: ProviderConnection, model_id: str) -> None:
        if connection.provider_type == "ollama":
            self._verify_ollama(connection, model_id)
            return

        provider = self._generation(
            connection,
            runtime_model_id(connection.provider_type, model_id),
            self._credential(connection),
            connection.name,
        )
        response = provider.generate(ProviderRequest(
            prompt="Reply with exactly OK",
            temperature=0,
            max_tokens=8,
            metadata={"purpose": "studio_model_qualification"},
        ))
        content = getattr(response, "content", None)
        if not isinstance(content, str) or not content.strip():
            raise IncompatibleProviderResponse()

    def verify_model(self, provider_id: str, model_id: str) -> ProviderModelVerificationResponse:
        connection = self._providers.get_model(provider_id)
        model = next((item for item in connection.models if item.model_id == model_id), None)
        if model is None or not model.is_available:
            raise ResourceNotFoundError("Discovered provider model not found")
        if not model.generation_candidate:
            return ProviderModelVerificationResponse(
                provider=self._providers.get(provider_id),
                model=self._providers.serialize_model(model),
            )

        # Claim the row atomically so duplicate clicks or API retries cannot
        # generate against the same model concurrently, even across workers.
        checked_at = utc_now()
        claimed = self._database.execute(
            update(ProviderModel)
            .where(
                ProviderModel.id == model.id,
                ProviderModel.qualification_status != "verifying",
            )
            .values(
                qualification_status="verifying",
                qualification_checked_at=checked_at,
                qualification_error_code=None,
                qualification_message="Verification in progress",
            )
        )
        if claimed.rowcount != 1:
            self._database.rollback()
            self._database.refresh(model)
            return ProviderModelVerificationResponse(
                provider=self._providers.get(provider_id),
                model=self._providers.serialize_model(model),
            )
        self._database.commit()
        self._database.refresh(model)

        try:
            self._verify_generation(connection, model_id)
        except Exception as error:  # SDK and HTTP exception classes differ by provider
            qualification_status, error_code, message = _qualification_failure(error)
            model.qualification_status = qualification_status
            model.qualification_error_code = error_code
            model.qualification_message = message
        else:
            model.qualification_status = "qualified"
            model.qualification_error_code = None
            model.qualification_message = "Ready to use"
        model.qualification_checked_at = utc_now()
        self._database.commit()

        return ProviderModelVerificationResponse(
            provider=self._providers.get(provider_id),
            model=self._providers.serialize_model(model),
        )

    def discover_models(self, provider_id: str) -> ModelDiscoveryResponse:
        """Backward-compatible catalog plus sequential verification operation."""
        catalog = self.discover_catalog(provider_id)
        for model in catalog.models:
            if model.is_available and model.generation_candidate:
                self.verify_model(provider_id, model.model_id)

        provider = self._providers.get(provider_id)
        all_models = self._providers.models(provider_id, include_unusable=True)
        return ModelDiscoveryResponse(
            provider=provider,
            models=all_models,
            summary=ModelQualificationSummary(
                discovered_count=catalog.summary.discovered_count,
                candidate_count=catalog.summary.candidate_count,
                usable_count=sum(1 for item in all_models if item.qualification_status == "qualified"),
                unavailable_count=sum(1 for item in all_models if item.qualification_status == "unavailable"),
                transient_error_count=sum(1 for item in all_models if item.qualification_status == "transient_error"),
            ),
        )
