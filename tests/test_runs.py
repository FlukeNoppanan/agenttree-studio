"""Core-backed runtime construction, execution, persistence, and safety."""

import json
from uuid import uuid4

import pytest
from agenttree import ManagerAgent, RootAgent, SpecialistAgent
from agenttree.providers import BaseProvider, ProviderConfig, ProviderRequest, ProviderResponse
from sqlalchemy import func, select

from backend.models.provider import ProviderConnection, ProviderModel
from backend.models.run import Run, TraceEvent
from backend.models.tree import AgentConfig
from backend.schemas.run import TestRunRequest as RunRequest
from backend.schemas.secret import SecretCreate
from backend.schemas.tree import TreeDraftPayload
from backend.services.errors import RunRequestError
from backend.services.run_service import RunService
from backend.services.runtime_builder import RuntimeBuilder
from backend.services.secret_service import SecretService
from backend.services.tree_service import TreeService
from backend.api.runs import (
    get_run as api_get_run,
    get_run_trace as api_get_run_trace,
    list_runs as api_list_runs,
    list_tree_runs as api_list_tree_runs,
    test_run as api_test_run,
)


class ScriptedProvider(BaseProvider):
    def __init__(self, name: str, model: str, *, fail: Exception | None = None) -> None:
        super().__init__(ProviderConfig(provider_name=name, model=model))
        self.requests: list[ProviderRequest] = []
        self.fail = fail

    def generate(self, request: ProviderRequest) -> ProviderResponse:
        self.requests.append(request)
        if self.fail is not None:
            raise self.fail
        strategy = request.metadata.get("strategy")
        payload = {
            "triage": {"objective": "Inspect network logs", "required_capabilities": ["network"]},
            "decomposition": {"subtasks": [{"objective": "Inspect the logs", "required_capabilities": ["log-analysis"]}]},
            "manager_review": {"decision": "pass", "feedback": "accepted"},
            "final_review": {"decision": "pass", "feedback": "complete"},
        }.get(strategy)
        content = json.dumps(payload) if payload is not None else "Network analysis complete"
        return ProviderResponse(content=content, provider=self.name, model=self.config.model)


def runtime_tree(database, *, output_type: str = "text"):
    secret = SecretService(database).create(SecretCreate(
        name="Runtime key", secret_type="api_key", value="super-secret-runtime-key",
    ))
    provider = ProviderConnection(
        name="Runtime Provider",
        provider_type="openai",
        secret_id=secret.id,
        status="connected",
    )
    database.add(provider)
    database.flush()
    database.add(ProviderModel(
        provider_connection_id=provider.id,
        model_id="runtime-model",
        is_available=True,
    ))
    database.commit()
    root_id, manager_id, specialist_id = (str(uuid4()) for _ in range(3))
    payload = TreeDraftPayload.model_validate({
        "name": "Runtime Tree",
        "description": "Execute real Core orchestration.",
        "agents": [
            {
                "id": root_id, "agent_type": "root", "name": "Root",
                "description": "Coordinate", "system_instruction": "Be decisive.",
                "capabilities": ["triage"], "provider_connection_id": provider.id,
                "model_id": "runtime-model",
            },
            {
                "id": manager_id, "agent_type": "manager", "name": "Network Manager",
                "parent_agent_id": root_id, "system_instruction": "Review network work.",
                "capabilities": ["network"], "provider_connection_id": provider.id,
                "model_id": "runtime-model",
            },
            {
                "id": specialist_id, "agent_type": "specialist", "name": "Log Analyst",
                "parent_agent_id": manager_id, "system_instruction": "Analyze logs carefully.",
                "capabilities": ["log-analysis"], "provider_connection_id": provider.id,
                "model_id": "runtime-model",
            },
        ],
        "trigger": {
            "trigger_type": "manual_form",
            "config": {"fields": [
                {"id": "objective", "name": "Objective", "type": "textarea", "required": True},
                {"id": "priority", "name": "Priority", "type": "select", "required": False, "options": ["low", "high"]},
                {"id": "attachment", "name": "Attachment", "type": "file", "required": False},
            ]},
        },
        "output": {
            "output_type": output_type,
            "delivery_type": "show_in_web",
            "config": {},
        },
    })
    tree = TreeService(database).create(payload)
    return tree, provider, (root_id, manager_id, specialist_id)


