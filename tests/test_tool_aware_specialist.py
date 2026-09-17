"""Bounded autonomous Specialist Tool use through public AgentTree APIs."""

import json

import pytest
from agenttree import SpecialistAgent
from agenttree.core import ProviderSpecialistExecutor
from agenttree.models import Subtask, Task
from agenttree.providers import BaseProvider, ProviderConfig, ProviderRegistry, ProviderRequest, ProviderResponse
from agenttree.tools import FunctionTool, ToolBindingRegistry, ToolExecutor, ToolRegistry
from pydantic import ValidationError

from backend.models.tree import AgentConfig
from backend.schemas.run import TestRunRequest as RunRequest
from backend.schemas.tool import ToolAssignmentsUpdate
from backend.schemas.tool_loop import ToolDecision, ToolLoopSettings
from backend.services.run_service import RunService
from backend.services.runtime_builder import RuntimeBuilder
from backend.services.tool_aware_specialist_executor import ToolAwareSpecialistExecutor
from backend.services.tool_service import ToolService
from tests.test_runs import runtime_tree
from tests.test_tools_runtime import TestToolFactory, http_payload, successful_transport


class QueueProvider(BaseProvider):
    def __init__(self, responses) -> None:
        super().__init__(ProviderConfig(provider_name="queue", model="test-model"))
        self.responses = list(responses)
        self.requests: list[ProviderRequest] = []

    def generate(self, request: ProviderRequest) -> ProviderResponse:
        self.requests.append(request)
        value = self.responses.pop(0)
        if isinstance(value, Exception):
            raise value
        return ProviderResponse(content=value, provider=self.name, model=self.config.model)


class SpyToolExecutor(ToolExecutor):
    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)
        self.calls = 0

    def execute(self, **kwargs):
        self.calls += 1
        return super().execute(**kwargs)


def decision(**values) -> str:
    return json.dumps(values)


def executor_fixture(
    responses,
    *,
    enabled=True,
    settings=None,
    function=None,
    sensitive_values=None,
):
    specialist = SpecialistAgent(
        id="specialist-1", name="Analyst", description="Investigate carefully",
        capabilities=("analysis",),
    )
    provider = QueueProvider(responses)
    providers = ProviderRegistry()
    providers.register(provider)
    provider_executor = ProviderSpecialistExecutor(
        provider_registry=providers,
        provider_bindings={specialist.id: provider.name},
    )
    tools = ToolRegistry()
    bindings = ToolBindingRegistry()
    tool = FunctionTool(
        name="lookup",
        description="Look up a host",
        function=function or (lambda host: {"host": host, "status": "ok"}),
        tool_id="lookup-id",
    )
    hidden = FunctionTool(name="hidden", function=lambda: "hidden", tool_id="hidden-id")
    tools.register(tool)
    tools.register(hidden)
    bindings.assign(specialist.id, tool.id)
    core_executor = SpyToolExecutor(registry=tools, bindings=bindings)
    config = settings or ToolLoopSettings(enabled=enabled)
    executor = ToolAwareSpecialistExecutor(
        provider_executor=provider_executor,
        tool_executor=core_executor,
        tool_registry=tools,
        tool_bindings=bindings,
        settings={specialist.id: config},
        sensitive_values=sensitive_values or [],
    )
    task = Task(id="task-1", objective="Inspect the host")
    subtask = Subtask(
        id="subtask-1", parent_task_id=task.id, manager_id="manager-1",
        objective="Get host status", required_capabilities=("analysis",),
    )
    return executor, core_executor, provider, specialist, task, subtask


def test_specialist_without_autonomous_tools_uses_normal_core_provider_execution() -> None:
    executor, core, provider, specialist, task, subtask = executor_fixture(
        ["ordinary specialist result"], enabled=False,
    )

    result = executor.execute(task, subtask, specialist)

    assert result.success is True
    assert result.output == "ordinary specialist result"
    assert core.calls == 0
    assert executor.events == ()
    assert provider.requests[0].metadata["subtask_id"] == subtask.id


def test_tool_call_observation_then_final_uses_core_executor_and_sanitizes() -> None:
    executor, core, provider, specialist, task, subtask = executor_fixture([
        decision(action="tool_call", tool_name="lookup", arguments={"host": "server-01"}, reason="Need status"),
        decision(action="final", result="Host is top-secret", reason="Observation is sufficient"),
    ], function=lambda host: {"host": host, "credential": "top-secret", "Authorization": "Bearer unknown", "token": "unlisted-token"}, sensitive_values=["top-secret"])

    result = executor.execute(task, subtask, specialist)

    assert result.success is True
    assert result.output == "Host is [REDACTED]"
    assert core.calls == 1
    assert provider.requests[1].context["observations"][0] == {
        "tool_name": "lookup", "success": True,
        "output": {"host": "server-01", "credential": "[REDACTED]", "Authorization": "[REDACTED]", "token": "[REDACTED]"},
        "error": None,
    }
    serialized = json.dumps([event.to_dict() for event in executor.events])
    assert "top-secret" not in serialized
    assert "unlisted-token" not in serialized
    serialized_requests = json.dumps([
        {"prompt": item.prompt, "system": item.system_prompt, "context": item.context}
        for item in provider.requests
    ])
    assert "top-secret" not in serialized_requests
    assert [event.event_type for event in executor.events] == [
        "studio.tool_decision",
        "orchestration.tool_execution_started",
        "orchestration.tool_execution_completed",
        "studio.tool_observation",
        "studio.tool_decision",
        "studio.tool_loop_completed",
    ]


