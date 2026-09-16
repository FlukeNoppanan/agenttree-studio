"""Construct AgentTree Core generation providers from Studio connections."""

from agenttree.providers import (
    BaseProvider,
    GeminiProvider,
    OllamaProvider,
    OpenAIProvider,
    ProviderConfig,
)

from backend.models.provider import ProviderConnection


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
    if connection.provider_type == "ollama":
        return OllamaProvider(config, host=connection.base_url)
    raise ValueError("Unsupported provider type")
