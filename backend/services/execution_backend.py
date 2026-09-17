"""Execution boundary ready for a future queue/worker implementation."""

from typing import Any, Protocol

from agenttree.models import Task

from backend.services.runtime_builder import RuntimeBundle


class RunExecutionBackend(Protocol):
    def execute(self, bundle: RuntimeBundle, task: Task) -> Any: ...


class SynchronousExecutionBackend:
    """Current in-request execution; one freshly built runtime belongs to one Run."""

    def execute(self, bundle: RuntimeBundle, task: Task) -> Any:
        return bundle.runtime.run(task)
