"""Studio Specialist strategy for bounded, authorized autonomous Tool use."""

from __future__ import annotations

from copy import deepcopy
import json
from time import monotonic
from typing import Any, Mapping

from agenttree import SpecialistAgent
from agenttree.core import BaseSpecialistExecutor, ProviderSpecialistExecutor
from agenttree.models import AgentResult, ExecutionEvent, ExecutionTrace, Subtask, Task
from agenttree.providers import ProviderRequest, ProviderResponse
from agenttree.tools import BaseTool, ToolBindingRegistry, ToolExecutor, ToolRegistry
from pydantic import ValidationError

from backend.core.sanitization import sanitize_value
from backend.schemas.tool_loop import ToolDecision, ToolLoopSettings


MAX_OBSERVATION_CHARACTERS = 16_000


class ToolAwareSpecialistExecutor(BaseSpecialistExecutor):
    """Delegate normal Specialists and loop only for explicit opt-ins."""

    def __init__(
        self,
        *,
        provider_executor: ProviderSpecialistExecutor,
        tool_executor: ToolExecutor,
        tool_registry: ToolRegistry,
        tool_bindings: ToolBindingRegistry,
        settings: Mapping[str, ToolLoopSettings],
        sensitive_values: list[str],
    ) -> None:
        self._provider_executor = provider_executor
        self._tool_executor = tool_executor
        self._tool_registry = tool_registry
        self._tool_bindings = tool_bindings
        self._settings = dict(settings)
        self._sensitive_values = sensitive_values
        self._events: list[ExecutionEvent] = []

    @property
    def events(self) -> tuple[ExecutionEvent, ...]:
        return tuple(deepcopy(self._events))

    def execute(
        self,
        task: Task,
        subtask: Subtask,
        specialist: SpecialistAgent,
    ) -> AgentResult:
        config = self._settings.get(specialist.id, ToolLoopSettings())
        if not config.enabled:
            return self._provider_executor.execute(task, subtask, specialist)
        return self._execute_loop(task, subtask, specialist, config)

    def _execute_loop(
        self,
        task: Task,
        subtask: Subtask,
        specialist: SpecialistAgent,
        config: ToolLoopSettings,
    ) -> AgentResult:
        provider = self._provider_executor.resolve_provider(specialist)
        tools = self._assigned_tools(specialist)
        if not tools:
            return self._failure(
                task, specialist, "NO_ASSIGNED_TOOLS",
                "Autonomous Tool use requires an assigned executable Tool", 0, 0,
            )
        definitions = [self._tool_definition(tool) for tool in tools]
        observations: list[dict[str, Any]] = []
        decision_history: list[dict[str, Any]] = []
        started = monotonic()
        tool_calls = 0

        for iteration in range(1, config.max_iterations + 1):
            if monotonic() - started >= config.timeout_seconds:
                return self._limit_failure(task, specialist, "timeout", iteration - 1, tool_calls)
            request = self._request(
                task, subtask, specialist, definitions, observations,
                decision_history, iteration,
                config,
            )
            try:
                response = provider.generate(request)
            except Exception:
                return self._failure(
                    task, specialist, "PROVIDER_FAILURE",
                    "Specialist Tool-loop provider failed", iteration, tool_calls,
                )
            if not isinstance(response, ProviderResponse):
                return self._failure(
                    task, specialist, "INVALID_PROVIDER_RESPONSE",
                    "Specialist Tool-loop provider returned an invalid response",
                    iteration, tool_calls,
                )
            try:
                decision = ToolDecision.model_validate_json(response.content)
            except (ValidationError, ValueError, TypeError):
                return self._failure(
                    task, specialist, "MALFORMED_DECISION",
                    "Specialist returned a malformed Tool decision", iteration, tool_calls,
                )

            decision_history.append(self._bounded_value({
                "iteration": iteration,
                "action": decision.action,
                "tool_name": decision.tool_name,
                "arguments": decision.arguments,
                "reason": decision.reason,
            }))
            self._record(task, specialist, "studio.tool_decision", "Specialist Tool decision", {
                "iteration": iteration,
                "action": decision.action,
                "tool_name": decision.tool_name,
                "arguments": decision.arguments,
                "reason": decision.reason,
            })
            if decision.action == "final":
                result = self._bounded_value(decision.result)
                self._record(task, specialist, "studio.tool_loop_completed", "Specialist Tool loop completed", {
                    "iterations": iteration,
                    "tool_calls": tool_calls,
                    "success": True,
                })
                return AgentResult(
                    agent_id=specialist.id,
                    success=True,
                    output=result,
                    metadata={
                        "provider": response.provider,
                        "model": response.model,
                        "tool_loop": {"iterations": iteration, "tool_calls": tool_calls},
                    },
                )

            assert decision.tool_name is not None and decision.arguments is not None
            try:
                selected = self._tool_registry.get_by_name(decision.tool_name)
            except (KeyError, TypeError, ValueError):
                return self._failure(
                    task, specialist, "UNKNOWN_TOOL", "Specialist selected an unknown Tool",
                    iteration, tool_calls,
                )
            if not self._tool_bindings.is_assigned(specialist.id, selected.id):
                # Invoke Core's authorization boundary so unauthorized selections
                # are rejected by ToolExecutor itself.
                try:
                    self._tool_executor.execute(
                        specialist=specialist, tool_id=selected.id,
                        arguments=decision.arguments,
                    )
                except PermissionError:
                    return self._failure(
                        task, specialist, "UNAUTHORIZED_TOOL",
                        "Specialist is not authorized to use the selected Tool",
                        iteration, tool_calls,
                    )
            try:
                self._validate_arguments(selected, decision.arguments)
            except (TypeError, ValueError):
                return self._failure(
                    task, specialist, "INVALID_TOOL_ARGUMENTS",
                    "Specialist supplied invalid Tool arguments", iteration, tool_calls,
                )
            if tool_calls >= config.max_tool_calls:
                return self._limit_failure(task, specialist, "tool_calls", iteration, tool_calls)

            trace = ExecutionTrace(task_id=task.id)
            try:
                result = self._tool_executor.execute(
                    specialist=specialist,
                    tool_id=selected.id,
                    arguments=decision.arguments,
                    trace=trace,
                )
            except Exception:
                self._capture_tool_trace(trace)
                return self._failure(
                    task, specialist, "TOOL_EXECUTION_ERROR",
                    "Tool execution raised an error", iteration, tool_calls,
                )
            self._capture_tool_trace(trace)
            tool_calls += 1
            observation = {
                "tool_name": selected.name,
                "success": result.success,
                "output": self._bounded_value(result.output),
                "error": self._safe_error(result.error),
            }
            observations.append(observation)
            self._record(task, specialist, "studio.tool_observation", "Tool result observed", {
                "iteration": iteration,
                **observation,
            })
            if monotonic() - started >= config.timeout_seconds:
                return self._limit_failure(task, specialist, "timeout", iteration, tool_calls)

        return self._limit_failure(
            task, specialist, "iterations", config.max_iterations, tool_calls,
        )

    def _assigned_tools(self, specialist: SpecialistAgent) -> tuple[BaseTool, ...]:
        return tuple(
            self._tool_registry.get_by_id(tool_id)
            for tool_id in self._tool_bindings.tool_ids_for(specialist.id)
        )

    @staticmethod
    def _tool_definition(tool: BaseTool) -> dict[str, Any]:
        json_types = {
            "str": "string", "int": "integer", "float": "number",
            "bool": "boolean", "dict": "object", "list": "array",
            "None": "null", "NoneType": "null",
        }
        properties: dict[str, Any] = {}
        required: list[str] = []
        for parameter in tool.input_spec.parameters:
            schema: dict[str, Any] = {}
            if parameter.annotation:
                schema["type"] = json_types.get(parameter.annotation, parameter.annotation)
            if parameter.description:
                schema["description"] = parameter.description
            if parameter.default is not None:
                schema["default"] = parameter.default
            properties[parameter.name] = schema
            if parameter.required:
                required.append(parameter.name)
        normalized_schema: dict[str, Any] = {
            "type": "object",
            "properties": properties,
            "required": required,
            "additionalProperties": tool.input_spec.accepts_var_keyword,
        }
        mcp_metadata = tool.metadata.get("mcp")
        if isinstance(mcp_metadata, Mapping) and isinstance(mcp_metadata.get("input_schema"), Mapping):
            normalized_schema = deepcopy(dict(mcp_metadata["input_schema"]))
        return {
            "name": tool.name,
            "description": tool.description,
            "input_schema": normalized_schema,
        }

    @staticmethod
    def _validate_arguments(tool: BaseTool, arguments: Mapping[str, Any]) -> None:
        if not isinstance(arguments, Mapping):
            raise TypeError("Tool arguments must be an object")
        parameters = {item.name: item for item in tool.input_spec.parameters}
        missing = [name for name, item in parameters.items() if item.required and name not in arguments]
        if missing:
            raise ValueError("Required Tool arguments are missing")
        unknown = set(arguments) - set(parameters)
        if unknown and not tool.input_spec.accepts_var_keyword:
            raise ValueError("Unknown Tool arguments were supplied")
        checks = {
            "array": lambda value: isinstance(value, list),
            "boolean": lambda value: isinstance(value, bool),
            "integer": lambda value: isinstance(value, int) and not isinstance(value, bool),
            "null": lambda value: value is None,
            "number": lambda value: isinstance(value, (int, float)) and not isinstance(value, bool),
            "object": lambda value: isinstance(value, dict),
            "string": lambda value: isinstance(value, str),
            "str": lambda value: isinstance(value, str),
            "int": lambda value: isinstance(value, int) and not isinstance(value, bool),
            "float": lambda value: isinstance(value, (int, float)) and not isinstance(value, bool),
            "bool": lambda value: isinstance(value, bool),
            "dict": lambda value: isinstance(value, dict),
            "list": lambda value: isinstance(value, list),
        }
        for name, value in arguments.items():
            annotation = parameters.get(name).annotation if name in parameters else None
            if annotation in checks and not checks[annotation](value):
                raise TypeError("Tool argument type does not match its schema")

    def _request(
        self,
        task: Task,
        subtask: Subtask,
        specialist: SpecialistAgent,
        tools: list[dict[str, Any]],
        observations: list[dict[str, Any]],
        decision_history: list[dict[str, Any]],
        iteration: int,
        config: ToolLoopSettings,
    ) -> ProviderRequest:
        return ProviderRequest(
            prompt=(
                "Decide the next action for the assigned subtask. Return exactly one JSON "
                "object and no prose. Use either "
                '{"action":"tool_call","tool_name":"...","arguments":{},"reason":"..."} '
                "or "
                '{"action":"final","result":"...","reason":"..."}. '
                "Select only from available_tools. Base the final result on observations."
            ),
            system_prompt=specialist.description or None,
            context={
                "task": {"id": task.id, "objective": task.objective},
                "task_context": self._bounded_value(task.context.data),
                "subtask": {
                    "id": subtask.id,
                    "objective": subtask.objective,
                    "required_capabilities": subtask.required_capabilities,
                },
                "available_tools": deepcopy(tools),
                "previous_decisions": deepcopy(decision_history),
                "observations": deepcopy(observations),
                "loop": {
                    "iteration": iteration,
                    "max_iterations": config.max_iterations,
                    "tool_calls_remaining": config.max_tool_calls - len(observations),
                },
            },
            metadata={
                "strategy": "studio_tool_loop",
                "task_id": task.id,
                "subtask_id": subtask.id,
                "specialist_id": specialist.id,
                "iteration": iteration,
            },
        )

    def _bounded_value(self, value: Any) -> Any:
        safe = self._redact_authorization_fields(
            sanitize_value(value, tuple(self._sensitive_values)),
        )
        try:
            rendered = json.dumps(safe, ensure_ascii=False, allow_nan=False)
        except (TypeError, ValueError):
            safe = sanitize_value(str(safe), tuple(self._sensitive_values))
            rendered = json.dumps(safe, ensure_ascii=False)
        if len(rendered) <= MAX_OBSERVATION_CHARACTERS:
            return safe
        return {
            "truncated": True,
            "preview": rendered[:MAX_OBSERVATION_CHARACTERS],
            "original_characters": len(rendered),
        }

    @classmethod
    def _redact_authorization_fields(cls, value: Any) -> Any:
        if isinstance(value, dict):
            return {
                str(key): (
                    "[REDACTED]"
                    if str(key).casefold() in {
                        "authorization", "proxy-authorization", "api_key", "apikey",
                        "access_token", "refresh_token", "token", "secret", "password",
                    }
                    else cls._redact_authorization_fields(item)
                )
                for key, item in value.items()
            }
        if isinstance(value, list):
            return [cls._redact_authorization_fields(item) for item in value]
        return value

    def _capture_tool_trace(self, trace: ExecutionTrace) -> None:
        for event in trace.events:
            metadata = dict(event.metadata)
            if metadata.get("error"):
                metadata["error"] = self._safe_error(str(metadata["error"]))
            self._events.append(ExecutionEvent(
                event_type=event.event_type,
                task_id=event.task_id,
                actor_id=event.actor_id,
                message=str(sanitize_value(event.message, tuple(self._sensitive_values))),
                metadata=self._bounded_value(metadata),
                timestamp=event.timestamp,
            ))

    def _safe_error(self, error: str | None) -> str | None:
        if not error:
            return None
        safe = str(sanitize_value(error, tuple(self._sensitive_values)))
        if any(item in safe.casefold() for item in ("authorization", "bearer ", "token", "secret", "password")):
            return "Tool execution failed"
        return safe[:500]

    def _record(
        self,
        task: Task,
        specialist: SpecialistAgent,
        event_type: str,
        message: str,
        metadata: dict[str, Any],
    ) -> None:
        self._events.append(ExecutionEvent(
            event_type=event_type,
            task_id=task.id,
            actor_id=specialist.id,
            message=message,
            metadata=self._bounded_value(metadata),
        ))

    def _failure(
        self,
        task: Task,
        specialist: SpecialistAgent,
        code: str,
        message: str,
        iterations: int,
        tool_calls: int,
    ) -> AgentResult:
        self._record(task, specialist, "studio.tool_loop_completed", message, {
            "success": False,
            "code": code,
            "iterations": iterations,
            "tool_calls": tool_calls,
        })
        return AgentResult(
            agent_id=specialist.id,
            success=False,
            error=message,
            metadata={
                "tool_loop": {
                    "code": code,
                    "iterations": iterations,
                    "tool_calls": tool_calls,
                },
            },
        )

    def _limit_failure(
        self,
        task: Task,
        specialist: SpecialistAgent,
        limit: str,
        iterations: int,
        tool_calls: int,
    ) -> AgentResult:
        self._record(task, specialist, "studio.tool_loop_limit_reached", "Specialist Tool loop limit reached", {
            "limit": limit,
            "iterations": iterations,
            "tool_calls": tool_calls,
        })
        return self._failure(
            task, specialist, "TOOL_LOOP_LIMIT",
            "Specialist Tool loop reached its configured limit",
            iterations, tool_calls,
        )
