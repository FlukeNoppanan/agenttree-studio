"""Connection testing, durable catalog discovery, and model qualification."""

import json
import time
from datetime import datetime, timedelta, timezone
from collections.abc import Callable
from typing import Protocol

import httpx
from agenttree.providers import ProviderRequest
from agenttree.providers.exceptions import (
    MalformedProviderResponseError, ProviderAuthenticationError,
    ProviderInvalidRequestError, ProviderModelNotFoundError,
    ProviderRateLimitError, ProviderRuntimeError, ProviderTimeoutError,
    ProviderUnavailableError, normalize_provider_error,
)
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
from backend.services.model_qualification import qualify_decisions, EVIDENCE_KEY

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
    # Core normalizes SDK errors before they reach Studio. Inspect every cause
    # so a wrapper cannot turn a temporary provider failure into incompatibility.
    current: BaseException | None = error
    visited: set[int] = set()
    while current is not None and id(current) not in visited:
        visited.add(id(current))
        from agenttree.core.execution_control import ExecutionCancelled
        if isinstance(current, ExecutionCancelled):
            return "transient_error", "verification_stopped", "Qualification stopped — progress saved"
        if isinstance(current, ProviderRateLimitError):
            return "transient_error", ("model_quota_exhausted" if current.quota_exhausted else "model_rate_limited") if current.failure_scope == "model" else "provider_rate_limited", "Qualification rate limited — progress saved"
        if isinstance(current, ProviderAuthenticationError):
            return "transient_error", "provider_auth_failed", "Check the Provider connection before retrying verification"
        if isinstance(current, ProviderTimeoutError):
            return "transient_error", "verification_timeout", "Verification timed out"
        if isinstance(current, ProviderUnavailableError):
            return "transient_error", "provider_unavailable", "Provider temporarily unavailable — try verification later"
        if isinstance(current, ProviderModelNotFoundError):
            return "unavailable", "model_unavailable", "Model is not available from this Provider"
        if isinstance(current, (ProviderInvalidRequestError, MalformedProviderResponseError)):
            return "unavailable", "incompatible_response", "Model does not support the required generation request"
        if isinstance(current, ProviderRuntimeError):
            return "transient_error", "generation_failed", "Generation failed — try verification again"
        current = current.__cause__
    root = _root_error(error)
    if isinstance(root, (TimeoutError, httpx.TimeoutException)):
        return "transient_error", "verification_timeout", "Verification timed out"
    if isinstance(root, (IncompatibleProviderResponse, ValueError)):
        return (
            "unavailable", "incompatible_response",
            "Incompatible response — no final text was returned",
        )

    status = (getattr(root, "status_code", None) or getattr(root, "code", None)
              or getattr(getattr(root, "response", None), "status_code", None))
    try:
        numeric_status = int(status) if status is not None else None
    except (TypeError, ValueError):
        numeric_status = None
    if numeric_status == 429:
        return "transient_error", "provider_rate_limited", "Provider rate limited — try verification later"
    if numeric_status in {401, 403}:
        return "transient_error", "provider_auth_failed", "Check the Provider connection before retrying verification"
    if numeric_status in {408, 504}:
        return "transient_error", "verification_timeout", "Verification timed out"
    if numeric_status is not None and numeric_status >= 500:
        return "transient_error", "provider_unavailable", "Provider temporarily unavailable — try verification later"
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


ATTEMPT_KEY = "qualification_attempt"
FRESH_SECONDS = 24 * 60 * 60


def qualification_pending(model) -> bool:
    metadata = model.metadata if hasattr(model, "metadata") and isinstance(model.metadata, dict) else json.loads(model.metadata_json or "{}")
    return model.qualification_status in {"unknown", "transient_error", "verifying"} or metadata.get(ATTEMPT_KEY, {}).get("status") == "pending"


