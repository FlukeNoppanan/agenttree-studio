"""Temporary provider failures must not become permanent model capability claims."""
import pytest
import httpx
from agenttree.providers import ProviderResponse
from agenttree.providers.exceptions import (
    MalformedProviderResponseError, ProviderAuthenticationError,
    ProviderInvalidRequestError, ProviderModelNotFoundError, ProviderRateLimitError,
    ProviderRuntimeError, ProviderTimeoutError, ProviderUnavailableError,
)
from backend.providers.base import DiscoveredModel, ProviderAdapter
from backend.schemas.provider import ProviderCreate
from backend.services.model_discovery_service import ModelDiscoveryService, _qualification_failure
from backend.services.provider_service import ProviderService
from backend.services.secret_service import SecretService
from backend.schemas.secret import SecretCreate

@pytest.mark.parametrize("error,status,code", [
    (ProviderRateLimitError("sensitive upstream text"), "transient_error", "provider_rate_limited"),
    (ProviderAuthenticationError("secret"), "transient_error", "provider_auth_failed"),
    (ProviderUnavailableError("secret"), "transient_error", "provider_unavailable"),
    (ProviderTimeoutError("secret"), "transient_error", "verification_timeout"),
    (ProviderRuntimeError("secret"), "transient_error", "generation_failed"),
    (ProviderModelNotFoundError("secret"), "unavailable", "model_unavailable"),
    (ProviderInvalidRequestError("secret"), "unavailable", "incompatible_response"),
    (MalformedProviderResponseError("secret"), "unavailable", "incompatible_response"),
])
def test_typed_failures_are_safe_and_correct(error, status, code):
    outer = RuntimeError("wrapper")
    outer.__cause__ = error
    classified = _qualification_failure(outer)
    assert classified[:2] == (status, code)
    assert "secret" not in classified[2] and "sensitive" not in classified[2]

@pytest.mark.parametrize("status,code", [(429, "provider_rate_limited"), (401, "provider_auth_failed"), (403, "provider_auth_failed"), (503, "provider_unavailable"), (408, "verification_timeout"), (504, "verification_timeout")])
def test_direct_http_verification_errors_remain_transient(status, code):
    response = httpx.Response(status, request=httpx.Request("POST", "https://provider.invalid/generate"))
    with pytest.raises(httpx.HTTPStatusError) as caught:
        response.raise_for_status()
    assert _qualification_failure(caught.value)[:2] == ("transient_error", code)

def test_rate_limit_pauses_bulk_qualification_and_later_success_restores_model(database):
    secret = SecretService(database).create(SecretCreate(name="Qualification key", secret_type="api_key", value="test-credential"))
    provider = ProviderService(database).create(ProviderCreate(name="Test Provider", provider_type="openai", secret_id=secret.id))
    calls = []
    class Catalog(ProviderAdapter):
        def discover_models(self, credential):
            return (DiscoveredModel("first"), DiscoveredModel("second"))
    class Limited:
        def generate(self, request):
            calls.append(request)
            raise ProviderRateLimitError("unsafe quota response")
    service = ModelDiscoveryService(database, adapter_factory=lambda *_: Catalog(), generation_factory=lambda *_: Limited())
    result = service.discover_models(provider.id)
    assert len(calls) == 1
    assert [m.qualification_status for m in result.models] == ["transient_error", "unknown"]
    assert ProviderService(database).models(provider.id) == []
    assert len(ProviderService(database).models(provider.id, include_unusable=True)) == 2
    class Working:
        def generate(self, request):
            return ProviderResponse(content="OK", provider="Test Provider")
    recovered = ModelDiscoveryService(database, generation_factory=lambda *_: Working()).verify_model(provider.id, "first")
    assert recovered.model.qualification_status == "qualified"
    assert recovered.model.qualification_error_code is None
    assert [m.model_id for m in ProviderService(database).models(provider.id)] == ["first"]
