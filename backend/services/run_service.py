"""Reusable Tree invocation, synchronous execution, and Run persistence."""

from __future__ import annotations

from datetime import datetime, timezone
import json
from time import perf_counter
from typing import Any

from agenttree.models import ExecutionTrace, Task, TaskContext
from agenttree.core.execution_runtime import ExecutionFailed
from agenttree.core.execution_store import ExecutionState
from agenttree.orchestration import FinalResult
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.models.run import Run, RunArtifact, TraceEvent
from backend.core.sanitization import sanitize_value
from backend.models.tree import Tree, TreeVersion
from backend.repositories.protocols import RunRepository
from backend.repositories.sqlalchemy import SQLAlchemyRunRepository
from backend.schemas.run import InvocationRequest, LiveExecutionRead, RunArtifactRead, RunDetailRead, RunRead, TestRunRequest, TraceEventRead, TreeLiveRead
from backend.services.destination_service import ResultDeliveryService
from backend.services.execution_backend import RunExecutionBackend, SynchronousExecutionBackend
from backend.services.core_runtime import StudioAgentTreeRuntime, get_studio_runtime
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
        core_runtime: StudioAgentTreeRuntime | None = None,
    ) -> None:
        self._database = database
        self._builder = runtime_builder or RuntimeBuilder(database)
        self._runs = run_repository or SQLAlchemyRunRepository(database)
        self._delivery = delivery_service or ResultDeliveryService(database)
        self._execution = execution_backend
        self._core_runtime = core_runtime or get_studio_runtime()

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
        run = self.prepare(
            tree_id, request, invocation_source=invocation_source,
        )
        return self.execute(run.id)

    def prepare(
        self,
        tree_id: str,
        request: InvocationRequest,
        *,
        invocation_source: str = "api",
        submitted_by_user_id: str | None = None,
        submitted_by_token_id: str | None = None,
    ) -> Run:
        """Validate and persist an immutable-version queued Run without executing it."""
        tree = self._builder.get_tree(tree_id)
        validation = self._builder.validate_tree(tree)
        if not validation.valid:
            first = validation.errors[0]
            raise RunRequestError(first.code, first.message)
        version = tree.current_version
        assert version is not None
        now = datetime.now(timezone.utc)
        run = Run(
            id=str(__import__("uuid").uuid4()),
            tree_id=tree.id,
            tree_version_id=version.id,
            status="pending",
            input_json=sanitize_for_persistence(dict(request.input)),
            metadata_json=sanitize_for_persistence(dict(request.metadata)),
            invocation_source=invocation_source,
            submitted_by_user_id=submitted_by_user_id,
            submitted_by_token_id=submitted_by_token_id,
            started_at=now,
        )
        self._runs.add(run)
        run.core_execution_id = run.id
        self._database.commit()
        return run

    def execute(self, run_id: str, *, timeout_seconds: float | None = None) -> RunDetailRead:
        """Execute a prepared Run; safe for a background worker-owned DB session."""
        run = self._get_model(run_id)
        if run.status == "cancelled":
            return self._read(run, detail=True)
        tree, version = run.tree, run.tree_version
        prepared_input = dict(run.input_json)
        caller_metadata = dict(run.metadata_json or {})
        run.status = "running"
        self._database.commit()

        started = perf_counter()
        bundle: RuntimeBundle | None = None
        stage = "runtime_build"
        try:
            bundle = self._builder.build(tree.id, version.id)
            stage = "execution"
            run.input_json = sanitize_for_persistence(prepared_input, bundle.sensitive_values)
            run.metadata_json = sanitize_for_persistence(caller_metadata, bundle.sensitive_values)
            self._database.commit()
            task = Task(
                id=run.id,
                objective=self._task_objective(tree.name, version, prepared_input),
                context=TaskContext(data=prepared_input),
                metadata={
                    "studio_run_id": run.id,
                    "tree_id": tree.id,
                    "tree_version_id": version.id,
                    "invocation_source": run.invocation_source,
                    "caller_metadata": caller_metadata,
                },
            )
            if self._execution is not None:
                result = self._execution.execute(bundle, task)
            else:
                self._database.refresh(run)
                if run.status == "cancelled":
                    return self._read(run, detail=True)
                handle = self._core_runtime.submit(
                    run.id, bundle, task, timeout=timeout_seconds,
                )
                while True:
                    try:
                        result = handle.result(timeout=0.1)
                        break
                    except TimeoutError:
                        info = handle.status()
                        self._lock_run(run)
                        if run.status not in {"cancelled", "cancellation_requested"}:
                            run.status = (
                                "cancellation_requested"
                                if info.state is ExecutionState.CANCELLATION_REQUESTED
                                else "running"
                            )
                            run.cancellation_requested_at = info.cancellation_requested_at
                        run.metrics_json = sanitize_for_persistence(
                            info.metrics, bundle.sensitive_values,
                        )
                        self._ingest_core_events(
                            run, handle.events(after=self._latest_core_sequence(run), limit=500), bundle,
                        )
                        self._persist_artifact_refs(
                            run, handle.artifacts(), bundle.sensitive_values,
                        )
                        self._database.commit()
            # Cancellation may have been committed by another request while
            # this worker waited for Core. Reload before writing a late result.
            self._lock_run(run)
            if run.status in {"cancelled", "cancellation_requested"}:
                run.status = "cancelled"
                if self._execution is None:
                    self._ingest_core_events(run, handle.events(limit=1000), bundle)
                    self._persist_artifact_refs(run, handle.artifacts(), bundle.sensitive_values)
                return self._read(run, detail=True)
            state = bundle.runtime.last_state
            serialized_state = state.to_dict() if state is not None else None
            run.output_json = sanitize_for_persistence(
                self._format_output(version, result),
                bundle.sensitive_values,
            )
            run.state_json = sanitize_for_persistence(serialized_state, bundle.sensitive_values)
            run.final_status = result.status.value
            run.usage_json = sanitize_for_persistence(result.usage, bundle.sensitive_values)
            if self._execution is None:
                run.metrics_json = sanitize_for_persistence(handle.status().metrics, bundle.sensitive_values)
                self._ingest_core_events(run, handle.events(limit=1000), bundle)
                self._persist_missing_trace(run, result.trace, bundle)
            else:
                self._persist_trace(run, result.trace, bundle.agents_by_id, bundle.sensitive_values)
            artifact_history = handle.artifacts() if self._execution is None else result.artifacts
            self._persist_artifacts(
                run, result, bundle.sensitive_values, artifact_history=artifact_history,
            )
            if result.status.value == "failed":
                run.status = "failed"
                run.error_code = "EXECUTION_ERROR"
                run.error_message = "AgentTree execution failed"
            else:
                # PARTIAL and revision-limit outcomes remain successful Studio
                # completions while final_status preserves the exact Core truth.
                run.status = "completed"
                self._append_public_event(run, "output.final.available", {
                    "run_id": run.id, "final_status": run.final_status,
                })
        except Exception as error:
            self._lock_run(run)
            code, message = self._safe_execution_error(error, stage=stage)
            if run.status in {"cancelled", "cancellation_requested"}:
                run.status = "cancelled"
                run.error_code = None
                run.error_message = None
            else:
                run.status = "failed"
                run.error_code = code
                run.error_message = message
            if bundle is not None:
                state = bundle.runtime.last_state
                if state is not None:
                    run.state_json = sanitize_for_persistence(
                        state.to_dict(), bundle.sensitive_values,
                    )
                    if self._execution is not None:
                        self._persist_trace(run, state.trace, bundle.agents_by_id, bundle.sensitive_values)
                if self._execution is None:
                    try:
                        handle = self._core_runtime.handle(run.id)
                        failure_type = handle.status().failure_type or ""
                        if "authentication" in failure_type.casefold():
                            code, message = "PROVIDER_AUTH_ERROR", "Provider authentication failed"
                            run.error_code, run.error_message = code, message
                        self._ingest_core_events(run, handle.events(limit=1000), bundle)
                        core_state = handle.status().state
                        if core_state is ExecutionState.CANCELLED:
                            run.status = "cancelled"
                            run.error_code = None
                            run.error_message = None
                    except KeyError:
                        pass
        finally:
            if bundle is not None and self._execution is not None:
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
            if bundle is not None and self._execution is None:
                self._core_runtime.release(run.id)
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
    def _format_output(version: TreeVersion, result: FinalResult) -> dict[str, Any]:
        output = version.output
        output_type = output.output_type if output is not None else "structured_json"
        delivery_type = output.delivery_type if output is not None else "show_in_web"
        return {
            "type": output_type,
            "delivery_type": delivery_type,
            "value": result.final_output,
            "success": result.success,
            "core_status": result.status.value,
            "orchestration": result.orchestration,
        }

    def _ingest_core_events(self, run: Run, records, bundle: RuntimeBundle) -> None:
        # Include rows staged by an earlier ingestion pass in the lookup.  This
        # makes overlapping pages idempotent even before the caller commits.
        self._database.flush()
        existing = set(self._database.scalars(select(TraceEvent.core_sequence).where(
            TraceEvent.run_id == run.id, TraceEvent.core_sequence.is_not(None))).all())
        next_sequence = self._database.scalar(select(func.max(TraceEvent.sequence)).where(
            TraceEvent.run_id == run.id,
        )) or 0
        for record in records:
            if record.sequence in existing:
                continue
            next_sequence += 1
            event = record.event
            agent = bundle.agents_by_id.get(event.actor_id) if event.actor_id else None
            self._database.add(TraceEvent(
                run_id=run.id, sequence=next_sequence, core_sequence=record.sequence,
                event_type=event.event_type, agent_id=event.actor_id,
                agent_name=agent.name if agent is not None else None,
                payload_json=sanitize_for_persistence(event.to_dict(), bundle.sensitive_values),
                created_at=event.timestamp,
            ))
            existing.add(record.sequence)

    def _latest_core_sequence(self, run: Run) -> int:
        return self._database.scalar(select(func.max(TraceEvent.core_sequence)).where(
            TraceEvent.run_id == run.id,
        )) or 0

    def _append_public_event(self, run: Run, event_type: str, payload: dict[str, Any]) -> None:
        self._database.flush()
        if self._database.scalar(select(TraceEvent.id).where(
            TraceEvent.run_id == run.id, TraceEvent.event_type == event_type,
        )) is not None:
            return
        core_sequence = self._latest_core_sequence(run) + 1
        sequence = (self._database.scalar(select(func.max(TraceEvent.sequence)).where(
            TraceEvent.run_id == run.id,
        )) or 0) + 1
        self._database.add(TraceEvent(
            run_id=run.id, sequence=sequence, core_sequence=core_sequence,
            event_type=event_type, agent_id=None, agent_name=None,
            payload_json=sanitize_for_persistence(payload),
            created_at=datetime.now(timezone.utc),
        ))

    def _persist_artifact_refs(self, run: Run, refs,
                               sensitive_values: tuple[str, ...]) -> None:
        existing = set(self._database.scalars(select(RunArtifact.core_artifact_id).where(
            RunArtifact.run_id == run.id,
        )))
        for ref in refs:
            if ref.artifact_id in existing:
                continue
            self._database.add(RunArtifact(
                run_id=run.id, core_artifact_id=ref.artifact_id,
                artifact_type=ref.type.value, name=ref.name, logical_path=ref.path,
                operation=ref.operation.value, media_type=ref.media_type,
                size_bytes=ref.size_bytes, sha256=ref.sha256,
                producer_role=ref.producer_role, producer_agent_id=ref.producer_agent_id,
                metadata_json=sanitize_for_persistence(ref.metadata, sensitive_values),
                is_final=False, body_available=ref.operation.value != "delete",
                created_at=ref.created_at,
            ))
            existing.add(ref.artifact_id)

    def _persist_artifacts(self, run: Run, result: FinalResult,
                           sensitive_values: tuple[str, ...], *,
                           artifact_history=None) -> None:
        final_ids = {ref.artifact_id for ref in result.artifacts}
        self._persist_artifact_refs(run, artifact_history if artifact_history is not None else result.artifacts,
                                    sensitive_values)
        self._database.flush()
        for item in self._database.scalars(select(RunArtifact).where(
            RunArtifact.run_id == run.id,
        )):
            item.is_final = item.core_artifact_id in final_ids

    def _persist_missing_trace(self, run: Run, trace: ExecutionTrace,
                               bundle: RuntimeBundle) -> None:
        self._database.flush()
        stored = list(self._database.scalars(select(TraceEvent).where(
            TraceEvent.run_id == run.id)).all())
        existing = {(item.event_type, item.agent_id, self._utc(item.created_at))
                    for item in stored}
        next_sequence = max((item.sequence for item in stored), default=0)
        for event in trace.events:
            identity = (event.event_type, event.actor_id, self._utc(event.timestamp))
            if identity in existing:
                continue
            next_sequence += 1
            agent = bundle.agents_by_id.get(event.actor_id) if event.actor_id else None
            self._database.add(TraceEvent(
                run_id=run.id, sequence=next_sequence, core_sequence=None,
                event_type=event.event_type, agent_id=event.actor_id,
                agent_name=agent.name if agent is not None else None,
                payload_json=sanitize_for_persistence(event.to_dict(), bundle.sensitive_values),
                created_at=event.timestamp,
            ))
            existing.add(identity)
        self._database.flush()
        ordered = sorted(self._database.scalars(select(TraceEvent).where(
            TraceEvent.run_id == run.id)).all(),
            key=lambda item: (self._utc(item.created_at), item.core_sequence or 0, item.id))
        for index, item in enumerate(ordered, start=1):
            item.sequence = -index
        self._database.flush()
        for index, item in enumerate(ordered, start=1):
            item.sequence = index

    def _persist_trace(
        self,
        run: Run,
        trace: ExecutionTrace,
        agents_by_id: dict[str, Any],
        sensitive_values: tuple[str, ...],
    ) -> None:
        if run.trace_events:
            return
        events = trace.events
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

    def _lock_run(self, run: Run) -> None:
        """Serialize terminal writes and cancellation against the same DB row."""
        self._database.execute(
            select(Run).where(Run.id == run.id).with_for_update()
            .execution_options(populate_existing=True)
        ).scalar_one()

    @staticmethod
    def _trace_read(event: TraceEvent) -> TraceEventRead:
        return TraceEventRead(
            id=event.id,
            run_id=event.run_id,
            sequence=event.sequence,
            core_sequence=event.core_sequence,
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
            core_execution_id=run.core_execution_id,
            final_status=run.final_status,
            input=run.input_json,
            metadata=run.metadata_json or {},
            invocation_source=run.invocation_source,
            output=run.output_json,
            error_code=run.error_code,
            error_message=run.error_message,
            started_at=cls._utc(run.started_at),
            finished_at=cls._utc(run.finished_at),
            duration_ms=run.duration_ms,
            usage=run.usage_json,
            metrics=run.metrics_json,
            created_at=cls._utc(run.created_at),
        )
        if detail:
            return RunDetailRead(
                **values,
                state=run.state_json,
                trace=[cls._trace_read(item) for item in run.trace_events],
                delivery_results=[ResultDeliveryService.read(item) for item in run.delivery_results],
                artifacts=[RunArtifactRead(
                    id=item.id, core_artifact_id=item.core_artifact_id,
                    artifact_type=item.artifact_type, name=item.name,
                    logical_path=item.logical_path, operation=item.operation,
                    media_type=item.media_type, size_bytes=item.size_bytes,
                    sha256=item.sha256, producer_role=item.producer_role,
                    producer_agent_id=item.producer_agent_id,
                    metadata=item.metadata_json, is_final=item.is_final,
                    created_at=cls._utc(item.created_at),
                ) for item in run.artifacts],
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

    def cancel_run(self, run_id: str) -> RunDetailRead:
        run = self._get_model(run_id)
        self._lock_run(run)
        if run.status not in {"pending", "running", "cancellation_requested"}:
            return self._read(run, detail=True)
        if run.status == "pending" and not self._core_runtime.is_active(run.core_execution_id or run.id):
            run.status = "cancelled"
            run.cancellation_requested_at = datetime.now(timezone.utc)
            run.finished_at = run.cancellation_requested_at
            self._database.commit()
            return self._read(run, detail=True)
        try:
            info = self._core_runtime.cancel(run.core_execution_id or run.id)
        except KeyError:
            # Runtime construction happens before Core submission. Cancellation
            # during that window is a real pre-execution cancellation; the worker
            # refreshes this row immediately before submitting to Core.
            run.status = "cancelled"
            run.cancellation_requested_at = datetime.now(timezone.utc)
            run.finished_at = run.cancellation_requested_at
            self._database.commit()
            return self._read(run, detail=True)
        run.status = "cancelled" if info.state is ExecutionState.CANCELLED else "cancellation_requested"
        run.cancellation_requested_at = info.cancellation_requested_at or datetime.now(timezone.utc)
        if run.status == "cancelled":
            run.finished_at = info.finished_at or datetime.now(timezone.utc)
        self._database.commit()
        return self._read(run, detail=True)

    def stream_output(self, run_id: str, *, timeout: float | None = None):
        run = self._get_model(run_id)
        return self._core_runtime.stream_output(run.core_execution_id or run.id, timeout=timeout)

    def artifact_metadata(self, run_id: str) -> tuple[RunArtifactRead, ...]:
        self._get_model(run_id)
        artifacts = self._database.scalars(
            select(RunArtifact).where(RunArtifact.run_id == run_id)
            .order_by(RunArtifact.created_at, RunArtifact.id)
        ).all()
        return tuple(RunArtifactRead(
            id=item.id, core_artifact_id=item.core_artifact_id,
            artifact_type=item.artifact_type, name=item.name,
            logical_path=item.logical_path, operation=item.operation,
            media_type=item.media_type, size_bytes=item.size_bytes,
            sha256=item.sha256, producer_role=item.producer_role,
            producer_agent_id=item.producer_agent_id,
            metadata=item.metadata_json, is_final=item.is_final,
            created_at=self._utc(item.created_at),
        ) for item in artifacts)

    def artifact_content(self, run_id: str, artifact_id: str) -> tuple[RunArtifact, bytes]:
        run = self._get_model(run_id)
        artifact = self._database.scalar(select(RunArtifact).where(
            RunArtifact.id == artifact_id, RunArtifact.run_id == run_id,
        ))
        if artifact is None:
            raise ResourceNotFoundError("Artifact not found")
        if artifact.operation == "delete" or not artifact.body_available:
            raise RunRequestError("ARTIFACT_NOT_FOUND", "Artifact content is not available")
        try:
            content = self._core_runtime.artifact(run.core_execution_id or run.id,
                                                  artifact.core_artifact_id)
        except KeyError:
            raise RunRequestError("ARTIFACT_NOT_FOUND", "Artifact content is not available") from None
        except Exception:
            raise RunRequestError("ARTIFACT_CORRUPT", "Artifact content failed integrity validation") from None
        return artifact, content

    def live(self, tree_id: str) -> TreeLiveRead:
        tree = self._database.get(Tree, tree_id)
        if tree is None:
            raise ResourceNotFoundError("Tree not found")
        runs = self._runs.list(tree_id=tree_id)
        executions: list[LiveExecutionRead] = []
        activity: list[TraceEvent] = []
        for run in runs:
            # Trace is persisted per execution; no Tree-global current Agent exists.
            latest = run.trace_events[-1] if run.trace_events else None
            metadata = latest.payload_json.get("metadata", {}) if latest else {}
            if not isinstance(metadata, dict):
                metadata = {}
            executions.append(LiveExecutionRead(
                run=self._read(run),
                current_agent=latest.agent_name if run.status == "running" and latest else None,
                current_stage=latest.event_type if run.status == "running" and latest else None,
                current_tool=str(metadata["tool_name"]) if run.status == "running" and metadata.get("tool_name") else None,
            ))
            activity.extend(run.trace_events)
        activity.sort(key=lambda event: (self._utc(event.created_at), event.run_id, event.sequence), reverse=True)
        return TreeLiveRead(
            tree_id=tree.id,
            tree_name=tree.name,
            # There is no authoritative long-running Tree Runtime controller yet.
            runtime_status="unavailable",
            active_count=sum(run.status == "running" for run in runs),
            queued_count=sum(run.status == "pending" for run in runs),
            completed_count=sum(run.status == "completed" for run in runs),
            failed_count=sum(run.status == "failed" for run in runs),
            executions=executions,
            recent_activity=[self._trace_read(event) for event in activity[:12]],
        )
