"""Provider, secret, and discovery service/API contracts."""

import asyncio
import json

import httpx
import pytest
from agenttree.providers import (CerebrasProvider, GroqProvider,
                                 OpenAICompatibleProvider, OpenRouterProvider,
                                 ProviderResponse)
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError
from sqlalchemy import func, select

from backend.api.secrets import create_secret as create_secret_route
from backend.api.secrets import list_secrets as list_secrets_route
from backend.main import handle_validation_error
from backend.models.provider import ProviderConnection, ProviderModel
from backend.providers.generation import create_generation_provider
from backend.models.secret import Secret
from backend.providers.base import DiscoveredModel, ProviderAdapter, ProviderDiscoveryError
from backend.providers.ollama import OllamaAdapter
from backend.schemas.provider import ProviderCreate, ProviderType
from backend.schemas.secret import SecretCreate
from backend.services.errors import (
    ProviderOperationError,
    ResourceConflictError,
    ServiceError,
)
from backend.services.model_discovery_service import ModelDiscoveryService, runtime_model_id
from backend.services.provider_service import ProviderService
from backend.services.secret_service import SecretService


def create_secret(database, value: str = "sk-super-secret-9X2A"):
    return create_secret_route(
        SecretCreate(name="Primary key", secret_type="api_key", value=value),
        database,
    )


def create_openai_provider(database, secret_id: str):
    return ProviderService(database).create(ProviderCreate(
        name="OpenAI Main",
        provider_type="openai",
        secret_id=secret_id,
    ))


def test_create_and_get_secrets_never_expose_raw_value(database) -> None:
    raw_value = "sk-never-return-this-9X2A"
    created = create_secret(database, raw_value)

    response_json = created.model_dump_json()
    assert "value" not in created.model_dump()
    assert "encrypted_value" not in created.model_dump()
    assert created.masked_value == SecretService.MASKED_VALUE
    assert raw_value not in response_json

    listed = list_secrets_route(database)
    assert listed == [created]
    assert raw_value not in json.dumps([item.model_dump(mode="json") for item in listed])

    stored = database.scalar(select(Secret))
    assert stored is not None
    assert stored.encrypted_value != raw_value
    assert raw_value not in stored.encrypted_value


def test_delete_secret(database) -> None:
    secret = create_secret(database)

    SecretService(database).delete(secret.id)

    assert SecretService(database).list() == []


def test_create_provider_and_validate_required_fields(database) -> None:
    with pytest.raises(ServiceError, match="OpenAI requires a secret"):
        ProviderService(database).create(ProviderCreate(
            name="No key",
            provider_type="openai",
        ))

    secret = create_secret(database)
    created = create_openai_provider(database, secret.id)

    assert created.provider_type == "openai"
    assert created.secret_id == secret.id
    assert created.status == "not_configured"
    assert created.models_count == 0


def test_ollama_can_exist_without_a_secret(database) -> None:
    created = ProviderService(database).create(ProviderCreate(
        name="Local Ollama",
        provider_type="ollama",
    ))

    assert created.secret_id is None
    assert created.base_url == "http://localhost:11434"


