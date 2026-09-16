"""Capability normalization, catalog, and safe AI suggestion behavior."""

import pytest
from agenttree.providers import BaseProvider, ProviderConfig, ProviderRequest, ProviderResponse
from sqlalchemy import select

from backend.core.capabilities import normalize_capabilities, normalize_capability
from backend.models.provider import ProviderConnection, ProviderModel
from backend.models.tree import AgentConfig, Tree, TreeVersion
from backend.schemas.capability import CapabilitySuggestionRequest
from backend.schemas.secret import SecretCreate
from backend.services.capability_service import CapabilityCatalogService, CapabilitySuggestionService
from backend.services.errors import ProviderOperationError, ServiceError
from backend.services.secret_service import SecretService


class StaticProvider(BaseProvider):
    def __init__(self, content: str) -> None:
        super().__init__(ProviderConfig(provider_name="test", model="test-model"))
        self.content = content
        self.requests: list[ProviderRequest] = []

    def generate(self, request: ProviderRequest) -> ProviderResponse:
        self.requests.append(request)
        return ProviderResponse(content=self.content, provider=self.name, model="test-model")


def provider_with_model(database, *, status: str = "connected", secret_id: str | None = None):
    provider = ProviderConnection(
        name="Suggestion Provider",
        provider_type="ollama" if secret_id is None else "openai",
        base_url="http://localhost:11434" if secret_id is None else None,
        secret_id=secret_id,
        status=status,
    )
    database.add(provider)
    database.flush()
    database.add(ProviderModel(
        provider_connection_id=provider.id,
        model_id="test-model",
        is_available=True,
    ))
    database.commit()
    return provider


def suggestion_request(provider: ProviderConnection, model_id: str = "test-model"):
    return CapabilitySuggestionRequest(
        agent_type="specialist",
        name="Network Analyst",
        description="Analyze network logs and identify connectivity and routing problems.",
        system_instruction=None,
        provider_connection_id=provider.id,
        model_id=model_id,
    )


def add_catalog_agents(database) -> AgentConfig:
    tree = Tree(name="Catalog Tree", status="draft")
    database.add(tree)
    database.flush()
    version = TreeVersion(tree=tree, version_number=1, status="draft")
    database.add(version)
    database.flush()
    tree.current_version = version
    first = AgentConfig(
        tree_version=version,
        agent_type="root",
        name="First",
        capabilities_json=["Network Analysis", "network_analysis", "log-analysis"],
    )
    second = AgentConfig(
        tree_version=version,
        agent_type="manager",
        name="Second",
        capabilities_json=["network-analysis", "incident_response"],
    )
    database.add_all([first, second])
    database.commit()
    return first


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("Network Analysis", "network-analysis"),
        (" network_analysis ", "network-analysis"),
        ("Log---Analysis", "log-analysis"),
        ("Incident / Response", "incident-response"),
    ],
)
def test_capability_normalization(value: str, expected: str) -> None:
    assert normalize_capability(value) == expected


def test_capability_normalization_prevents_duplicates_and_rejects_empty() -> None:
    assert normalize_capabilities([
        "Network Analysis", "network_analysis", " network-analysis ", "Log Analysis", "",
    ]) == ["network-analysis", "log-analysis"]
    with pytest.raises(ValueError, match="empty"):
        normalize_capability(" __ ")


def test_capability_catalog_aggregates_usage_and_searches(database) -> None:
    add_catalog_agents(database)
    service = CapabilityCatalogService(database)

    catalog = service.search()
    network = next(item for item in catalog if item.id == "network-analysis")

    assert network.label == "Network Analysis"
    assert network.usage_count == 2
    assert [item.id for item in service.search("incident")] == ["incident-response"]
    assert service.search("document") == []


def test_ai_suggestion_returns_sanitized_structured_response(database) -> None:
    provider = provider_with_model(database)
    fake = StaticProvider("""```json
        {"suggestions": [
          {"id": "Network Analysis", "label": "Network Analysis", "reason": "Analyzes connectivity."},
          {"id": "network_analysis", "label": "Duplicate", "reason": "Overlaps."},
          {"id": "routing_analysis", "label": "Routing Analysis", "reason": "Inspects routes."}
        ]}
    ```""")
    service = CapabilitySuggestionService(
        database,
        provider_factory=lambda connection, model, credential: fake,
    )

    response = service.suggest(suggestion_request(provider))

    assert [item.id for item in response.suggestions] == ["network-analysis", "routing-analysis"]
    assert fake.requests[0].metadata == {"studio_operation": "capability_suggestion"}
    assert "Description (primary signal)" in fake.requests[0].prompt
    assert "network-analysis" not in fake.requests[0].prompt.split("Description (primary signal):", 1)[1].splitlines()[0]


def test_malformed_ai_response_is_handled_safely(database) -> None:
    provider = provider_with_model(database)
    service = CapabilitySuggestionService(
        database,
        provider_factory=lambda connection, model, credential: StaticProvider("not json"),
    )

    with pytest.raises(ProviderOperationError, match="malformed structured data"):
        service.suggest(suggestion_request(provider))


def test_unavailable_provider_and_invalid_model_are_rejected(database) -> None:
    unavailable = provider_with_model(database, status="error")
    with pytest.raises(ServiceError, match="unavailable"):
        CapabilitySuggestionService(database).suggest(suggestion_request(unavailable))

    available = provider_with_model(database)
    with pytest.raises(ServiceError, match="model is not available"):
        CapabilitySuggestionService(database).suggest(suggestion_request(available, "invented-model"))


def test_provider_failure_never_leaks_decrypted_secret(database) -> None:
    raw_secret = "sk-capability-secret-must-not-leak"
    secret = SecretService(database).create(SecretCreate(
        name="Suggestion key",
        secret_type="api_key",
        value=raw_secret,
    ))
    provider = provider_with_model(database, secret_id=secret.id)

    class FailingProvider(StaticProvider):
        def generate(self, request: ProviderRequest) -> ProviderResponse:
            raise RuntimeError(f"provider rejected {raw_secret}")

    service = CapabilitySuggestionService(
        database,
        provider_factory=lambda connection, model, credential: (
            FailingProvider("") if credential == raw_secret else None
        ),
    )

    with pytest.raises(ProviderOperationError) as failure:
        service.suggest(suggestion_request(provider))

    assert str(failure.value) == "Capability suggestion provider request failed"
    assert raw_secret not in str(failure.value)


def test_suggestions_do_not_automatically_persist(database) -> None:
    agent = add_catalog_agents(database)
    original = list(agent.capabilities_json)
    provider = provider_with_model(database)
    fake = StaticProvider(
        '{"suggestions":[{"id":"new-capability","label":"New Capability",'
        '"reason":"A newly suggested ability."}]}',
    )

    response = CapabilitySuggestionService(
        database,
        provider_factory=lambda connection, model, credential: fake,
    ).suggest(suggestion_request(provider))
    database.expire_all()
    stored = database.scalar(select(AgentConfig).where(AgentConfig.id == agent.id))

    assert response.suggestions[0].id == "new-capability"
    assert stored.capabilities_json == original
