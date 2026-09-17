"""Reusable Tree invocation, synchronous execution, and Run persistence."""

from __future__ import annotations

from datetime import datetime, timezone
import json
from time import perf_counter
from typing import Any

from agenttree.models import ExecutionEvent, ExecutionTrace, Task, TaskContext
from sqlalchemy.orm import Session

from backend.models.run import Run, TraceEvent
from backend.core.sanitization import sanitize_value
from backend.models.tree import Tree, TreeVersion
from backend.repositories.protocols import RunRepository
from backend.repositories.sqlalchemy import SQLAlchemyRunRepository
from backend.schemas.run import InvocationRequest, RunDetailRead, RunRead, TestRunRequest, TraceEventRead
from backend.services.destination_service import ResultDeliveryService
from backend.services.execution_backend import RunExecutionBackend, SynchronousExecutionBackend
from backend.services.errors import ResourceNotFoundError, RunRequestError
from backend.services.runtime_builder import RuntimeBuilder, RuntimeBundle


def sanitize_for_persistence(value: Any, sensitive_values: tuple[str, ...] = ()) -> Any:
    """Return JSON-safe data with known credentials and common auth forms removed."""
    return sanitize_value(value, sensitive_values)


class RunService:
    def __init__(
        self,
        database: Session,
        runtime_builder: RuntimeBuilder | None = None,
        run_repository: RunRepository | None = None,
        delivery_service: ResultDeliveryService | None = None,
        execution_backend: RunExecutionBackend | None = None,
    ) -> None:
        self._database = database
        self._builder = runtime_builder or RuntimeBuilder(database)
        self._runs = run_repository or SQLAlchemyRunRepository(database)
        self._delivery = delivery_service or ResultDeliveryService(database)
        self._execution = execution_backend or SynchronousExecutionBackend()

    def test_run(self, tree_id: str, request: TestRunRequest) -> RunDetailRead:
        return self.invoke(
            tree_id,
            InvocationRequest(input=request.input, metadata={"invoked_from": "studio_test"}),
            invocation_source="studio_test",
        )

    def invoke(
        self,
        tree_id: str,
        request: InvocationRequest,
        *,
        invocation_source: str = "api",
    ) -> RunDetailRead:
        tree = self._builder.get_tree(tree_id)
        validation = self._builder.validate_tree(tree)
        if not validation.valid:
            first = validation.errors[0]
            raise RunRequestError(first.code, first.message)
        version = tree.current_version
        assert version is not None
        prepared_input = dict(request.input)
        caller_metadata = dict(request.metadata)

        now = datetime.now(timezone.utc)
        run = Run(
            tree_id=tree.id,
            tree_version_id=version.id,
            status="pending",
            input_json=sanitize_for_persistence(prepared_input),
            metadata_json=sanitize_for_persistence(caller_metadata),
            invocation_source=invocation_source,
            started_at=now,
        )
        self._runs.add(run)
        self._database.commit()
        run.status = "running"
        self._database.commit()

        started = perf_counter()
        bundle: RuntimeBundle | None = None
        stage = "runtime_build"
        try:
            bundle = self._builder.build(tree_id)
            stage = "execution"
            run.input_json = sanitize_for_persistence(prepared_input, bundle.sensitive_values)
            run.metadata_json = sanitize_for_persistence(caller_metadata, bundle.sensitive_values)
            task = Task(
                objective=self._task_objective(tree.name, version, prepared_input),
                context=TaskContext(data=prepared_input),
                metadata={
                    "studio_run_id": run.id,
                    "tree_id": tree.id,
                    "tree_version_id": version.id,
                    "invocation_source": invocation_source,
                    "caller_metadata": caller_metadata,
                },
            )
            result = self._execution.execute(bundle, task)
            state = bundle.runtime.last_state
            serialized_state = state.to_dict() if state is not None else None
            run.output_json = sanitize_for_persistence(
                self._format_output(version, serialized_state, result.success),
                bundle.sensitive_values,
            )
            run.state_json = sanitize_for_persistence(serialized_state, bundle.sensitive_values)
            self._persist_trace(
                run,
                result.trace,
                bundle.agents_by_id,
                bundle.sensitive_values,
                self._tool_loop_events(bundle),
            )
            run.status = "completed"
        except Exception as error:
            code, message = self._safe_execution_error(error, stage=stage)
            run.status = "failed"
            run.error_code = code
            run.error_message = message
            if bundle is not None:
                state = bundle.runtime.last_state
                if state is not None:
                    run.state_json = sanitize_for_persistence(
                        state.to_dict(), bundle.sensitive_values,
                    )
                    self._persist_trace(
                        run, state.trace, bundle.agents_by_id, bundle.sensitive_values,
                        self._tool_loop_events(bundle),
                    )
        finally:
            if bundle is not None:
                for client in bundle.mcp_clients:
                    try:
                        client.close()
                    except Exception:
                        pass
            finished = datetime.now(timezone.utc)
            run.finished_at = finished
            run.duration_ms = max(0, round((perf_counter() - started) * 1000))
            self._database.commit()
            self._database.expire_all()
        if run.status == "completed":
            self._delivery.deliver(run, sanitize_for_persistence(caller_metadata))
            self._database.expire_all()
        return self.get(run.id)

    @staticmethod
    def _task_objective(tree_name: str, version: TreeVersion, payload: dict[str, Any]) -> str:
        trigger = version.trigger
        if trigger is not None and trigger.trigger_type == "manual_form":
            fields = {
                str(item.get("id") or item.get("name")): str(item.get("name") or "Input")
                for item in trigger.config_json.get("fields", []) if isinstance(item, dict)
            }
            lines = [f"{fields.get(key, key)}: {value}" for key, value in payload.items()]
            return "\n".join(lines) or f"Execute {tree_name}"
        return f"Task for {tree_name}: {json.dumps(payload, sort_keys=True, ensure_ascii=False)}"

    @staticmethod
    def _format_output(version: TreeVersion, state: dict[str, Any] | None, success: bool) -> dict[str, Any]:
        output = version.output
        final = (state or {}).get("final_result") or {}
        content = final.get("content", {})
        output_type = output.output_type if output is not None else "structured_json"
        delivery_type = output.delivery_type if output is not None else "show_in_web"
        if output_type == "structured_json":
            value: Any = content
        else:
            values: list[str] = []
            for manager in content.get("managers", []):
                for subtask in manager.get("subtasks", []):
                    for specialist in subtask.get("specialists", []):
                        item = specialist.get("output")
                        if item is not None:
                            values.append(item if isinstance(item, str) else json.dumps(item, ensure_ascii=False))
            value = "\n\n".join(values) if values else json.dumps(content, ensure_ascii=False)
        return {
            "type": output_type,
            "delivery_type": delivery_type,
            "value": value,
            "success": success,
            "core_status": final.get("status"),
        }

    def _persist_trace(
        self,
        run: Run,
        trace: ExecutionTrace,
        agents_by_id: dict[str, Any],
        sensitive_values: tuple[str, ...],
        additional_events: tuple[ExecutionEvent, ...] = (),
    ) -> None:
        if run.trace_events:
            return
        events = sorted(
            (*trace.events, *additional_events),
            key=lambda event: event.timestamp,
        )
        for sequence, event in enumerate(events, start=1):
            agent = agents_by_id.get(event.actor_id) if event.actor_id else None
            self._database.add(TraceEvent(
                run_id=run.id,
                sequence=sequence,
                event_type=event.event_type,
                agent_id=event.actor_id,
                agent_name=agent.name if agent is not None else None,
                payload_json=sanitize_for_persistence(event.to_dict(), sensitive_values),
                created_at=event.timestamp,
            ))

    @staticmethod
    def _tool_loop_events(bundle: RuntimeBundle) -> tuple[ExecutionEvent, ...]:
        return bundle.tool_loop_executor.events if bundle.tool_loop_executor else ()

    @staticmethod
    def _safe_execution_error(error: Exception, *, stage: str = "execution") -> tuple[str, str]:
        if isinstance(error, RunRequestError):
            return error.error_code, str(error)
        if stage == "runtime_build":
            return "RUNTIME_BUILD_ERROR", "AgentTree runtime could not be built"
        chain: list[BaseException] = []
        current: BaseException | None = error
        while current is not None and current not in chain:
            chain.append(current)
            current = current.__cause__ or current.__context__
        fingerprint = " ".join(
            f"{type(item).__name__} {item}" for item in chain
        ).casefold()
        if any(token in fingerprint for token in ("authentication", "unauthorized", "invalid api key", "401")):
            return "PROVIDER_AUTH_ERROR", "Provider authentication failed"
        if any(token in fingerprint for token in ("provider", "openai", "gemini", "ollama")):
            return "EXECUTION_ERROR", "Provider execution failed"
        return "EXECUTION_ERROR", "AgentTree execution failed"

    def _get_model(self, run_id: str) -> Run:
        run = self._runs.get(run_id)
        if run is None:
            raise ResourceNotFoundError("Run not found")
        return run

    @staticmethod
    def _trace_read(event: TraceEvent) -> TraceEventRead:
        return TraceEventRead(
            id=event.id,
            run_id=event.run_id,
            sequence=event.sequence,
            event_type=event.event_type,
            agent_id=event.agent_id,
            agent_name=event.agent_name,
            payload=event.payload_json,
            created_at=RunService._utc(event.created_at),
        )

    @staticmethod
    def _utc(value: datetime | None) -> datetime | None:
        if value is None:
            return None
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)

    @classmethod
    def _read(cls, run: Run, *, detail: bool = False) -> RunRead | RunDetailRead:
        values = dict(
            id=run.id,
            tree_id=run.tree_id,
            tree_name=run.tree.name,
            tree_version_id=run.tree_version_id,
            tree_version_number=run.tree_version.version_number,
            status=run.status,
            input=run.input_json,
            metadata=run.metadata_json or {},
            invocation_source=run.invocation_source,
            output=run.output_json,
            error_code=run.error_code,
            error_message=run.error_message,
            started_at=cls._utc(run.started_at),
            finished_at=cls._utc(run.finished_at),
            duration_ms=run.duration_ms,
            created_at=cls._utc(run.created_at),
        )
        if detail:
            return RunDetailRead(
                **values,
                state=run.state_json,
                trace=[cls._trace_read(item) for item in run.trace_events],
                delivery_results=[ResultDeliveryService.read(item) for item in run.delivery_results],
            )
        return RunRead(**values)

    def list(self, *, status: str | None = None, tree_id: str | None = None) -> list[RunRead]:
        if tree_id:
            if self._database.get(Tree, tree_id) is None:
                raise ResourceNotFoundError("Tree not found")
        return [self._read(item) for item in self._runs.list(status=status, tree_id=tree_id)]

    def get(self, run_id: str) -> RunDetailRead:
        return self._read(self._get_model(run_id), detail=True)

    def trace(self, run_id: str) -> list[TraceEventRead]:
        return [self._trace_read(item) for item in self._get_model(run_id).trace_events]
