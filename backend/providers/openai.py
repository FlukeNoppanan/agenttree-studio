"""OpenAI model discovery through the official HTTP API contract."""

from typing import Any

import httpx

from backend.providers.base import DiscoveredModel, ProviderAdapter, ProviderDiscoveryError
from backend.providers.http import HttpDiscoveryAdapter


class OpenAIAdapter(HttpDiscoveryAdapter, ProviderAdapter):
    provider_label = "OpenAI"

    def __init__(self, base_url: str | None = None, client: httpx.Client | None = None) -> None:
        super().__init__(client)
        self._base_url = (base_url or "https://api.openai.com/v1").rstrip("/")

    def discover_models(self, credential: str | None) -> tuple[DiscoveredModel, ...]:
        if not credential:
            raise ProviderDiscoveryError("OpenAI requires a configured secret")
        payload = self._get(
            f"{self._base_url}/models",
            headers={"Authorization": f"Bearer {credential}"},
        )
        raw_models = payload.get("data")
        if not isinstance(raw_models, list):
            raise ProviderDiscoveryError("OpenAI returned an invalid model catalog")
        models: list[DiscoveredModel] = []
        for item in raw_models:
            if not isinstance(item, dict) or not isinstance(item.get("id"), str):
                continue
            metadata: dict[str, Any] = {}
            for key in ("created", "owned_by", "capabilities", "input_modalities", "output_modalities", "supported_parameters"):
                if item.get(key) is not None:
                    metadata[key] = item[key]
            capabilities = item.get("capabilities")
            chat = capabilities.get("chat") if isinstance(capabilities, dict) else None
            outputs = item.get("output_modalities")
            candidate = chat is not False and not (
                isinstance(outputs, list) and outputs and "text" not in outputs
            )
            models.append(DiscoveredModel(model_id=item["id"], metadata=metadata, generation_candidate=candidate))
        return tuple(models)
