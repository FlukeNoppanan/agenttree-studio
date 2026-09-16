"""Synchronous Test Run execution, sanitization, and Run/trace persistence."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
import json
import re
from time import perf_counter
from typing import Any

from agenttree.models import ExecutionTrace, Task, TaskContext
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.models.run import Run, TraceEvent
from backend.models.tree import Tree, TreeVersion
from backend.schemas.run import RunDetailRead, RunRead, TestRunRequest, TraceEventRead
from backend.services.errors import ResourceNotFoundError, RunRequestError
from backend.services.runtime_builder import RuntimeBuilder, RuntimeBundle


_AUTHORIZATION = re.compile(r"(?i)(authorization\s*[:=]\s*(?:bearer\s+)?)[^\s,;}]+")
_URL_CREDENTIALS = re.compile(r"(https?://)[^/@\s:]+:[^/@\s]+@", re.IGNORECASE)


def sanitize_for_persistence(value: Any, sensitive_values: tuple[str, ...] = ()) -> Any:
    """Return JSON-safe data with known credentials and common auth forms removed."""
    if isinstance(value, Enum):
        return value.value
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, str):
        cleaned = value
        for secret in sensitive_values:
            if secret:
                cleaned = cleaned.replace(secret, "[REDACTED]")
        cleaned = _AUTHORIZATION.sub(r"\1[REDACTED]", cleaned)
        return _URL_CREDENTIALS.sub(r"\1[REDACTED]@", cleaned)
    if isinstance(value, dict):
        return {
            str(key): sanitize_for_persistence(item, sensitive_values)
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple, set, frozenset)):
        return [sanitize_for_persistence(item, sensitive_values) for item in value]
    if hasattr(value, "to_dict"):
        return sanitize_for_persistence(value.to_dict(), sensitive_values)
    return sanitize_for_persistence(str(value), sensitive_values)


class RunService:
    def __init__(self, database: Session, runtime_builder: RuntimeBuilder | None = None) -> None:
        self._database = database
        self._builder = runtime_builder or RuntimeBuilder(database)

    def test_run(self, tree_id: str, request: TestRunRequest) -> RunDetailRead:
        tree = self._builder.get_tree(tree_id)
        validation = self._builder.validate_tree(tree)
        if not validation.valid:
            first = validation.errors[0]
            raise RunRequestError(first.code, first.message)
        version = tree.current_version
        assert version is not None
        prepared_input = self._validate_input(version, request.input)

        now = datetime.now(timezone.utc)
        run = Run(
            tree_id=tree.id,
            tree_version_id=version.id,
            status="pending",
            input_json=sanitize_for_persistence(prepared_input),
            started_at=now,
        )
        self._database.add(run)
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
            task = Task(
                objective=self._task_objective(tree.name, version, prepared_input),
                context=TaskContext(data=prepared_input),
                metadata={
                    "studio_run_id": run.id,
                    "tree_id": tree.id,
                    "tree_version_id": version.id,
                    "trigger_type": version.trigger.trigger_type,
                },
            )
            result = bundle.runtime.run(task)
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
                    )
        finally:
            finished = datetime.now(timezone.utc)
            run.finished_at = finished
            run.duration_ms = max(0, round((perf_counter() - started) * 1000))
            self._database.commit()
            self._database.expire_all()
        return self.get(run.id)

    @staticmethod
    def _validate_input(version: TreeVersion, payload: dict[str, Any]) -> dict[str, Any]:
        trigger = version.trigger
        assert trigger is not None
        if trigger.trigger_type == "webhook":
            return dict(payload)
        fields = trigger.config_json.get("fields", [])
        if not isinstance(fields, list):
            raise RunRequestError("INPUT_INVALID", "Manual Form configuration is invalid")
        known_ids = {
            str(field.get("id") or field.get("name")): field
            for field in fields if isinstance(field, dict)
        }
        unknown = set(payload) - set(known_ids)
        if unknown:
            raise RunRequestError("INPUT_INVALID", "Input contains fields not configured by this Tree")
        prepared: dict[str, Any] = {}
        for field_id, field in known_ids.items():
            value = payload.get(field_id)
            label = str(field.get("name") or field_id)
            if field.get("type") == "file":
                if value not in (None, ""):
                    raise RunRequestError("INPUT_INVALID", f"File field '{label}' is not supported in Test Run")
                if field.get("required"):
                    raise RunRequestError("INPUT_INVALID", f"Required file field '{label}' is not supported in Test Run")
                continue
            if value in (None, ""):
                if field.get("required"):
                    raise RunRequestError("INPUT_INVALID", f"Field '{label}' is required")
                continue
            field_type = field.get("type")
            if field_type in {"text", "textarea"} and not isinstance(value, str):
                raise RunRequestError("INPUT_INVALID", f"Field '{label}' must be text")
            if field_type == "number" and (isinstance(value, bool) or not isinstance(value, (int, float))):
                raise RunRequestError("INPUT_INVALID", f"Field '{label}' must be a number")
            if field_type == "select":
                options = field.get("options", [])
                if not isinstance(value, str) or value not in options:
                    raise RunRequestError("INPUT_INVALID", f"Field '{label}' must use a configured option")
            prepared[field_id] = value
        return prepared

    @staticmethod
    def _task_objective(tree_name: str, version: TreeVersion, payload: dict[str, Any]) -> str:
        trigger = version.trigger
        assert trigger is not None
        if trigger.trigger_type == "manual_form":
            fields = {
                str(item.get("id") or item.get("name")): str(item.get("name") or "Input")
                for item in trigger.config_json.get("fields", []) if isinstance(item, dict)
            }
            lines = [f"{fields.get(key, key)}: {value}" for key, value in payload.items()]
            return "\n".join(lines) or f"Execute {tree_name}"
        return f"Webhook input for {tree_name}: {json.dumps(payload, sort_keys=True, ensure_ascii=False)}"

    @staticmethod
    def _format_output(version: TreeVersion, state: dict[str, Any] | None, success: bool) -> dict[str, Any]:
        output = version.output
        assert output is not None
        final = (state or {}).get("final_result") or {}
        content = final.get("content", {})
        if output.output_type == "structured_json":
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
            "type": output.output_type,
            "delivery_type": output.delivery_type,
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
    ) -> None:
        if run.trace_events:
            return
        for sequence, event in enumerate(trace.events, start=1):
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

    @staticmethod
    def _options():
        return (
            selectinload(Run.tree),
            selectinload(Run.tree_version),
            selectinload(Run.trace_events),
        )

    def _get_model(self, run_id: str) -> Run:
        run = self._database.scalar(
            select(Run).options(*self._options()).where(Run.id == run_id),
        )
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
            )
        return RunRead(**values)

    def list(self, *, status: str | None = None, tree_id: str | None = None) -> list[RunRead]:
        statement = select(Run).options(*self._options()).order_by(Run.created_at.desc())
        if status:
            statement = statement.where(Run.status == status)
        if tree_id:
            if self._database.get(Tree, tree_id) is None:
                raise ResourceNotFoundError("Tree not found")
            statement = statement.where(Run.tree_id == tree_id)
        return [self._read(item) for item in self._database.scalars(statement).all()]

    def get(self, run_id: str) -> RunDetailRead:
        return self._read(self._get_model(run_id), detail=True)

    def trace(self, run_id: str) -> list[TraceEventRead]:
        return [self._trace_read(item) for item in self._get_model(run_id).trace_events]
