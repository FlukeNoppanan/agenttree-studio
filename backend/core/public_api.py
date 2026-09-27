"""Public API error and process-local throttling primitives."""

from collections import deque
from threading import Lock
from time import monotonic


class PublicAPIError(Exception):
    def __init__(self, status_code: int, code: str, message: str):
        self.status_code = status_code
        self.code = code
        self.message = message


_buckets: dict[tuple[str, str], deque[float]] = {}
_lock = Lock()
_connections: dict[str, int] = {}


def rate_limited(kind: str, identity: str, *, limit: int, window: int = 60) -> bool:
    """Separate per-key invocation and per-peer authentication-abuse buckets."""
    current = monotonic()
    bucket_key = kind, identity
    with _lock:
        bucket = _buckets.setdefault(bucket_key, deque())
        while bucket and bucket[0] <= current - window:
            bucket.popleft()
        if len(bucket) >= limit:
            return True
        bucket.append(current)
        return False


def acquire_sse(identity: str, *, limit: int = 4) -> bool:
    with _lock:
        current = _connections.get(identity, 0)
        if current >= limit:
            return False
        _connections[identity] = current + 1
        return True


def release_sse(identity: str) -> None:
    with _lock:
        current = _connections.get(identity, 0)
        if current <= 1:
            _connections.pop(identity, None)
        else:
            _connections[identity] = current - 1