def test_multiple_tool_calls_and_failed_tool_observation_can_recover() -> None:
    attempts = 0

    def sometimes_fails(host: str):
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise RuntimeError("temporary failure")
        return {"host": host, "status": "recovered"}

    executor, core, provider, specialist, task, subtask = executor_fixture([
        decision(action="tool_call", tool_name="lookup", arguments={"host": "a"}),
        decision(action="tool_call", tool_name="lookup", arguments={"host": "b"}),
        decision(action="final", result="Recovered"),
    ], function=sometimes_fails)

    result = executor.execute(task, subtask, specialist)

    assert result.success is True and result.output == "Recovered"
    assert core.calls == 2
    assert provider.requests[1].context["observations"][0]["success"] is False
    assert provider.requests[2].context["observations"][1]["output"]["status"] == "recovered"


@pytest.mark.parametrize("tool_name,arguments,code", [
    ("missing", {"host": "a"}, "UNKNOWN_TOOL"),
    ("hidden", {}, "UNAUTHORIZED_TOOL"),
    ("lookup", {}, "INVALID_TOOL_ARGUMENTS"),
])
def test_unknown_unauthorized_and_invalid_tool_calls_are_rejected(
    tool_name, arguments, code,
) -> None:
    executor, core, _, specialist, task, subtask = executor_fixture([
        decision(action="tool_call", tool_name=tool_name, arguments=arguments),
    ])

    result = executor.execute(task, subtask, specialist)

    assert result.success is False
    assert result.metadata["tool_loop"]["code"] == code
    assert core.calls == (1 if code == "UNAUTHORIZED_TOOL" else 0)


@pytest.mark.parametrize("response,code", [
    ("not-json", "MALFORMED_DECISION"),
    (decision(action="tool_call", arguments={}), "MALFORMED_DECISION"),
    (RuntimeError("provider unavailable"), "PROVIDER_FAILURE"),
])
def test_malformed_decisions_and_provider_failures_are_controlled(response, code) -> None:
    executor, _, _, specialist, task, subtask = executor_fixture([response])
    result = executor.execute(task, subtask, specialist)
    assert result.success is False
    assert result.metadata["tool_loop"]["code"] == code
    raw = response if isinstance(response, str) else str(response)
    assert raw not in result.error


def test_iteration_and_tool_call_limits_prevent_infinite_loops() -> None:
    repeating = decision(action="tool_call", tool_name="lookup", arguments={"host": "a"})
    executor, core, _, specialist, task, subtask = executor_fixture(
        [repeating, repeating, repeating],
        settings=ToolLoopSettings(enabled=True, max_iterations=2, max_tool_calls=5),
    )
    result = executor.execute(task, subtask, specialist)
    assert result.success is False
    assert result.metadata["tool_loop"] == {
        "code": "TOOL_LOOP_LIMIT", "iterations": 2, "tool_calls": 2,
    }
    assert core.calls == 2
    assert any(event.event_type == "studio.tool_loop_limit_reached" for event in executor.events)

    executor, core, _, specialist, task, subtask = executor_fixture(
        [repeating, repeating],
        settings=ToolLoopSettings(enabled=True, max_iterations=5, max_tool_calls=1),
    )
    result = executor.execute(task, subtask, specialist)
    assert result.success is False
    assert core.calls == 1
    assert result.metadata["tool_loop"]["code"] == "TOOL_LOOP_LIMIT"


def test_overall_deadline_is_enforced_between_operations(monkeypatch) -> None:
    clock = iter((0.0, 2.0))
    monkeypatch.setattr(
        "backend.services.tool_aware_specialist_executor.monotonic",
        lambda: next(clock),
    )
    executor, core, provider, specialist, task, subtask = executor_fixture(
        [decision(action="final", result="too late")],
        settings=ToolLoopSettings(enabled=True, timeout_seconds=1),
    )
    result = executor.execute(task, subtask, specialist)
    assert result.success is False
    assert result.metadata["tool_loop"]["code"] == "TOOL_LOOP_LIMIT"
    assert core.calls == 0 and provider.requests == []


