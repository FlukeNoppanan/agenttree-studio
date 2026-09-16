"""Capability catalog aggregation and provider-backed suggestions."""

from __future__ import annotations

from collections import Counter
from collections.abc import Callable
import json
import re

from agenttree.providers import BaseProvider, ProviderRequest
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.core.capabilities import capability_label, normalize_capability, normalize_capabilities
from backend.models.provider import ProviderConnection, ProviderModel
from backend.models.tree import AgentConfig
from backend.providers.generation import create_generation_provider
from backend.schemas.capability import (
    CapabilityCatalogItem,
    CapabilitySuggestionRequest,
    CapabilitySuggestionResponse,
    RawCapabilityEnvelope,
)
from backend.services.errors import ProviderOperationError, ServiceError
from backend.services.secret_service import SecretService

GenerationFactory = Callable[[ProviderConnection, str, str | None], BaseProvider]
_CODE_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)


class CapabilityCatalogService:
    def __init__(self, database: Session) -> None:
        self._database = database

    def search(self, query: str | None = None) -> list[CapabilityCatalogItem]:
        usage: Counter[str] = Counter()
        for values in self._database.scalars(select(AgentConfig.capabilities_json)).all():
            for capability in set(normalize_capabilities(values or [])):
                usage[capability] += 1

        clean_query = ""
        if query and query.strip():
            try:
                clean_query = normalize_capability(query)
            except ValueError:
                clean_query = query.strip().lower()
        items = [
            CapabilityCatalogItem(
                id=capability,
                label=capability_label(capability),
                usage_count=count,
            )
            for capability, count in usage.items()
            if not clean_query
            or clean_query in capability
            or clean_query in capability_label(capability).lower()
        ]
        return sorted(items, key=lambda item: (-item.usage_count, item.id))[:50]


class CapabilitySuggestionService:
    def __init__(
        self,
        database: Session,
        provider_factory: GenerationFactory | None = None,
    ) -> None:
        self._database = database
        self._provider_factory = provider_factory or create_generation_provider
        self._secrets = SecretService(database)

    @staticmethod
    def _prompt(payload: CapabilitySuggestionRequest) -> tuple[str, str]:
        system = (
            "You design concise, reusable capability identifiers for a hierarchical "
            "multi-agent system. Return JSON only with a top-level 'suggestions' array. "
            "Return 3 to 6 objects with exactly: id, label, reason. IDs must use lowercase "
            "hyphenated words, describe transferable abilities rather than workflow steps "
            "or instance names, and must not overlap unnecessarily. Do not include markdown."
        )
        context = (
            f"Agent type: {payload.agent_type.value}\n"
            f"Agent name: {payload.name or '(unnamed)'}\n"
            f"Description (primary signal): {payload.description}\n"
            f"System instruction: {payload.system_instruction or '(none)'}\n\n"
            "Respond in this exact semantic shape:\n"
            '{"suggestions":[{"id":"network-analysis","label":"Network Analysis",'
            '"reason":"Analyzes network behavior and connectivity issues."}]}'
        )
        return system, context

    @staticmethod
    def _parse(content: str) -> CapabilitySuggestionResponse:
        if not isinstance(content, str) or not content.strip():
            raise ProviderOperationError("Capability suggestion returned no usable content")
        candidate = _CODE_FENCE.sub("", content.strip()).strip()
        try:
            raw = json.loads(candidate)
        except json.JSONDecodeError:
            start, end = candidate.find("{"), candidate.rfind("}")
            if start < 0 or end <= start:
                raise ProviderOperationError("Capability suggestion returned malformed structured data") from None
            try:
                raw = json.loads(candidate[start:end + 1])
            except json.JSONDecodeError:
                raise ProviderOperationError("Capability suggestion returned malformed structured data") from None
        try:
            envelope = RawCapabilityEnvelope.model_validate(raw)
            suggestions = []
            seen: set[str] = set()
            for item in envelope.suggestions:
                normalized = item.sanitized()
                if normalized.id not in seen:
                    seen.add(normalized.id)
                    suggestions.append(normalized)
                if len(suggestions) == 6:
                    break
        except (ValidationError, ValueError):
            raise ProviderOperationError("Capability suggestion returned invalid structured data") from None
        if not suggestions:
            raise ProviderOperationError("Capability suggestion returned no valid capabilities")
        return CapabilitySuggestionResponse(suggestions=suggestions)

    def suggest(self, payload: CapabilitySuggestionRequest) -> CapabilitySuggestionResponse:
        connection = self._database.get(ProviderConnection, payload.provider_connection_id)
        if connection is None or connection.status != "connected":
            raise ServiceError("Selected provider is unavailable or not connected")
        model = self._database.scalar(select(ProviderModel).where(
            ProviderModel.provider_connection_id == connection.id,
            ProviderModel.model_id == payload.model_id,
            ProviderModel.is_available.is_(True),
        ))
        if model is None:
            raise ServiceError("Selected model is not available from this provider")
        try:
            credential = self._secrets.reveal(connection.secret_id) if connection.secret_id else None
            provider = self._provider_factory(connection, payload.model_id, credential)
            system, prompt = self._prompt(payload)
            response = provider.generate(ProviderRequest(
                prompt=prompt,
                system_prompt=system,
                metadata={"studio_operation": "capability_suggestion"},
            ))
        except ServiceError:
            raise
        except Exception:
            # Core adapters already normalize provider errors, but this outer
            # boundary guarantees SDK messages and credentials never reach APIs.
            raise ProviderOperationError("Capability suggestion provider request failed") from None
        return self._parse(response.content)