def qualification_due(model) -> bool:
    metadata = json.loads(model.metadata_json or "{}")
    timestamp = metadata.get(ATTEMPT_KEY, {}).get("retry_at")
    if timestamp:
        try:
            if datetime.fromisoformat(timestamp) > utc_now():
                return False
        except (ValueError, TypeError):
            pass
    checked = model.qualification_checked_at
    if checked and checked.tzinfo is None:
        checked = checked.replace(tzinfo=timezone.utc)
    return qualification_pending(model) or not checked or (utc_now() - checked).total_seconds() >= FRESH_SECONDS


def failure_policy(error):
    status, code, _ = _qualification_failure(error)
    current = error
    seen = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        if isinstance(current, ProviderRateLimitError):
            return current.failure_scope, current.retry_after, current.quota_exhausted
        raw_status = getattr(current, "status_code", None) or getattr(getattr(current, "response", None), "status_code", None)
        if raw_status == 429:
            normalized = normalize_provider_error(current)
            return normalized.failure_scope, normalized.retry_after, normalized.quota_exhausted
        current = current.__cause__
    if status != "transient_error":
        return "model", None, False
    return "provider", None, code in {"provider_auth_failed", "generation_failed"}


class ModelDiscoveryService:
    OLLAMA_VERIFICATION_TIMEOUT_SECONDS = 120.0
    OLLAMA_VERIFICATION_PROMPT = "Reply with exactly OK. Do not explain."
    # Reasoning-capable models can spend a tiny completion budget before
    # emitting the requested text. Keep this synthetic generation probe
    # bounded, but leave enough room for a short reasoning preamble + answer.
    GENERATION_VERIFICATION_MAX_TOKENS = 64

    def __init__(
        self,
        database: Session,
        adapter_factory: AdapterFactory | None = None,
        generation_factory: GenerationFactory | None = None,
        ollama_client_factory: OllamaClientFactory | None = None,
        sleep: Callable[[float], None] | None = None,
    ) -> None:
        self._sleep = sleep or time.sleep
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
            metadata = dict(model.metadata or {})
            previous = json.loads(stored.metadata_json or "{}")
            for key in (EVIDENCE_KEY, ATTEMPT_KEY):
                if key in previous:
                    metadata[key] = previous[key]
            stored.metadata_json = json.dumps(metadata, sort_keys=True) if metadata else None
            stored.is_available = True
            stored.generation_candidate = model.generation_candidate
            stored.discovered_at = now
            if stored.qualification_status is None or (stored.qualification_status == "unavailable" and (stored.qualification_error_code == "not_discovered" or stored.qualification_error_code == "not_generation_capable" and model.generation_candidate)):
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

    def _retry(self, operation):
        for attempt in range(2):
            try:
                return operation()
            except Exception as error:
                if getattr(error, "traffic_governed", False):
                    raise
                status, code, _ = _qualification_failure(error)
                _, retry_after, fatal = failure_policy(error)
                delay = retry_after if retry_after is not None else 1
                if attempt or status != "transient_error" or fatal or code in {"generation_failed", "verification_stopped"} or delay > 5:
                    raise
                self._sleep(delay)

    def _raw_verify_ollama(self, connection: ProviderConnection, model_id: str) -> None:
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

    def _verify_ollama(self, connection: ProviderConnection, model_id: str) -> None:
        from agenttree.providers import BaseProvider, ProviderConfig, ProviderResponse
        from agenttree.providers.traffic import governed
        from backend.providers.generation import traffic_scope_key
        service = self
        class Probe(BaseProvider):
            def generate(self, request):
                try:
                    service._raw_verify_ollama(connection, model_id)
                except httpx.HTTPError as error:
                    raise normalize_provider_error(error) from None
                return ProviderResponse("OK", connection.name, model_id)
        provider = governed(Probe(ProviderConfig(connection.name, model=model_id)),
                            key=traffic_scope_key(connection, self._credential(connection)))
        provider.generate(ProviderRequest(prompt=self.OLLAMA_VERIFICATION_PROMPT, max_tokens=32,
            metadata={"purpose": "studio_model_qualification"}))

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
        request = ProviderRequest(
            prompt="Reply with exactly OK",
            temperature=0,
            max_tokens=self.GENERATION_VERIFICATION_MAX_TOKENS,
            metadata={"purpose": "studio_model_qualification"},
        )
        try:
            response = provider.generate(request)
        except MalformedProviderResponseError as error:
            diagnostic = getattr(error, "diagnostics", {})
            if not (diagnostic.get("response_received") is True
                    and diagnostic.get("finish_reason") == "length"
                    and diagnostic.get("final_content_present") is False):
                raise
            # One bounded continuation for proven output exhaustion, on the
            # same adapter/model. Never turn reasoning-only text into an answer.
            from dataclasses import replace
            response = provider.generate(replace(request, max_tokens=2048))
        content = getattr(response, "content", None)
        if not isinstance(content, str) or not content.strip():
            raise IncompatibleProviderResponse()

    def _decision_provider(self, connection: ProviderConnection, model_id: str):
        if connection.provider_type != "ollama":
            return self._generation(connection, runtime_model_id(connection.provider_type, model_id), self._credential(connection), connection.name)
        from agenttree.providers import OllamaProvider, ProviderConfig
        service = self
        # Exercise Core's real native-format mapping over the same HTTP boundary
        # used by the generation probe, including injected test transports.
        class Client:
            def generate(self, **kwargs):
                base_url = (connection.base_url or "http://localhost:11434").rstrip("/")
                with service._ollama_client(timeout=120.0, follow_redirects=False, trust_env=not url_targets_loopback(base_url)) as client:
                    response = client.post(f"{base_url}/api/generate", json=kwargs)
                response.raise_for_status()
                return response.json()
        from agenttree.providers.traffic import governed
        from backend.providers.generation import traffic_scope_key
        return governed(OllamaProvider(ProviderConfig(connection.name, model=model_id), client=Client()),
                        key=traffic_scope_key(connection, self._credential(connection)))

    def verify_model(self, provider_id: str, model_id: str, *, force: bool = True) -> ProviderModelVerificationResponse:
        from backend.services.qualification_control import qualification_traffic
        events = []
        def observe(event, data):
            events.append({"event": event, **data})
            if len(events) > 64:
                events.pop(0)
        # Cancellation is handled by the existing durable attempt machinery.
        with qualification_traffic(provider_id, observe):
            return self._verify_model(provider_id, model_id, force=force, traffic_events=events)

    def _verify_model(self, provider_id: str, model_id: str, *, force: bool = True,
                      traffic_events=None) -> ProviderModelVerificationResponse:
        connection = self._providers.get_model(provider_id)
        model = next((item for item in connection.models if item.model_id == model_id), None)
        if model is None or not model.is_available:
            raise ResourceNotFoundError("Discovered provider model not found")
        if not model.generation_candidate or (not force and not qualification_due(model)):
            return ProviderModelVerificationResponse(provider=self._providers.get(provider_id), model=self._providers.serialize_model(model))
        metadata_before = json.loads(model.metadata_json or "{}")
        retry_at = metadata_before.get(ATTEMPT_KEY, {}).get("retry_at")
        if retry_at:
            try:
                if datetime.fromisoformat(retry_at) > utc_now():
                    return ProviderModelVerificationResponse(provider=self._providers.get(provider_id), model=self._providers.serialize_model(model))
            except (ValueError, TypeError):
                pass
        previous = (model.qualification_status, model.qualification_checked_at, model.qualification_error_code, model.qualification_message)
        resume_evidence = metadata_before.get(EVIDENCE_KEY) if (
            previous[0] == "transient_error" or metadata_before.get(ATTEMPT_KEY, {}).get("status") == "pending"
        ) else None
        if not isinstance(resume_evidence, dict) or resume_evidence.get("generation") != "passed" or resume_evidence.get("version") != 1:
            resume_evidence = None

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

        # Previous evidence must not appear to describe a new verification
        # when generation/transport fails before fresh decision checks run.
        metadata = json.loads(model.metadata_json) if model.metadata_json else {}
        metadata.pop(EVIDENCE_KEY, None)
        model.metadata_json = json.dumps(metadata, sort_keys=True) if metadata else None

        try:
            from agenttree.providers.traffic import _check
            _check()
            if resume_evidence is None:
                self._retry(lambda: self._verify_generation(connection, model_id))
            delegate = self._decision_provider(connection, model_id)
            service = self
            class RetriedProvider:
                traffic_managed = getattr(delegate, "traffic_managed", False)
                config = getattr(delegate, "config", None)
                if config is None:
                    from agenttree.providers import ProviderConfig
                    config = ProviderConfig("qualification")
                capabilities = getattr(delegate, "capabilities", None)
                def generate(self, request):
                    return service._retry(lambda: delegate.generate(request))
            # Probe fakes and optional adapters may not expose capabilities.
            if RetriedProvider.capabilities is None:
                from agenttree.providers import ProviderCapabilities
                RetriedProvider.capabilities = ProviderCapabilities()
            evidence = qualify_decisions(RetriedProvider(), previous=resume_evidence)
        except Exception as error:  # SDK and HTTP exception classes differ by provider
            qualification_status, error_code, message = _qualification_failure(error)
            model.qualification_status = qualification_status
            model.qualification_error_code = error_code
            model.qualification_message = message
            scope, retry_after, fatal = failure_policy(error)
            from agenttree.providers.traffic_failure import failure_from_exception
            traffic_failure = failure_from_exception(error).diagnostic()
        else:
            metadata = json.loads(model.metadata_json) if model.metadata_json else {}
            metadata[EVIDENCE_KEY] = evidence
            model.metadata_json = json.dumps(metadata, sort_keys=True)
            interrupted = next((item for item in evidence["checks"].values() if item["status"] == "interrupted"), None)
            ready = len(evidence["checks"]) == 6 and all(item["status"] == "passed" for item in evidence["checks"].values())
            model.qualification_status = "qualified" if ready else "transient_error" if interrupted else "limited"
            model.qualification_error_code = None if ready else interrupted["reason_code"] if interrupted else "structured_decision_not_qualified"
            model.qualification_message = "AgentTree decision checks passed" if ready else "Generation works; decision verification was interrupted" if interrupted else "Generation works; some AgentTree decision checks did not pass"
        if model.qualification_status == "transient_error":
            if 'evidence' in locals():
                interrupted = next(item for item in evidence["checks"].values() if item["status"] == "interrupted")
                scope = interrupted.get("failure_scope", "provider")
                retry_after = interrupted.get("retry_after")
                fatal = interrupted.get("fatal", False)
            attempt = {"status": "pending", "reason_code": model.qualification_error_code,
                       "scope": scope, "checked_at": utc_now().isoformat()}
            if "traffic_failure" in locals():
                attempt["traffic_failure"] = traffic_failure
            if retry_after is not None:
                attempt["retry_at"] = (utc_now() + timedelta(seconds=retry_after)).isoformat()
            # Completed prior proof survives an interrupted recheck; it is not
            # presented as new proof. This attempt remains independently pending.
            if previous[0] in {"qualified", "limited"}:
                model.qualification_status, model.qualification_checked_at, model.qualification_error_code, model.qualification_message = previous
                metadata = metadata_before
            else:
                metadata = json.loads(model.metadata_json or "{}")
                model.qualification_checked_at = utc_now()
            metadata[ATTEMPT_KEY] = attempt
            model.metadata_json = json.dumps(metadata, sort_keys=True)
        else:
            metadata = json.loads(model.metadata_json or "{}")
            metadata.pop(ATTEMPT_KEY, None)
            model.metadata_json = json.dumps(metadata, sort_keys=True) if metadata else None
            model.qualification_checked_at = utc_now()
        if traffic_events:
            metadata = json.loads(model.metadata_json or "{}")
            metadata["provider_traffic"] = {"events": traffic_events, "updated_at": utc_now().isoformat()}
            model.metadata_json = json.dumps(metadata, sort_keys=True)
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
                result = self.verify_model(provider_id, model.model_id, force=False)
                attempt = (result.model.metadata or {}).get(ATTEMPT_KEY, {})
                if attempt.get("status") == "pending" and attempt.get("scope") != "model":
                    # Further model requests cannot resolve a provider-wide
                    # failure. Keep the remaining diagnostic rows unqualified.
                    break

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
