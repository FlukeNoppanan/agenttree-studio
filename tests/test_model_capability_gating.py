"""Role evidence must agree at draft validation and real runtime submission."""
import json

import pytest
from agenttree.providers import ProviderResponse
from agenttree.providers.exceptions import MalformedProviderResponseError
from backend.models.provider import ProviderModel
from backend.services.model_capabilities import supports_agent_role
from backend.services.model_discovery_service import ModelDiscoveryService
from backend.services.model_qualification import qualify_decisions
from backend.services.runtime_builder import RuntimeBuilder
from backend.services.tree_service import TreeService
from qualification_fixture import QUALIFIED_METADATA
from test_structured_model_qualification import ProbeProvider
from test_trees import connected_provider, valid_payload


@pytest.mark.parametrize("role", ["root", "manager", "specialist"])
def test_qualified_and_pending_gating(role):
    model = ProviderModel(is_available=True, generation_candidate=True,
                          qualification_status="qualified", metadata_json=QUALIFIED_METADATA)
    assert supports_agent_role(model, role)
    model.qualification_status = "transient_error"
    assert not supports_agent_role(model, role)
    model.qualification_status = "qualified"
    model.is_available = False
    assert not supports_agent_role(model, role)


def test_limited_roles_use_contracts_not_global_status_or_claimed_roles():
    evidence = json.loads(QUALIFIED_METADATA)
    evidence["agenttree_qualification"]["checks"]["decomposition"]["status"] = "failed"
    model = ProviderModel(is_available=True, generation_candidate=True,
                          qualification_status="limited", metadata_json=json.dumps(evidence))
    assert supports_agent_role(model, "specialist")
    assert supports_agent_role(model, "root")
    assert not supports_agent_role(model, "manager")


def test_legacy_generation_proves_only_specialist():
    model = ProviderModel(is_available=True, generation_candidate=True, qualification_status="qualified")
    assert supports_agent_role(model, "specialist")
    assert not supports_agent_role(model, "root")


def test_both_tree_validation_and_runtime_reject_unproven_role(database):
    provider = connected_provider(database)
    tree = TreeService(database).create(valid_payload(provider))
    model = database.query(ProviderModel).filter_by(provider_connection_id=provider.id).one()
    evidence = json.loads(QUALIFIED_METADATA)
    evidence["agenttree_qualification"]["checks"]["triage"]["status"] = "failed"
    model.qualification_status = "limited"
    model.metadata_json = json.dumps(evidence)
    database.commit()
    validation = TreeService(database).validate(tree.id)
    assert [issue.code for issue in validation.errors] == ["model_role_not_qualified"]
    runtime = RuntimeBuilder(database).validate_tree(RuntimeBuilder(database).get_tree(tree.id))
    assert [issue.code for issue in runtime.errors] == ["MODEL_ROLE_NOT_QUALIFIED"]


def test_resume_skips_completed_probes_and_diagnostics_do_not_contain_output():
    initial = qualify_decisions(ProbeProvider())
    initial["checks"]["final_review"] = {"status": "interrupted", "reason_code": "provider_rate_limited"}
    provider = ProbeProvider()
    resumed = qualify_decisions(provider, previous=initial)
    assert len(provider.requests) == 1
    assert provider.requests[0].metadata["strategy"] == "final_review"
    assert resumed["roles"]["root"] == "passed"
    assert resumed["checks"]["triage"] == initial["checks"]["triage"]
    diagnostic = resumed["checks"]["final_review"]["diagnostics"]
    assert diagnostic["validation"] == "passed"
    assert diagnostic["requests"][0]["response_received"] is True
    assert "Compare options" not in json.dumps(diagnostic)


def test_delegation_probe_uses_real_deep_contract_without_inventing_success():
    provider = ProbeProvider()
    qualify_decisions(provider)
    planning = next(request for request in provider.requests if request.metadata.get("strategy") == "root_planning")
    assert planning.context["task"]["execution_mode"] == "deep"
    assert "Deep mode requires delegation" in planning.system_prompt


def test_generation_budget_retry_requires_proven_truncation(database):
    provider = connected_provider(database)
    calls = []
    class Generator:
        def generate(self, request):
            calls.append(request)
            if len(calls) == 1:
                error = MalformedProviderResponseError("no final")
                error.diagnostics = {"response_received": True, "finish_reason": "length", "final_content_present": False}
                raise error
            return ProviderResponse("OK", "synthetic")
    provider.provider_type = "groq"
    service = ModelDiscoveryService(database, generation_factory=lambda *_: Generator())
    service._verify_generation(provider, "native")
    assert [request.max_tokens for request in calls] == [64, 2048]
    assert all(request.metadata["purpose"] == "studio_model_qualification" for request in calls)


def test_catalog_uses_capability_metadata_not_model_names():
    import httpx
    from backend.providers.openai import OpenAIAdapter
    client = httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(200, json={"data": [
        {"id": "arbitrary-a", "capabilities": {"chat": False}},
        {"id": "arbitrary-b", "output_modalities": ["audio"]},
        {"id": "guard-word-is-not-proof", "output_modalities": ["text"]},
        {"id": "unknown-metadata"},
    ]})))
    with client:
        models = OpenAIAdapter(client=client).discover_models("synthetic-test-token")
    assert [model.generation_candidate for model in models] == [False, False, True, True]
