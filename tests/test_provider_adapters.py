"""Offline checks for Studio provider HTTP discovery adapters."""

import httpx
import pytest

from backend.providers.base import ProviderDiscoveryError
from backend.providers.gemini import GeminiAdapter
from backend.providers.ollama import OllamaAdapter
from backend.providers.openai import OpenAIAdapter


def test_openai_discovers_server_returned_models() -> None:
    def respond(request: httpx.Request) -> httpx.Response:
        assert request.headers["authorization"] == "Bearer test-key"
        return httpx.Response(200, json={
            "data": [
                {"id": "server-model-b", "owned_by": "vendor"},
                {"id": "server-model-a", "created": 123},
            ],
        })

    client = httpx.Client(transport=httpx.MockTransport(respond))
    models = OpenAIAdapter(client=client).discover_models("test-key")

    assert [model.model_id for model in models] == ["server-model-b", "server-model-a"]
    assert models[0].metadata == {"owned_by": "vendor"}


def test_gemini_marks_models_with_declared_generation_support() -> None:
    def respond(request: httpx.Request) -> httpx.Response:
        assert request.url.params["key"] == "gemini-key"
        return httpx.Response(200, json={
            "models": [
                {
                    "name": "models/generative-one",
                    "displayName": "Generative One",
                    "supportedGenerationMethods": ["generateContent"],
                },
                {
                    "name": "models/embedding-only",
                    "supportedGenerationMethods": ["embedContent"],
                },
            ],
        })

    client = httpx.Client(transport=httpx.MockTransport(respond))
    models = GeminiAdapter(client=client).discover_models("gemini-key")

    assert [model.model_id for model in models] == [
        "models/generative-one", "models/embedding-only",
    ]
    assert [model.generation_candidate for model in models] == [True, False]
    assert models[0].display_name == "Generative One"


def test_ollama_discovers_models_without_a_credential() -> None:
    def respond(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == "http://ollama.test/api/tags"
        return httpx.Response(200, json={
            "models": [{"name": "local-model:latest", "size": 42}],
        })

    client = httpx.Client(transport=httpx.MockTransport(respond))
    models = OllamaAdapter("http://ollama.test", client=client).discover_models(None)

    assert [model.model_id for model in models] == ["local-model:latest"]
    assert models[0].metadata == {"size": 42}


def test_provider_http_failure_does_not_expose_secret() -> None:
    secret = "key-that-must-not-leak"
    client = httpx.Client(transport=httpx.MockTransport(
        lambda request: httpx.Response(401, json={"error": secret}),
    ))

    with pytest.raises(ProviderDiscoveryError) as failure:
        GeminiAdapter(client=client).discover_models(secret)

    assert str(failure.value) == "Gemini connection or model discovery failed"
    assert secret not in str(failure.value)
