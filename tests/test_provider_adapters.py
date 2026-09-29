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
    requests: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={
            "models": [
                {
                    "name": "gemma4:e4b", "modified_at": "2026-09-01T00:00:00Z",
                    "size": 42, "digest": "sha256:gemma", "details": {"format": "gguf"},
                },
                {"name": "qwen3:1.7b", "size": 17},
            ],
        })

    client = httpx.Client(transport=httpx.MockTransport(respond))
    models = OllamaAdapter("http://ollama.test/", client=client).discover_models(None)

    assert [(request.method, str(request.url)) for request in requests] == [
        ("GET", "http://ollama.test/api/tags"),
    ]
    assert [model.model_id for model in models] == ["gemma4:e4b", "qwen3:1.7b"]
    assert [model.display_name for model in models] == ["gemma4:e4b", "qwen3:1.7b"]
    assert models[0].metadata == {
        "modified_at": "2026-09-01T00:00:00Z", "size": 42,
        "digest": "sha256:gemma", "details": {"format": "gguf"},
    }
    assert models[1].metadata == {"size": 17}


@pytest.mark.parametrize(("base_url", "expected_trust_env"), (
    ("http://127.0.0.1:11434/", False),
    ("http://[::1]:11434", False),
    ("http://localhost:11434", False),
    ("http://ollama.internal:11434", True),
))
def test_ollama_client_timeout_and_proxy_policy(
    monkeypatch: pytest.MonkeyPatch, base_url: str, expected_trust_env: bool,
) -> None:
    for name in (
        "HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy",
        "ALL_PROXY", "all_proxy", "NO_PROXY", "no_proxy",
    ):
        monkeypatch.delenv(name, raising=False)
    # Reproduce the environment-sensitive case: curl may still reach loopback,
    # while an httpx client trusting this proxy would send the request elsewhere.
    monkeypatch.setenv("HTTP_PROXY", "http://proxy.invalid:8080")

    options: dict[str, object] = {}
    requests: list[tuple[str, str]] = []

    class StubClient:
        def __init__(self, **kwargs) -> None:
            options.update(kwargs)

        def __enter__(self):
            return self

        def __exit__(self, *args) -> None:
            return None

        def get(self, url, **kwargs):
            requests.append(("GET", str(url)))
            request = httpx.Request("GET", url)
            return httpx.Response(200, json={"models": []}, request=request)

    monkeypatch.setattr("backend.providers.http.httpx.Client", StubClient)

    assert OllamaAdapter(base_url).discover_models(None) == ()
    assert options == {
        "timeout": 15.0,
        "follow_redirects": False,
        "trust_env": expected_trust_env,
    }
    assert requests == [("GET", base_url.rstrip("/") + "/api/tags")]


def test_ollama_http_failure_has_safe_diagnostic() -> None:
    def fail(request: httpx.Request) -> httpx.Response:
        raise httpx.ProxyError("proxy contains sensitive configuration", request=request)

    client = httpx.Client(transport=httpx.MockTransport(fail))

    with pytest.raises(ProviderDiscoveryError) as failure:
        OllamaAdapter("http://127.0.0.1:11434", client=client).discover_models(None)

    assert str(failure.value) == "Ollama connection or model discovery failed"
    assert failure.value.diagnostic == "proxy connection failed"
    assert "sensitive configuration" not in str(failure.value)


def test_provider_http_failure_does_not_expose_secret() -> None:
    secret = "key-that-must-not-leak"
    client = httpx.Client(transport=httpx.MockTransport(
        lambda request: httpx.Response(401, json={"error": secret}),
    ))

    with pytest.raises(ProviderDiscoveryError) as failure:
        GeminiAdapter(client=client).discover_models(secret)

    assert str(failure.value) == "Gemini connection or model discovery failed"
    assert secret not in str(failure.value)
