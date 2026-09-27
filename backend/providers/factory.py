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
    compatible_urls = {
        "groq": "https://api.groq.com/openai/v1",
        "openrouter": "https://openrouter.ai/api/v1",
        "cerebras": "https://api.cerebras.ai/v1",
    }
    if provider_type in compatible_urls:
        return OpenAIAdapter(base_url=base_url or compatible_urls[provider_type], client=client)
    if provider_type == "openai_compatible":
        if not base_url:
            raise ValueError("Custom OpenAI-compatible provider requires a base URL")
        return OpenAIAdapter(base_url=base_url, client=client)
    if provider_type == "ollama":
        return OllamaAdapter(base_url=base_url or "http://localhost:11434", client=client)
    raise ValueError(f"Unsupported provider type: {provider_type}")
