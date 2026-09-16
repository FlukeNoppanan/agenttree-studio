"""Ollama local-server model discovery."""

from typing import Any

import httpx

from backend.providers.base import DiscoveredModel, ProviderAdapter, ProviderDiscoveryError
from backend.providers.http import HttpDiscoveryAdapter


class OllamaAdapter(HttpDiscoveryAdapter, ProviderAdapter):
    provider_label = "Ollama"

    def __init__(self, base_url: str, client: httpx.Client | None = None) -> None:
        super().__init__(client)
        self._base_url = base_url.rstrip("/")

    def discover_models(self, credential: str | None) -> tuple[DiscoveredModel, ...]:
        del credential
        payload = self._get(f"{self._base_url}/api/tags")
        raw_models = payload.get("models")
        if not isinstance(raw_models, list):
            raise ProviderDiscoveryError("Ollama returned an invalid model catalog")
        models: list[DiscoveredModel] = []
        for item in raw_models:
            if not isinstance(item, dict) or not isinstance(item.get("name"), str):
                continue
            metadata: dict[str, Any] = {}
            for key in ("modified_at", "size", "digest", "details"):
                if item.get(key) is not None:
                    metadata[key] = item[key]
            models.append(DiscoveredModel(
                model_id=item["name"],
                display_name=item["name"],
                metadata=metadata,
            ))
        return tuple(models)
