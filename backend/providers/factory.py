"""Create Studio discovery adapters from persisted provider settings."""

import httpx

from backend.providers.base import ProviderAdapter
from backend.providers.gemini import GeminiAdapter
from backend.providers.ollama import OllamaAdapter
from backend.providers.openai import OpenAIAdapter


def create_provider_adapter(
    provider_type: str,
    base_url: str | None,
    *,
    client: httpx.Client | None = None,
) -> ProviderAdapter:
    if provider_type == "openai":
        return OpenAIAdapter(base_url=base_url, client=client)
    if provider_type == "gemini":
        return GeminiAdapter(client=client)
    if provider_type == "ollama":
        return OllamaAdapter(base_url=base_url or "http://localhost:11434", client=client)
    raise ValueError(f"Unsupported provider type: {provider_type}")