def scripted_builder(database, *, fail: Exception | None = None):
    created: list[ScriptedProvider] = []
    credentials: list[str | None] = []

    def factory(connection, model, credential, runtime_name):
        credentials.append(credential)
        provider = ScriptedProvider(runtime_name, model, fail=fail)
        created.append(provider)
        return provider

    return RuntimeBuilder(database, provider_factory=factory), created, credentials


def test_runtime_builder_builds_root_managers_specialists_and_capabilities(database) -> None:
    tree, _, ids = runtime_tree(database)
    builder, providers, credentials = scripted_builder(database)

    bundle = builder.build(tree.id)

    assert isinstance(bundle.runtime.root_agent, RootAgent)
    assert bundle.runtime.root_agent.id == ids[0]
    assert len(bundle.runtime.managers) == 1
    assert isinstance(bundle.runtime.managers[0], ManagerAgent)
    assert bundle.runtime.managers[0].capabilities == ("network",)
    assert bundle.runtime.managers[0].specialists == bundle.runtime.specialists
    assert isinstance(bundle.runtime.specialists[0], SpecialistAgent)
    assert bundle.runtime.specialists[0].capabilities == ("log-analysis",)
    assert bundle.runtime.provider_bindings[ids[2]] == providers[0].name
    assert credentials == ["super-secret-runtime-key"]
    assert bundle.sensitive_values == ("super-secret-runtime-key",)


def test_valid_test_run_executes_core_and_persists_output_state_and_real_trace(database) -> None:
    tree, _, _ = runtime_tree(database)
    builder, provider_instances, _ = scripted_builder(database)

    result = RunService(database, builder).test_run(
        tree.id,
        RunRequest(input={"objective": "Inspect network logs", "priority": "high"}),
    )

    assert result.status.value == "completed"
    assert result.output["value"] == "Network analysis complete"
    assert result.output["core_status"] == "completed"
    assert result.state["current_phase"] == "completed"
    assert result.duration_ms is not None
    assert result.trace
    assert result.trace[0].event_type == "orchestration.started"
    assert result.trace[-1].event_type == "orchestration.final_result_created"
    assert all(item.event_type.startswith("orchestration.") for item in result.trace)
    assert any(item.agent_name == "Log Analyst" for item in result.trace)
    strategies = [request.metadata.get("strategy") for request in provider_instances[0].requests]
    assert strategies == ["triage", "decomposition", None, "manager_review", "final_review"]
    assert database.scalar(select(func.count()).select_from(TraceEvent)) == len(result.trace)


def test_structured_output_preserves_core_final_content(database) -> None:
    tree, _, _ = runtime_tree(database, output_type="structured_json")
    builder, _, _ = scripted_builder(database)

    result = RunService(database, builder).test_run(
        tree.id, RunRequest(input={"objective": "Inspect network logs"}),
    )

    value = result.output["value"]
    assert value["managers"][0]["subtasks"][0]["specialists"][0]["output"] == "Network analysis complete"


def test_execution_failure_transitions_to_failed_and_sanitizes_auth_error(database) -> None:
    tree, _, _ = runtime_tree(database)
    builder, _, _ = scripted_builder(
        database,
        fail=RuntimeError("401 Authorization: Bearer super-secret-runtime-key"),
    )

    result = RunService(database, builder).test_run(
        tree.id, RunRequest(input={"objective": "Inspect network logs"}),
    )

    assert result.status.value == "failed"
    assert result.error_code == "PROVIDER_AUTH_ERROR"
    assert result.error_message == "Provider authentication failed"
    serialized = json.dumps(result.model_dump(mode="json"))
    assert "super-secret-runtime-key" not in serialized
    assert "Authorization" not in serialized
    stored = database.get(Run, result.id)
    assert stored.status == "failed"
    assert stored.finished_at is not None


