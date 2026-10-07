"""Compatibility claims must use real strategy validators, not OK alone."""
import json

from agenttree.providers import BaseProvider, ProviderConfig, ProviderResponse
from backend.services.model_qualification import qualify_decisions


def decision_reply(strategy=None):
    return json.dumps({"probe": "agenttree", "delegate": True, "objective": "Compare options", "required_capabilities": ["comparison"], "subtasks": [{"objective": "Compare options", "required_capabilities": ["comparison"]}], "decision": "pass", "feedback": "Comparison is complete"})


class ProbeProvider(BaseProvider):
    def __init__(self, fail=None):
        super().__init__(ProviderConfig("synthetic", model="native-test-id"))
        self.fail = fail
        self.requests = []

    def generate(self, request):
        self.requests.append(request)
        return ProviderResponse("OK" if self.fail == "all" or (self.fail is not None and request.metadata.get("strategy") == self.fail) else decision_reply(), self.name)


def test_generation_only_does_not_qualify_any_orchestration_role():
    provider = ProbeProvider("all")
    evidence = qualify_decisions(provider)
    assert evidence["generation"] == "passed"
    assert evidence["roles"] == {"root": "not_qualified", "manager": "not_qualified", "specialist": "passed"}
    assert evidence["checks"]["final_review"]["status"] == "failed"
    assert len(provider.requests) == 11  # five bounded repairs + plain JSON check


def test_all_actual_strategy_contracts_qualify_and_leave_tool_capability_unknown():
    evidence = qualify_decisions(ProbeProvider())
    assert len(evidence["checks"]) == 6
    assert all(item["status"] == "passed" for item in evidence["checks"].values())
    assert evidence["roles"] == {"root": "passed", "manager": "passed", "specialist": "passed"}
    assert evidence["tool_calling"] == "not_tested"


def test_qualification_accepts_shared_normalizer_wrapped_or_native_structured_probe():
    class WrappedProbe(ProbeProvider):
        def generate(self, request):
            self.requests.append(request)
            if '"probe":"agenttree"' in request.prompt:
                return ProviderResponse('{"content":{"probe":"agenttree"}}', self.name)
            return ProviderResponse(decision_reply(), self.name)

    evidence = qualify_decisions(WrappedProbe())
    assert evidence["checks"]["structured_output"]["status"] == "passed"
    assert evidence["roles"]["root"] == "passed"


def test_qualification_prefers_native_structured_content():
    class NativeProbe(ProbeProvider):
        def generate(self, request):
            self.requests.append(request)
            if '"probe":"agenttree"' in request.prompt:
                return ProviderResponse("", self.name, structured_content={"probe": "agenttree"})
            return ProviderResponse(decision_reply(), self.name)

    evidence = qualify_decisions(NativeProbe())
    assert evidence["checks"]["structured_output"]["status"] == "passed"


def test_qualification_still_rejects_incomplete_probe_contract():
    class IncompleteProbe(ProbeProvider):
        def generate(self, request):
            self.requests.append(request)
            if '"probe":"agenttree"' in request.prompt:
                return ProviderResponse('{"content":{"other":"agenttree"}}', self.name)
            return ProviderResponse(decision_reply(), self.name)

    evidence = qualify_decisions(IncompleteProbe())
    assert evidence["checks"]["structured_output"]["status"] == "failed"


def test_provider_compatibility_is_not_model_name_specific():
    from backend.providers.generation import provider_supports_tool_calling
    assert provider_supports_tool_calling("ollama") is False
    assert provider_supports_tool_calling("openai_compatible") is True
    assert provider_supports_tool_calling("future_unknown_adapter") is False


def test_final_review_failure_keeps_manager_evidence_but_not_root():
    evidence = qualify_decisions(ProbeProvider("final_review"))
    assert evidence["roles"]["root"] == "not_qualified"
    assert evidence["roles"]["manager"] == "passed"
    assert evidence["checks"]["final_review"]["reason_code"] == "malformed_json"


