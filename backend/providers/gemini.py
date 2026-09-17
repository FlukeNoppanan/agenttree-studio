"""Gemini model discovery through the Google Generative Language API."""

from typing import Any

import httpx

from backend.providers.base import DiscoveredModel, ProviderAdapter, ProviderDiscoveryError
from backend.providers.http import HttpDiscoveryAdapter


class GeminiAdapter(HttpDiscoveryAdapter, ProviderAdapter):
    provider_label = "Gemini"
    endpoint = "https://generativelanguage.googleapis.com/v1beta/models"

    def __init__(self, client: httpx.Client | None = None) -> None:
        super().__init__(client)

    def discover_models(self, credential: str | None) -> tuple[DiscoveredModel, ...]:
        if not credential:
            raise ProviderDiscoveryError("Gemini requires a configured secret")
        payload = self._get(self.endpoint, params={"key": credential, "pageSize": "1000"})
        raw_models = payload.get("models")
        if not isinstance(raw_models, list):
            raise ProviderDiscoveryError("Gemini returned an invalid model catalog")
        models: list[DiscoveredModel] = []
        for item in raw_models:
            if not isinstance(item, dict) or not isinstance(item.get("name"), str):
                continue
            methods = item.get("supportedGenerationMethods", [])
            if not isinstance(methods, list):
                methods = []
            metadata: dict[str, Any] = {}
            for key in (
                "description", "inputTokenLimit", "outputTokenLimit",
                "supportedGenerationMethods",
            ):
                if item.get(key) is not None:
                    metadata[key] = item[key]
            display_name = item.get("displayName")
            models.append(DiscoveredModel(
                model_id=item["name"],
                display_name=display_name if isinstance(display_name, str) else None,
                metadata=metadata,
                generation_candidate="generateContent" in methods,
            ))
        return tuple(models)