def test_ollama_test_and_discovery_use_normalized_tags_catalog(database) -> None:
    requested: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        requested.append(request)
        if request.url.path == "/api/tags":
            body = {
                "models": [
                    {"name": "gemma4:e4b", "size": 400, "details": {"format": "gguf"}},
                    {"name": "qwen3:1.7b", "size": 170},
                ],
            }
        else:
            body = {"model": json.loads(request.content)["model"], "response": "OK", "thinking": ""}
        return httpx.Response(200, json=body)

    client = httpx.Client(transport=httpx.MockTransport(respond))
    provider = ProviderService(database).create(ProviderCreate(
        name="Local Ollama",
        provider_type="ollama",
        base_url="http://127.0.0.1:11434/",
    ))
    assert provider.base_url == "http://127.0.0.1:11434"

    def adapter_factory(provider_type, base_url):
        assert provider_type == "ollama"
        return OllamaAdapter(base_url, client=client)

    client_options: list[dict] = []
    def generation_client_factory(**kwargs):
        client_options.append(kwargs)
        return httpx.Client(transport=httpx.MockTransport(respond), **kwargs)

    service = ModelDiscoveryService(
        database,
        adapter_factory=adapter_factory,
        ollama_client_factory=generation_client_factory,
    )

    tested = service.test_connection(provider.id)
    discovered = service.discover_models(provider.id)

    assert tested.status == "connected"
    assert discovered.provider.status == "connected"
    assert discovered.provider.models_count == 2
    assert discovered.summary.discovered_count == 2
    assert [model.model_id for model in discovered.models] == ["gemma4:e4b", "qwen3:1.7b"]
    assert discovered.models[0].metadata == {"details": {"format": "gguf"}, "size": 400}
    assert all(model.qualification_status == "qualified" for model in discovered.models)
    assert [(request.method, request.url.path) for request in requested] == [
        ("GET", "/api/tags"), ("GET", "/api/tags"),
        ("POST", "/api/generate"), ("POST", "/api/generate"),
    ]
    assert [str(request.url) for request in requested] == [
        "http://127.0.0.1:11434/api/tags",
        "http://127.0.0.1:11434/api/tags",
        "http://127.0.0.1:11434/api/generate",
        "http://127.0.0.1:11434/api/generate",
    ]
    bodies = [json.loads(request.content) for request in requested if request.method == "POST"]
    assert [body["model"] for body in bodies] == ["gemma4:e4b", "qwen3:1.7b"]
    assert all(body["think"] is False and body["stream"] is False for body in bodies)
    assert all(options["timeout"] == 120.0 and options["trust_env"] is False for options in client_options)


