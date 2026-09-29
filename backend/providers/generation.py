"""Construct AgentTree Core generation providers from Studio connections."""

from agenttree.providers import (
    BaseProvider,
    CerebrasProvider,
    GeminiProvider,
    GroqProvider,
    OllamaProvider,
    OpenAICompatibleProvider,
    OpenAIProvider,
    OpenRouterProvider,
    ProviderConfig,
)
from ollama import Client as OllamaClient

from backend.models.provider import ProviderConnection
from backend.providers.http import url_targets_loopback


def create_generation_provider(
    connection: ProviderConnection,
    model_id: str,
    credential: str | None,
    provider_name: str | None = None,
) -> BaseProvider:
    """Create a public AgentTree provider without placing secrets in its config."""
    config = ProviderConfig(provider_name=provider_name or connection.name, model=model_id)
    if connection.provider_type == "openai":
        return OpenAIProvider(
            config,
            api_key=credential,
            base_url=connection.base_url,
        )
    if connection.provider_type == "gemini":
        return GeminiProvider(config, api_key=credential)
    if connection.provider_type == "groq":
        return GroqProvider(config, api_key=credential or "")
    if connection.provider_type == "openrouter":
        return OpenRouterProvider(config, api_key=credential or "")
    if connection.provider_type == "cerebras":
        return CerebrasProvider(config, api_key=credential or "")
    if connection.provider_type in {"openai_compatible", "custom_openai"}:
        if not connection.base_url:
            raise ValueError("Custom OpenAI-compatible provider requires a base URL")
        return OpenAICompatibleProvider(
            config, base_url=connection.base_url, api_key=credential,
            streaming=True,
        )
    if connection.provider_type == "ollama":
        client_options = {}
        if url_targets_loopback(connection.base_url or ""):
            # The Ollama SDK also builds an httpx client that otherwise inherits
            # proxy variables. Bypass them for local servers during verification
            # and generation, while leaving proxy support enabled for remote URLs.
            client_options["trust_env"] = False
        client = OllamaClient(host=connection.base_url, **client_options)
        return OllamaProvider(config, client=client)
    raise ValueError("Unsupported provider type")
