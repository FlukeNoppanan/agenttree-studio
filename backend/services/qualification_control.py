"""Bounded, process-local cooperative controls for existing qualification calls."""
from collections import OrderedDict
from contextlib import contextmanager
from threading import Event, RLock

from agenttree.core.execution_control import ExecutionCancelled
from agenttree.providers.traffic import traffic_context

from backend.services.errors import ServiceError

_lock = RLock()
_controls = OrderedDict()
_LIMIT = 256


def _entry(provider_id):
    if provider_id not in _controls:
        if len(_controls) >= _LIMIT:
            idle = next((key for key, item in _controls.items() if not item[1]), None)
            if idle is None:
                raise ServiceError("Qualification controls are busy")
            del _controls[idle]
        _controls[provider_id] = [Event(), 0]
    _controls.move_to_end(provider_id)
    return _controls[provider_id]


def start_qualification(provider_id):
    with _lock:
        entry = _entry(provider_id)
        if entry[1]:
            # An active request owns this token; do not reset its cancellation.
            return
        entry[0] = Event()


def stop_qualification(provider_id):
    with _lock:
        _entry(provider_id)[0].set()


@contextmanager
def qualification_traffic(provider_id, observer=None):
    with _lock:
        entry = _entry(provider_id)
        token = entry[0]
        entry[1] += 1
    def check():
        if token.is_set():
            raise ExecutionCancelled("Qualification stopped")
    try:
        with traffic_context(workload="qualification", check=check, observer=observer):
            yield
    finally:
        with _lock:
            entry[1] -= 1
