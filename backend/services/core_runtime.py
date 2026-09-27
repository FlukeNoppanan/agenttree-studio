"""Bounded process-local bridge to AgentTree Core ExecutionRuntime."""

from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from threading import RLock

from agenttree.core import ExecutionRuntime
from agenttree.core.artifact_store import ArtifactStoreError, FileArtifactStore
from agenttree.core.execution_store import TERMINAL
from agenttree.models import Task

from backend.services.runtime_builder import RuntimeBundle
from backend.core.config import settings


@dataclass
class ActiveExecution:
    bundle: RuntimeBundle
    handle: object


class StudioAgentTreeRuntime:
    """Own Core workers and a bounded registry of active Studio Runs.

    Studio persistence is authoritative. Core's in-memory store supplies live
    execution semantics and transient output during this process lifetime.
    """

    def __init__(self, *, max_workers: int = 4, max_pending: int = 32,
                 max_active: int = 64) -> None:
        self._artifact_store = FileArtifactStore(settings.artifact_store_root)
        self._runtime = ExecutionRuntime(
            max_workers=max_workers, max_pending=max_pending,
            artifact_store=self._artifact_store,
        )
        self._active: OrderedDict[str, ActiveExecution] = OrderedDict()
        self._max_active = max_active
        self._lock = RLock()

    def submit(self, run_id: str, bundle: RuntimeBundle, task: Task,
               *, timeout: float | None = None):
        if task.id != run_id:
            raise ValueError("Studio Run ID must equal Core execution ID")
        with self._lock:
            if run_id in self._active:
                raise ValueError("Run is already active")
            self._evict_terminal()
            if len(self._active) >= self._max_active:
                raise RuntimeError("Studio active execution registry is full")
            handle = bundle.runtime.start(task, runtime=self._runtime, timeout=timeout)
            self._active[run_id] = ActiveExecution(bundle, handle)
            return handle

    def handle(self, run_id: str):
        with self._lock:
            active = self._active.get(run_id)
            if active is None:
                raise KeyError(run_id)
            self._active.move_to_end(run_id)
            return active.handle

    def bundle(self, run_id: str) -> RuntimeBundle:
        with self._lock:
            active = self._active.get(run_id)
            if active is None:
                raise KeyError(run_id)
            return active.bundle

    def stream_output(self, run_id: str, *, timeout: float | None = None):
        return self.handle(run_id).stream_output(timeout=timeout)

    def cancel(self, run_id: str):
        return self.handle(run_id).cancel()

    def artifact(self, run_id: str, artifact_id: str) -> bytes:
        """Read durable bytes directly; DB authorization is enforced by callers."""
        return self._artifact_store.get(run_id, artifact_id)

    def is_active(self, run_id: str) -> bool:
        with self._lock:
            return run_id in self._active

    def release(self, run_id: str) -> None:
        with self._lock:
            active = self._active.pop(run_id, None)
        if active is not None:
            for client in active.bundle.mcp_clients:
                try:
                    client.close()
                except Exception:
                    pass

    def inspect_recoverable(self) -> tuple[str, ...]:
        """In-memory Phase 8A executions are intentionally not restart-recoverable."""
        return ()

    def recover(self, run_id: str) -> None:
        raise RuntimeError("Phase 8A process-local executions cannot be recovered after restart")

    def _evict_terminal(self) -> None:
        for run_id, active in tuple(self._active.items()):
            if active.handle.status().state in TERMINAL:
                self.release(run_id)

    def shutdown(self) -> None:
        with self._lock:
            run_ids = tuple(self._active)
        for run_id in run_ids:
            self.release(run_id)
        self._runtime.shutdown()


_studio_runtime: StudioAgentTreeRuntime | None = None
_singleton_lock = RLock()


def get_studio_runtime() -> StudioAgentTreeRuntime:
    global _studio_runtime
    with _singleton_lock:
        if _studio_runtime is None:
            _studio_runtime = StudioAgentTreeRuntime()
        return _studio_runtime


def shutdown_studio_runtime() -> None:
    global _studio_runtime
    with _singleton_lock:
        runtime, _studio_runtime = _studio_runtime, None
    if runtime is not None:
        runtime.shutdown()