def test_runtime_build_failure_is_persisted_with_safe_structured_error(database) -> None:
    tree, _, _ = runtime_tree(database)

    def broken_factory(connection, model, credential, runtime_name):
        raise RuntimeError(f"could not configure {credential}")

    result = RunService(
        database,
        RuntimeBuilder(database, provider_factory=broken_factory),
    ).test_run(tree.id, RunRequest(input={"objective": "Inspect network logs"}))

    assert result.status.value == "failed"
    assert result.error_code == "RUNTIME_BUILD_ERROR"
    assert result.error_message == "Provider runtime could not be created"
    assert "super-secret-runtime-key" not in json.dumps(result.model_dump(mode="json"))


def test_run_listing_detail_trace_and_filters(database) -> None:
    tree, _, _ = runtime_tree(database)
    builder, _, _ = scripted_builder(database)
    service = RunService(database, builder)
    completed = service.test_run(
        tree.id, RunRequest(input={"objective": "Inspect network logs"}),
    )

    assert [item.id for item in service.list()] == [completed.id]
    assert [item.id for item in service.list(status="completed")] == [completed.id]
    assert service.list(status="failed") == []
    assert [item.id for item in service.list(tree_id=tree.id)] == [completed.id]
    assert service.get(completed.id).input["objective"] == "Inspect network logs"
    assert service.trace(completed.id)[-1].event_type == "orchestration.final_result_created"


def test_invalid_tree_and_invalid_input_are_rejected_before_run_creation(database) -> None:
    tree, provider, _ = runtime_tree(database)
    builder, _, _ = scripted_builder(database)
    service = RunService(database, builder)
    provider.status = "error"
    database.commit()

    with pytest.raises(RunRequestError) as provider_error:
        service.test_run(tree.id, RunRequest(input={"objective": "work"}))
    assert provider_error.value.error_code == "PROVIDER_UNAVAILABLE"
    assert database.scalar(select(func.count()).select_from(Run)) == 0

    provider.status = "connected"
    database.commit()
    with pytest.raises(RunRequestError) as input_error:
        service.test_run(tree.id, RunRequest(input={}))
    assert input_error.value.error_code == "INPUT_INVALID"
    with pytest.raises(RunRequestError, match="not supported"):
        service.test_run(tree.id, RunRequest(input={
            "objective": "work", "attachment": "secret.txt",
        }))
    assert database.scalar(select(func.count()).select_from(Run)) == 0


def test_missing_provider_and_model_have_specific_runtime_validation_codes(database) -> None:
    tree, provider, ids = runtime_tree(database)
    root = database.get(AgentConfig, ids[0])
    root.provider_connection_id = None
    database.commit()
    result = RuntimeBuilder(database).validate(tree.id)
    assert any(item.code == "PROVIDER_NOT_FOUND" for item in result.errors)

    root.provider_connection_id = provider.id
    root.model_id = "missing-model"
    database.commit()
    result = RuntimeBuilder(database).validate(tree.id)
    assert any(item.code == "MODEL_NOT_AVAILABLE" for item in result.errors)


def test_run_api_functions_create_list_detail_and_trace(database, monkeypatch) -> None:
    tree, _, _ = runtime_tree(database)
    builder, _, _ = scripted_builder(database)
    monkeypatch.setattr(
        "backend.api.runs.RunService",
        lambda session: RunService(session, builder),
    )

    created = api_test_run(
        tree.id,
        RunRequest(input={"objective": "Inspect network logs"}),
        database,
    )

    assert [item.id for item in api_list_runs(None, None, database)] == [created.id]
    assert [item.id for item in api_list_tree_runs(tree.id, None, database)] == [created.id]
    assert api_get_run(created.id, database).id == created.id
    assert api_get_run_trace(created.id, database)[0].event_type == "orchestration.started"