def test_qwen3_thinking_only_response_does_not_fail_other_ollama_models(database) -> None:
    generation_requests: list[dict] = []

    def tags(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/tags":
            return httpx.Response(200, json={"models": [
                {"name": "gemma4:e4b"}, {"name": "qwen3:1.7b"},
            ]})
        body = json.loads(request.content)
        generation_requests.append(body)
        if body["model"] == "gemma4:e4b":
            return httpx.Response(200, json={
                "model": "gemma4:e4b", "response": "OK", "thinking": "", "done": True,
            })
        return httpx.Response(200, json={
            "model": "qwen3:1.7b", "response": "", "thinking": "private reasoning text", "done": True,
        })

    catalog_client = httpx.Client(transport=httpx.MockTransport(tags))
    provider = ProviderService(database).create(ProviderCreate(
        name="Qwen Ollama", provider_type="ollama",
        base_url="http://127.0.0.1:11434",
    ))
    service = ModelDiscoveryService(
        database,
        adapter_factory=lambda provider_type, base_url: OllamaAdapter(base_url, client=catalog_client),
        ollama_client_factory=lambda **kwargs: httpx.Client(
            transport=httpx.MockTransport(tags), **kwargs,
        ),
    )

    catalog = service.discover_catalog(provider.id)
    gemma = service.verify_model(provider.id, "gemma4:e4b")
    qwen = service.verify_model(provider.id, "qwen3:1.7b")

    assert catalog.summary.discovered_count == 2
    assert gemma.provider.status == qwen.provider.status == "connected"
    assert gemma.model.qualification_status == "qualified"
    assert qwen.model.model_id == "qwen3:1.7b"
    assert qwen.model.qualification_status == "unavailable"
    assert qwen.model.qualification_error_code == "incompatible_response"
    assert qwen.model.qualification_message == "Incompatible response — no final text was returned"
    assert "private reasoning text" not in qwen.model.model_dump_json()
    assert [item["model"] for item in generation_requests] == ["gemma4:e4b", "qwen3:1.7b"]
    assert all(item["think"] is False and item["stream"] is False for item in generation_requests)
    assert ProviderService(database).get(provider.id).models_count == 1


def test_qwen3_verifies_when_ollama_thinking_is_disabled(database) -> None:
    generation_requests: list[dict] = []

    def respond(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/tags":
            return httpx.Response(200, json={"models": [{"name": "qwen3:1.7b"}]})
        body = json.loads(request.content)
        generation_requests.append(body)
        if body.get("think") is False:
            return httpx.Response(200, json={
                "model": "qwen3:1.7b", "response": "OK", "thinking": "", "done": True,
            })
        return httpx.Response(200, json={
            "model": "qwen3:1.7b", "response": "", "thinking": "private reasoning text", "done": True,
        })

    catalog_client = httpx.Client(transport=httpx.MockTransport(respond))
    provider = ProviderService(database).create(ProviderCreate(
        name="Qwen Ollama", provider_type="ollama", base_url="http://127.0.0.1:11434",
    ))
    service = ModelDiscoveryService(
        database,
        adapter_factory=lambda provider_type, base_url: OllamaAdapter(base_url, client=catalog_client),
        ollama_client_factory=lambda **kwargs: httpx.Client(
            transport=httpx.MockTransport(respond), **kwargs,
        ),
    )

    service.discover_catalog(provider.id)
    result = service.verify_model(provider.id, "qwen3:1.7b")

    assert generation_requests == [{
        "model": "qwen3:1.7b",
        "prompt": "Reply with exactly OK. Do not explain.",
        "stream": False,
        "think": False,
        "options": {"temperature": 0, "num_predict": 32},
    }]
    assert result.provider.status == "connected"
    assert result.model.qualification_status == "qualified"
    assert result.model.qualification_message == "Ready to use"
    assert result.provider.models_count == 1


def test_ollama_verification_timeout_is_transient_and_safe(database) -> None:
    def respond(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/tags":
            return httpx.Response(200, json={"models": [{"name": "qwen3:1.7b"}]})
        raise httpx.ReadTimeout("sensitive host and private diagnostic", request=request)

    client = httpx.Client(transport=httpx.MockTransport(respond))
    provider = ProviderService(database).create(ProviderCreate(
        name="Qwen Ollama", provider_type="ollama", base_url="http://127.0.0.1:11434",
    ))
    service = ModelDiscoveryService(
        database,
        adapter_factory=lambda provider_type, base_url: OllamaAdapter(base_url, client=client),
        ollama_client_factory=lambda **kwargs: httpx.Client(
            transport=httpx.MockTransport(respond), **kwargs,
        ),
    )

    service.discover_catalog(provider.id)
    result = service.verify_model(provider.id, "qwen3:1.7b")

    assert result.provider.status == "connected"
    assert result.model.qualification_status == "transient_error"
    assert result.model.qualification_error_code == "verification_timeout"
    assert result.model.qualification_message == "Verification timed out"
    assert "sensitive host" not in result.model.model_dump_json()


def test_duplicate_model_verification_returns_in_progress_without_generation(database) -> None:
    generation_calls = 0

    def respond(request: httpx.Request) -> httpx.Response:
        nonlocal generation_calls
        if request.url.path == "/api/tags":
            return httpx.Response(200, json={"models": [{"name": "qwen3:1.7b"}]})
        generation_calls += 1
        return httpx.Response(200, json={"model": "qwen3:1.7b", "response": "OK"})

    client = httpx.Client(transport=httpx.MockTransport(respond))
    provider = ProviderService(database).create(ProviderCreate(
        name="Qwen Ollama", provider_type="ollama", base_url="http://127.0.0.1:11434",
    ))
    service = ModelDiscoveryService(
        database,
        adapter_factory=lambda provider_type, base_url: OllamaAdapter(base_url, client=client),
        ollama_client_factory=lambda **kwargs: httpx.Client(
            transport=httpx.MockTransport(respond), **kwargs,
        ),
    )
    service.discover_catalog(provider.id)
    connection = ProviderService(database).get_model(provider.id)
    connection.models[0].qualification_status = "verifying"
    connection.models[0].qualification_message = "Verification in progress"
    database.commit()

    result = service.verify_model(provider.id, "qwen3:1.7b")

    assert result.model.qualification_status == "verifying"
    assert result.model.qualification_message == "Verification in progress"
    assert generation_calls == 0


def test_discovery_failure_does_not_mark_connected_provider_as_failed(database) -> None:
    calls = 0

    def respond(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(200, json={"models": [{"name": "qwen3:1.7b"}]})
        return httpx.Response(503, json={"error": "private upstream diagnostic"})

    client = httpx.Client(transport=httpx.MockTransport(respond))
    provider = ProviderService(database).create(ProviderCreate(
        name="Qwen Ollama", provider_type="ollama", base_url="http://ollama.test:11434",
    ))
    service = ModelDiscoveryService(
        database,
        adapter_factory=lambda provider_type, base_url: OllamaAdapter(base_url, client=client),
    )

    assert service.test_connection(provider.id).status == "connected"
    with pytest.raises(ProviderOperationError, match="model discovery failed \\(server returned HTTP 503\\)"):
        service.discover_catalog(provider.id)

    stored = ProviderService(database).get(provider.id)
    assert stored.status == "connected"
    assert stored.last_error is None


def test_provider_test_surfaces_only_safe_http_failure_category(database) -> None:
    client = httpx.Client(transport=httpx.MockTransport(
        lambda request: (_ for _ in ()).throw(httpx.ProxyError(
            "must not be shown", request=request,
        )),
    ))
    provider = ProviderService(database).create(ProviderCreate(
        name="Local Ollama", provider_type="ollama",
        base_url="http://127.0.0.1:11434",
    ))
    service = ModelDiscoveryService(
        database,
        adapter_factory=lambda provider_type, base_url: OllamaAdapter(base_url, client=client),
    )

    with pytest.raises(ProviderOperationError, match="Ollama connection test failed \\(proxy connection failed\\)") as failure:
        service.test_connection(provider.id)

    assert "must not be shown" not in str(failure.value)
    stored = ProviderService(database).get(provider.id)
    assert stored.status == "error"
    assert stored.last_error == "Ollama connection test failed (proxy connection failed)"


@pytest.mark.parametrize(("base_url", "expected_trust_env"), (
    ("http://127.0.0.1:11434", False),
    ("https://ollama.example.test", True),
))
def test_ollama_generation_client_proxy_policy(base_url, expected_trust_env) -> None:
    connection = ProviderConnection(
        name="Local Ollama", provider_type="ollama",
        base_url=base_url,
    )

    provider = create_generation_provider(connection, "gemma4:e4b", None)
    try:
        assert provider._client._client._trust_env is expected_trust_env
    finally:
        provider._client.close()


@pytest.mark.parametrize(("provider_type", "expected_type"), (
    ("groq", GroqProvider), ("openrouter", OpenRouterProvider),
    ("cerebras", CerebrasProvider),
    ("openai_compatible", OpenAICompatibleProvider),
))
def test_phase8a_provider_types_resolve_to_core_adapters(
    database, provider_type, expected_type,
) -> None:
    secret = create_secret(database)
    base_url = "https://compatible.example/v1" if provider_type == "openai_compatible" else None
    created = ProviderService(database).create(ProviderCreate(
        name=provider_type, provider_type=provider_type,
        secret_id=secret.id, base_url=base_url,
    ))
    connection = database.get(ProviderConnection, created.id)
    provider = create_generation_provider(connection, "exact-model-id", "fixture-secret")
    assert isinstance(provider, expected_type)
    assert provider.config.model == "exact-model-id"


def test_secret_in_use_cannot_be_deleted(database) -> None:
    secret = create_secret(database)
    create_openai_provider(database, secret.id)

    with pytest.raises(ResourceConflictError, match="provider connection"):
        SecretService(database).delete(secret.id)


def test_provider_test_failure_is_handled_without_leaking_credentials(database) -> None:
    secret_value = "sk-must-not-leak-from-errors"
    secret = create_secret(database, secret_value)
    provider = create_openai_provider(database, secret.id)

    class FailingAdapter(ProviderAdapter):
        def discover_models(self, credential):
            raise ProviderDiscoveryError(f"failed with {credential}")

    service = ModelDiscoveryService(
        database,
        adapter_factory=lambda provider_type, base_url: FailingAdapter(),
    )

    with pytest.raises(ProviderOperationError) as failure:
        service.test_connection(provider.id)

    assert str(failure.value) == "OpenAI connection test failed"
    assert secret_value not in str(failure.value)
    stored = ProviderService(database).get(provider.id)
    assert stored.status == "error"
    assert secret_value not in stored.model_dump_json()


def test_model_discovery_stores_and_returns_models(database) -> None:
    secret = create_secret(database)
    provider = create_openai_provider(database, secret.id)

    class CatalogAdapter(ProviderAdapter):
        def discover_models(self, credential):
            assert credential == "sk-super-secret-9X2A"
            return (
                DiscoveredModel("model-z", "Model Z", {"owned_by": "test"}),
                DiscoveredModel("model-a"),
            )

    service = ModelDiscoveryService(
        database,
        adapter_factory=lambda provider_type, base_url: CatalogAdapter(),
        generation_factory=lambda connection, model_id, credential, provider_name: type(
            "WorkingProvider", (),
            {"generate": lambda self, request: ProviderResponse(
                content="OK", model=model_id, provider=provider_name or "test",
            )},
        )(),
    )
    result = service.discover_models(provider.id)

    assert result.provider.status == "connected"
    assert result.provider.models_count == 2
    assert [model.model_id for model in result.models] == ["model-a", "model-z"]
    assert result.models[1].metadata == {"owned_by": "test"}

    stored = ProviderService(database).models(provider.id)
    assert stored == result.models


def test_gemini_2_native_id_is_preserved_and_qualified_by_real_generation_contract(database) -> None:
    secret = create_secret(database)
    provider = ProviderService(database).create(ProviderCreate(
        name="Gemini", provider_type="gemini", secret_id=secret.id,
    ))
    captured: list[str] = []

    class CatalogAdapter(ProviderAdapter):
        def discover_models(self, credential):
            return (DiscoveredModel("models/gemini-2.5-flash", "Gemini 2.5 Flash"),)

    class WorkingProvider:
        def generate(self, request):
            captured.append(request.model or "")
            return ProviderResponse(content="OK", provider="Gemini", model=request.model)

    result = ModelDiscoveryService(
        database,
        adapter_factory=lambda provider_type, base_url: CatalogAdapter(),
        generation_factory=lambda connection, model_id, credential, provider_name: (
            captured.append(model_id) or WorkingProvider()
        ),
    ).discover_models(provider.id)

    assert result.summary.usable_count == 1
    assert result.models[0].model_id == "models/gemini-2.5-flash"
    assert result.models[0].qualification_status == "qualified"
    assert captured[0] == "models/gemini-2.5-flash"
    assert runtime_model_id("gemini", "models/gemini-2.5-flash") == "models/gemini-2.5-flash"


def test_failed_qualification_is_sanitized_and_excluded_from_normal_models(database) -> None:
    secret_value = "sk-never-persist-this"
    secret = create_secret(database, secret_value)
    provider = create_openai_provider(database, secret.id)

    class CatalogAdapter(ProviderAdapter):
        def discover_models(self, credential):
            return (DiscoveredModel("embedding-or-denied"),)

    class DeniedProvider:
        def generate(self, request):
            raise RuntimeError(f"denied using {secret_value}")

    result = ModelDiscoveryService(
        database,
        adapter_factory=lambda provider_type, base_url: CatalogAdapter(),
        generation_factory=lambda connection, model_id, credential, provider_name: DeniedProvider(),
    ).discover_models(provider.id)

    assert result.summary.usable_count == 0
    assert result.models[0].qualification_status == "unavailable"
    assert secret_value not in result.models[0].model_dump_json()
    assert ProviderService(database).models(provider.id) == []
    assert len(ProviderService(database).models(provider.id, include_unusable=True)) == 1


def test_delete_provider_cascades_related_models(database) -> None:
    provider = ProviderService(database).create(ProviderCreate(
        name="Local",
        provider_type="ollama",
    ))

    class CatalogAdapter(ProviderAdapter):
        def discover_models(self, credential):
            return (DiscoveredModel("local-model"),)

    ModelDiscoveryService(
        database,
        adapter_factory=lambda provider_type, base_url: CatalogAdapter(),
        ollama_client_factory=lambda **kwargs: httpx.Client(
            transport=httpx.MockTransport(
                lambda request: httpx.Response(200, json={"response": "OK"}),
            ),
            **kwargs,
        ),
    ).discover_models(provider.id)

    ProviderService(database).delete(provider.id)

    count = database.scalar(select(func.count()).select_from(ProviderModel))
    assert count == 0


def test_validation_error_response_does_not_echo_credentials() -> None:
    credential = "raw-key-that-must-not-appear"
    try:
        SecretCreate(name="", secret_type="api_key", value=credential)
    except ValidationError as exc:
        request_error = RequestValidationError(exc.errors())
    else:  # pragma: no cover - the invalid name must always fail
        raise AssertionError("Expected request validation to fail")

    response = asyncio.run(handle_validation_error(None, request_error))
    body = response.body.decode("utf-8")

    assert response.status_code == 422
    assert credential not in body
    assert '"input"' not in body


def test_provider_type_contract_covers_current_core_adapters():
    assert {kind.value for kind in ProviderType} == {
        "openai", "gemini", "ollama", "groq", "openrouter", "cerebras",
        "openai_compatible",
    }
