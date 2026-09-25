"""Regression coverage for resource persistence across request-like sessions."""

import json

import pytest
from agenttree.providers import ProviderResponse
from cryptography.fernet import Fernet
from sqlalchemy import func, select

from backend.models.provider import ProviderModel
from backend.models.secret import Secret
from backend.providers.base import DiscoveredModel, ProviderAdapter
from backend.schemas.provider import ProviderCreate
from backend.schemas.secret import SecretCreate
from backend.schemas.tool import ToolCreate
from backend.services.errors import ResourceConflictError, ServiceConfigurationError
from backend.services.model_discovery_service import ModelDiscoveryService
from backend.services.provider_service import ProviderService
from backend.services.secret_service import SecretService
from backend.services.tool_service import ToolService


class CatalogAdapter(ProviderAdapter):
    def discover_models(self, credential):
        assert credential == "persistent-secret-value"
        return (DiscoveredModel("persistent-model", "Persistent Model"),)


class WorkingProvider:
    def generate(self, request):
        return ProviderResponse(content="OK", model=request.model, provider="test")


def test_resources_survive_new_sessions_and_disappear_only_after_delete(database_factory) -> None:
    with database_factory() as create_session:
        secret = SecretService(create_session).create(SecretCreate(
            name="Persistent Secret", secret_type="api_key", value="persistent-secret-value",
        ))
        provider = ProviderService(create_session).create(ProviderCreate(
            name="Persistent Provider", provider_type="openai", secret_id=secret.id,
        ))
        discovery = ModelDiscoveryService(
            create_session,
            adapter_factory=lambda provider_type, base_url: CatalogAdapter(),
            generation_factory=lambda connection, model_id, credential, provider_name: WorkingProvider(),
        ).discover_models(provider.id)
        tool = ToolService(create_session).create(ToolCreate.model_validate({
            "name": "Persistent Tool",
            "tool_type": "http_api",
            "configuration": {
                "method": "GET",
                "url": "https://example.test/status",
                "headers": {},
                "query": {},
                "input_schema": {"type": "object", "properties": {}},
                "output_handling": "json",
                "timeout": 5,
                "test_arguments": {},
            },
        }))
        secret_id, provider_id, tool_id = secret.id, provider.id, tool.id
        assert discovery.models[0].qualification_status.value == "qualified"

    with database_factory() as reload_session:
        secrets = SecretService(reload_session).list()
        providers = ProviderService(reload_session).list()
        models = ProviderService(reload_session).models(provider_id, include_unusable=True)
        tools = ToolService(reload_session).list()

        assert [item.id for item in secrets] == [secret_id]
        assert secrets[0].masked_value == SecretService.MASKED_VALUE
        assert "persistent-secret-value" not in json.dumps(secrets[0].model_dump(mode="json"))
        assert [item.id for item in providers] == [provider_id]
        assert providers[0].secret_id == secret_id
        assert [item.model_id for item in models] == ["persistent-model"]
        assert models[0].qualification_status.value == "qualified"
        assert [item.id for item in tools] == [tool_id]
        assert tools[0].assigned_agents_count == 0

        ToolService(reload_session).delete(tool_id)
        ProviderService(reload_session).delete(provider_id)
        SecretService(reload_session).delete(secret_id)

    with database_factory() as final_session:
        assert SecretService(final_session).list() == []
        assert ProviderService(final_session).list() == []
        assert ToolService(final_session).list() == []
        assert final_session.scalar(select(func.count()).select_from(ProviderModel)) == 0


def test_secret_metadata_list_does_not_require_the_original_encryption_key(
    database_factory, monkeypatch: pytest.MonkeyPatch,
) -> None:
    original_key = Fernet.generate_key().decode("utf-8")
    monkeypatch.setenv("AGENTTREE_STUDIO_ENCRYPTION_KEY", original_key)
    with database_factory() as create_session:
        created = SecretService(create_session).create(SecretCreate(
            name="Rotated Key Secret", secret_type="api_key", value="never-return-me",
        ))

    monkeypatch.setenv("AGENTTREE_STUDIO_ENCRYPTION_KEY", Fernet.generate_key().decode("utf-8"))
    with database_factory() as reload_session:
        listed = SecretService(reload_session).list()
        assert [item.id for item in listed] == [created.id]
        assert listed[0].masked_value == SecretService.MASKED_VALUE
        assert "never-return-me" not in listed[0].model_dump_json()
        with pytest.raises(ServiceConfigurationError, match="cannot be decrypted"):
            SecretService(reload_session).reveal(created.id)


def test_duplicate_secret_names_are_rejected_case_insensitively(database) -> None:
    service = SecretService(database)
    service.create(SecretCreate(name="Provider Key", secret_type="api_key", value="first"))

    with pytest.raises(ResourceConflictError, match="already exists"):
        service.create(SecretCreate(name="  provider key  ", secret_type="api_key", value="second"))

    assert database.scalar(select(func.count()).select_from(Secret)) == 1
