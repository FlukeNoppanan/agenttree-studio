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


def _create_generation_provider(
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
        # Planning and review can take longer than a connection smoke test.
        # The Run's existing deadline/cancellation still bounds execution.
        return GeminiProvider(config, api_key=credential, timeout=60)
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


def provider_supports_tool_calling(provider_type: str) -> bool:
    """Return the adapter's declared tool-call capability for a Studio type.

    Unknown provider families are conservative: runtime adapters default to
    unsupported unless they explicitly advertise the capability.
    """
    return provider_type in {
        "openai", "gemini", "groq", "openrouter", "cerebras",
        "openai_compatible", "custom_openai",
    }


def traffic_scope_key(connection, credential):
    """Private process key: same family/endpoint/credential shares traffic.

    Neither plaintext nor this fingerprint is emitted in diagnostics.
    """
    from hashlib import sha256
    from urllib.parse import urlsplit
    endpoint = urlsplit(connection.base_url or "").netloc
    return sha256((connection.provider_type + ":" + endpoint + ":" +
                   (credential or connection.id or connection.name)).encode()).hexdigest()


def create_generation_provider(connection, model_id, credential, provider_name=None):
    from agenttree.providers.traffic import governed
    return governed(_create_generation_provider(connection, model_id, credential, provider_name),
                    key=traffic_scope_key(connection, credential))