def test_qualification_interruptions_are_not_permanent_capability_failures():
    from agenttree.providers.exceptions import ProviderRateLimitError
    provider = ProbeProvider()
    def unavailable(request):
        provider.requests.append(request)
        raise ProviderRateLimitError("sensitive upstream diagnostic")
    provider.generate = unavailable
    evidence = qualify_decisions(provider)
    assert len(provider.requests) == 1
    assert evidence["checks"]["structured_output"]["status"] == "interrupted"
    assert evidence["checks"]["structured_output"]["reason_code"] == "provider_rate_limited"
    assert evidence["checks"]["structured_output"]["failure_scope"] == "provider"
    assert "sensitive" not in json.dumps(evidence)


def test_legacy_generation_status_is_not_presented_as_agenttree_ready(database):
    from backend.models.provider import ProviderModel
    from backend.services.provider_service import ProviderService
    model = ProviderModel(model_id="old", qualification_status="qualified")
    assert ProviderService.model_status(model) == "limited"
    model.metadata_json = json.dumps({"agenttree_qualification": qualify_decisions(ProbeProvider())})
    assert ProviderService.model_status(model) == "qualified"


def test_interrupted_reverification_preserves_prior_proof_and_catalog_metadata(database):
    from backend.models.provider import ProviderConnection, ProviderModel
    from backend.services.model_discovery_service import ModelDiscoveryService
    from agenttree.providers.exceptions import ProviderUnavailableError
    connection = ProviderConnection(name="Synthetic", provider_type="openai", status="connected")
    database.add(connection)
    database.flush()
    model = ProviderModel(provider_connection_id=connection.id, model_id="synthetic", is_available=True,
                          generation_candidate=True, qualification_status="qualified",
                          metadata_json=json.dumps({"catalog": "preserved", "agenttree_qualification": qualify_decisions(ProbeProvider())}))
    database.add(model)
    database.commit()
    class Unavailable:
        def generate(self, request):
            raise ProviderUnavailableError("unsafe response")
    result = ModelDiscoveryService(database, generation_factory=lambda *_: Unavailable()).verify_model(connection.id, model.model_id)
    assert result.model.qualification_status == "qualified"
    assert result.model.metadata["catalog"] == "preserved"
    assert result.model.metadata["agenttree_qualification"] == qualify_decisions(ProbeProvider())
    assert result.model.metadata["qualification_attempt"]["status"] == "pending"


def test_dashboard_ready_count_uses_current_decision_evidence(database):
    from backend.models.provider import ProviderConnection, ProviderModel
    from backend.services.dashboard_service import DashboardService
    connection = ProviderConnection(name="Synthetic", provider_type="ollama", status="connected")
    database.add(connection)
    database.flush()
    model = ProviderModel(provider_connection_id=connection.id, model_id="old", is_available=True,
                          generation_candidate=True, qualification_status="qualified")
    database.add(model)
    database.commit()
    assert DashboardService(database).summary().metrics.providers.usable_models == 0
    model.metadata_json = json.dumps({"agenttree_qualification": qualify_decisions(ProbeProvider())})
    database.commit()
    summary = DashboardService(database).summary()
    assert summary.metrics.providers.usable_models == 1
    assert summary.providers[0].usable_models == 1
    model.qualification_status = "limited"
    database.commit()
    assert DashboardService(database).summary().metrics.providers.usable_models == 0


def test_incomplete_or_failed_evidence_cannot_masquerade_as_ready(database):
    from backend.models.provider import ProviderModel
    from backend.services.provider_service import ProviderService
    for evidence in [{"version": 1}, qualify_decisions(ProbeProvider("final_review"))]:
        model = ProviderModel(model_id="synthetic", qualification_status="qualified", metadata_json=json.dumps({"agenttree_qualification": evidence}))
        assert ProviderService.model_status(model) == "limited"
