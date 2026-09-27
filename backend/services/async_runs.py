"""Bounded process-local dispatch for durable Studio Run resources."""

from concurrent.futures import ThreadPoolExecutor
from threading import BoundedSemaphore, RLock
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm import sessionmaker

from backend.models.run import Run
from backend.services.run_service import RunService


class RuntimeCapacityError(RuntimeError):
    pass


def reconcile_interrupted_runs(database: Session) -> int:
    """Close process-local executions left active by an earlier backend process."""
    runs = list(database.scalars(select(Run).where(Run.status.in_(
        ("pending", "running", "cancellation_requested"),
    ))))
    service = RunService(database)
    for run in runs:
        run.status = "failed"
        run.final_status = "failed"
        run.finished_at = datetime.now(timezone.utc)
        run.error_code = "RECOVERY_UNAVAILABLE"
        run.error_message = "Execution stopped when the backend restarted; active Core recovery is unavailable."
        service._append_public_event(run, "execution.failed", {
            "run_id": run.id, "error_code": run.error_code,
        })
    if runs:
        database.commit()
    return len(runs)


class AsyncRunCoordinator:
    def __init__(self, *, workers: int = 8, pending: int = 32) -> None:
        self._executor = ThreadPoolExecutor(max_workers=workers, thread_name_prefix="studio-v2-run")
        self._capacity = BoundedSemaphore(workers + pending)
        self._closed = False
        self._lock = RLock()

    def submit(self, factory: sessionmaker, run_id: str,
               *, timeout_seconds: float | None = None) -> None:
        with self._lock:
            if self._closed or not self._capacity.acquire(blocking=False):
                raise RuntimeCapacityError("Asynchronous Run capacity is exhausted")
            try:
                future = self._executor.submit(self._execute, factory, run_id, timeout_seconds)
            except Exception:
                self._capacity.release()
                raise
            future.add_done_callback(lambda _: self._capacity.release())

    @staticmethod
    def _execute(factory: sessionmaker, run_id: str,
                 timeout_seconds: float | None) -> None:
        with factory() as database:
            RunService(database).execute(run_id, timeout_seconds=timeout_seconds)

    def shutdown(self) -> None:
        with self._lock:
            self._closed = True
        self._executor.shutdown(wait=True, cancel_futures=False)


_coordinator: AsyncRunCoordinator | None = None
_lock = RLock()


def get_async_run_coordinator() -> AsyncRunCoordinator:
    global _coordinator
    with _lock:
        if _coordinator is None:
            _coordinator = AsyncRunCoordinator()
        return _coordinator


def shutdown_async_run_coordinator() -> None:
    global _coordinator
    with _lock:
        coordinator, _coordinator = _coordinator, None
    if coordinator is not None:
        coordinator.shutdown()
