"""CRUD and validation for provider connections."""

from __future__ import annotations

import json
from urllib.parse import urlparse

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from backend.models.provider import ProviderConnection, ProviderModel
from backend.models.secret import Secret
from backend.services.dependency_service import DependencyService
from backend.schemas.provider import (
    ProviderCreate,
    ProviderModelRead,
    ProviderRead,
    ProviderUpdate,
)
from backend.services.errors import ResourceConflictError, ResourceNotFoundError, ServiceError


class ProviderService:
    def __init__(self, database: Session) -> None:
        self._database = database

    @staticmethod
    def _validate_url(value: str | None, *, required: bool) -> str | None:
        if value is None or not value.strip():
            if required:
                return "http://localhost:11434"
            return None
        normalized = value.strip().rstrip("/")
        parsed = urlparse(normalized)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            raise ServiceError("Base URL must be a valid http or https URL")
        if parsed.username or parsed.password:
            raise ServiceError("Base URL must not contain credentials")
        return normalized

    def _validate_configuration(
        self,
        provider_type: str,
        secret_id: str | None,
        base_url: str | None,
    ) -> tuple[str | None, str | None]:
        credential_types = {
            "openai": "OpenAI", "gemini": "Gemini", "groq": "Groq",
            "openrouter": "OpenRouter", "cerebras": "Cerebras",
            "openai_compatible": "Custom OpenAI-compatible",
        }
        if provider_type in credential_types:
            if not secret_id:
                raise ServiceError(f"{credential_types[provider_type]} requires a secret")
            if self._database.get(Secret, secret_id) is None:
                raise ServiceError("Selected secret does not exist")
        elif secret_id and self._database.get(Secret, secret_id) is None:
            raise ServiceError("Selected secret does not exist")

        if provider_type == "gemini" and base_url:
            raise ServiceError("Gemini does not support a custom base URL")
        base_url = self._validate_url(
            base_url, required=provider_type in {"ollama", "openai_compatible"},
        )
        return secret_id, base_url

    @staticmethod
    def model_status(model: ProviderModel) -> str:
        metadata = json.loads(model.metadata_json) if model.metadata_json else {}
        if model.qualification_status == "qualified":
            evidence = metadata.get("agenttree_qualification", {})
            required = {"structured_output", "root_planning", "triage", "decomposition", "manager_review", "final_review"}
            checks = evidence.get("checks", {}) if isinstance(evidence, dict) else {}
            if not (isinstance(evidence, dict) and evidence.get("version") == 1
                    and evidence.get("generation") == "passed"
                    and isinstance(checks, dict) and set(checks) == required
                    and all(isinstance(item, dict) and item.get("status") == "passed" for item in checks.values())):
                # Old OK-only or incomplete evidence cannot claim decision readiness.
                return "limited"
        return model.qualification_status

    @staticmethod
    def serialize(connection: ProviderConnection) -> ProviderRead:
        available = [m for m in connection.models if m.is_available]
        candidates = [m for m in available if m.generation_candidate]
        attempts = [(json.loads(m.metadata_json or "{}").get("qualification_attempt", {})) for m in candidates]
        pause = next((a.get("reason_code") for a in reversed(attempts) if a.get("status") == "pending" and a.get("scope") != "model"), None)
        return ProviderRead(
            id=connection.id,
            name=connection.name,
            provider_type=connection.provider_type,
            secret_id=connection.secret_id,
            base_url=connection.base_url,
            status=connection.status,
            last_checked_at=connection.last_checked_at,
            last_error=connection.last_error,
            models_count=sum(
                1 for model in connection.models
                if model.is_available and model.generation_candidate
                and ProviderService.model_status(model) == "qualified"
            ),
            discovered_models_count=sum(1 for model in connection.models if model.is_available),
            unavailable_models_count=sum(
                1 for model in connection.models
                if model.qualification_status == "unavailable"
            ),
            transient_models_count=sum(
                1 for model in connection.models
                if model.qualification_status == "transient_error"
            ),
            limited_models_count=sum(ProviderService.model_status(m) == "limited" for m in available),
            pending_models_count=sum(m.qualification_status in {"unknown", "transient_error", "verifying"} for m in candidates),
            checked_models_count=sum(m.qualification_status in {"qualified", "limited", "unavailable"} for m in candidates),
            candidate_models_count=len(candidates),
            pending_rechecks_count=sum(a.get("status") == "pending" and m.qualification_status in {"qualified", "limited"} for m, a in zip(candidates, attempts)),
            qualification_pause_code=pause,
            created_at=connection.created_at,
            updated_at=connection.updated_at,
        )

    @staticmethod
    def serialize_model(model: ProviderModel) -> ProviderModelRead:
        metadata = json.loads(model.metadata_json) if model.metadata_json else None
        return ProviderModelRead(
            id=model.id,
            provider_connection_id=model.provider_connection_id,
            model_id=model.model_id,
            display_name=model.display_name,
            metadata=metadata,
            is_available=model.is_available,
            generation_candidate=model.generation_candidate,
            qualification_status=ProviderService.model_status(model),
            qualification_checked_at=model.qualification_checked_at,
            qualification_error_code=model.qualification_error_code,
            qualification_message=model.qualification_message,
            discovered_at=model.discovered_at,
        )

    def _query(self):
        return select(ProviderConnection).options(selectinload(ProviderConnection.models))

    def get_model(self, provider_id: str) -> ProviderConnection:
        connection = self._database.scalar(
            self._query().where(ProviderConnection.id == provider_id),
        )
        if connection is None:
            raise ResourceNotFoundError("Provider connection not found")
        return connection

    def get(self, provider_id: str) -> ProviderRead:
        return self.serialize(self.get_model(provider_id))

    def list(self) -> list[ProviderRead]:
        connections = self._database.scalars(
            self._query().order_by(ProviderConnection.created_at.desc()),
        ).all()
        return [self.serialize(connection) for connection in connections]

    def create(self, payload: ProviderCreate) -> ProviderRead:
        secret_id, base_url = self._validate_configuration(
            payload.provider_type.value, payload.secret_id, payload.base_url,
        )
        connection = ProviderConnection(
            name=payload.name,
            provider_type=payload.provider_type.value,
            secret_id=secret_id,
            base_url=base_url,
        )
        self._database.add(connection)
        self._database.commit()
        return self.get(connection.id)

    def update(self, provider_id: str, payload: ProviderUpdate) -> ProviderRead:
        connection = self.get_model(provider_id)
        changes = payload.model_dump(exclude_unset=True)
        provider_type = changes.get("provider_type", connection.provider_type)
        if hasattr(provider_type, "value"):
            provider_type = provider_type.value
        secret_id = changes.get("secret_id", connection.secret_id)
        base_url = changes.get("base_url", connection.base_url)
        secret_id, base_url = self._validate_configuration(
            provider_type, secret_id, base_url,
        )
        configuration_changed = any(
            value != current
            for value, current in (
                (provider_type, connection.provider_type),
                (secret_id, connection.secret_id),
                (base_url, connection.base_url),
            )
        )
        if "name" in changes:
            connection.name = changes["name"]
        connection.provider_type = provider_type
        connection.secret_id = secret_id
        connection.base_url = base_url
        if configuration_changed:
            connection.status = "not_configured"
            connection.last_checked_at = None
            connection.last_error = None
            connection.models.clear()
        self._database.commit()
        return self.get(connection.id)

    def delete(self, provider_id: str) -> None:
        # Lock before inspecting. Concurrent FK-backed binding writes must finish
        # before this current-version check; deletion cannot race their commit.
        self._database.scalar(select(ProviderConnection).where(
            ProviderConnection.id == provider_id).with_for_update())
        connection = self.get_model(provider_id)
        if not DependencyService(self._database).provider(provider_id).can_delete:
            raise ResourceConflictError("Provider is still in use; inspect its dependencies before deleting")
        from backend.services.resource_identity import remember_provider
        remember_provider(self._database, provider_id)
        self._database.flush()
        self._database.delete(connection)
        try:
            self._database.commit()
        except IntegrityError as error:
            self._database.rollback()
            raise ResourceConflictError("Provider gained a dependency; inspect its dependencies before deleting") from error

    def models(
        self, provider_id: str, *, include_unusable: bool = False,
    ) -> list[ProviderModelRead]:
        connection = self.get_model(provider_id)
        return [
            self.serialize_model(model)
            for model in sorted(connection.models, key=lambda item: item.model_id.casefold())
            if include_unusable or (
                model.is_available
                and model.generation_candidate
                and ProviderService.model_status(model) in {"qualified", "limited"}
            )
        ]