def test_large_tool_observations_are_truncated_before_model_and_trace() -> None:
    executor, _, provider, specialist, task, subtask = executor_fixture([
        decision(action="tool_call", tool_name="lookup", arguments={"host": "large"}),
        decision(action="final", result="done"),
    ], function=lambda host: {"host": host, "payload": "x" * 30_000})
    result = executor.execute(task, subtask, specialist)
    observation = provider.requests[1].context["observations"][0]["output"]
    assert result.success is True
    assert observation["truncated"] is True
    assert observation["original_characters"] > 16_000
    assert len(observation["preview"]) == 16_000


def test_tool_decision_and_settings_validation_is_strict() -> None:
    assert ToolDecision.model_validate({"action": "final", "result": "done"}).result == "done"
    with pytest.raises(ValidationError):
        ToolDecision.model_validate({"action": "final"})
    with pytest.raises(ValidationError):
        ToolDecision.model_validate({"action": "tool_call", "tool_name": "lookup"})
    with pytest.raises(ValueError, match="between 1 and 10"):
        ToolLoopSettings.from_mapping({"max_tool_iterations": 0})


def test_runtime_validation_rejects_enabled_loop_without_tools(database) -> None:
    tree, _, ids = runtime_tree(database)
    specialist = database.get(AgentConfig, ids[2])
    specialist.settings_json = {"autonomous_tool_use": True}
    database.commit()
    validation = RuntimeBuilder(database).validate(tree.id)
    assert validation.valid is False
    assert any(item.code == "TOOL_LOOP_CONFIG_ERROR" for item in validation.errors)


class WorkflowToolProvider(BaseProvider):
    def __init__(self, name: str, model: str) -> None:
        super().__init__(ProviderConfig(provider_name=name, model=model))
        self.requests: list[ProviderRequest] = []

    def generate(self, request: ProviderRequest) -> ProviderResponse:
        self.requests.append(request)
        strategy = request.metadata.get("strategy")
        if strategy == "triage":
            payload = {"objective": "Inspect network logs", "required_capabilities": ["network"]}
        elif strategy == "decomposition":
            payload = {"subtasks": [{"objective": "Inspect the logs", "required_capabilities": ["log-analysis"]}]}
        elif strategy in {"manager_review", "final_review"}:
            payload = {"decision": "pass", "feedback": "accepted"}
        elif strategy == "studio_tool_loop":
            payload = (
                {"action": "tool_call", "tool_name": "Get Server Status", "arguments": {"server_id": "srv-1", "detail": "full"}}
                if request.metadata["iteration"] == 1
                else {"action": "final", "result": "Server is healthy"}
            )
        else:
            payload = "unexpected"
        content = json.dumps(payload) if not isinstance(payload, str) else payload
        return ProviderResponse(content=content, provider=self.name, model=self.config.model)


def test_full_core_workflow_routes_through_tool_loop_and_persists_trace(database) -> None:
    tree, _, ids = runtime_tree(database)
    specialist = database.get(AgentConfig, ids[2])
    specialist.settings_json = {
        "autonomous_tool_use": True,
        "max_tool_iterations": 5,
        "max_tool_calls": 3,
        "tool_loop_timeout_seconds": 60,
    }
    transport_record: dict = {}
    tool_factory = TestToolFactory(database, transport=successful_transport(transport_record))
    tool_service = ToolService(database, tool_factory)
    tool = tool_service.create(http_payload())
    tool_service.test(tool.id)
    tool_service.replace_assignments(tool.id, ToolAssignmentsUpdate(agent_ids=[specialist.id]))
    database.commit()
    providers: list[WorkflowToolProvider] = []

    def provider_factory(connection, model, credential, runtime_name):
        provider = WorkflowToolProvider(runtime_name, model)
        providers.append(provider)
        return provider

    result = RunService(database, RuntimeBuilder(
        database, provider_factory=provider_factory, tool_factory=tool_factory,
    )).test_run(tree.id, RunRequest(input={"objective": "Inspect network logs"}))

    assert result.status.value == "completed"
    assert result.output["value"] == "Server is healthy"
    event_types = [event.event_type for event in result.trace]
    assert "studio.tool_decision" in event_types
    assert "orchestration.tool_execution_started" in event_types
    assert "orchestration.tool_execution_completed" in event_types
    assert "studio.tool_observation" in event_types
    assert "studio.tool_loop_completed" in event_types
    assert event_types[0] == "orchestration.started"
    assert event_types[-1] == "orchestration.final_result_created"
    assert any(request.metadata.get("strategy") == "manager_review" for request in providers[0].requests)
    assert any(request.metadata.get("strategy") == "final_review" for request in providers[0].requests)
    assert "detail=full" in transport_record["url"]
    assert "super-secret-runtime-key" not in json.dumps(result.model_dump(mode="json"))
