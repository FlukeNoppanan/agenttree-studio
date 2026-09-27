"""Asynchronous, resource-oriented bearer-only Public API V2."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
from queue import Empty, Full, Queue
import re
from threading import Event, RLock, Thread
from time import monotonic
from typing import Any, Iterator

import anyio

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from backend.core.config import settings
from backend.core.public_api import PublicAPIError, acquire_sse, release_sse
from backend.db.session import get_db
from backend.models.auth import User
from backend.models.run import Run, RunArtifact, RunIdempotency, TraceEvent
from backend.schemas.public_api import PublicError
from backend.schemas.public_api_v2 import (
    ArtifactList, ArtifactSummary, CancelResponse, EventPage, PublicEvent,
    RunAccepted, RunLinks, RunResult, RunState, RunSubmitRequest,
)
from backend.schemas.run import InvocationRequest
from backend.services.async_runs import RuntimeCapacityError, get_async_run_coordinator
from backend.services.auth_service import AuthService
from backend.services.core_runtime import get_studio_runtime
from backend.services.run_service import RunService
from backend.api.public_v1 import accessible_tree


bearer_docs = HTTPBearer(auto_error=False, description="Personal API key from Account → API Keys (ats_…)")
router = APIRouter(prefix="/api/v2", tags=["Public API v2"])
_idempotency_lock = RLock()
TERMINAL = {"completed", "failed", "cancelled"}


def public_user(request: Request, database: Session) -> User:
    user = database.get(User, getattr(request.state, "user_id", None))
    if user is None or not user.is_active:
        raise PublicAPIError(401, "invalid_api_key", "A valid API key is required.")
    return user


def authorized_run(database: Session, user: User, run_id: str) -> Run:
    run = database.get(Run, run_id)
    if run is None or not AuthService(database).can_use_tree(user, run.tree_id):
        raise PublicAPIError(404, "run_not_found", "The requested Run is not available.")
    return run


def api_status(status: str) -> str:
    return "queued" if status == "pending" else status


def links(run_id: str) -> RunLinks:
    base = f"/api/v2/runs/{run_id}"
    return RunLinks(self=base, events=f"{base}/events", stream=f"{base}/stream",
                    result=f"{base}/result", artifacts=f"{base}/artifacts",
                    cancel=f"{base}/cancel")


def artifact_read(item: RunArtifact) -> ArtifactSummary:
    return ArtifactSummary(
        artifact_id=item.id, type=item.artifact_type, name=item.name,
        path=item.logical_path, operation=item.operation, media_type=item.media_type,
        size_bytes=item.size_bytes, sha256=item.sha256,
        producer_role=item.producer_role, producer_agent_id=item.producer_agent_id,
        is_final=item.is_final, body_available=item.body_available,
        created_at=RunService._utc(item.created_at),
    )


def latest_sequence(database: Session, run_id: str) -> int:
    return database.scalar(select(func.max(TraceEvent.core_sequence)).where(
        TraceEvent.run_id == run_id, TraceEvent.core_sequence.is_not(None),
    )) or 0


def run_read(database: Session, run: Run) -> RunState:
    output = run.output_json or {}
    return RunState(
        run_id=run.id, tree_id=run.tree_id, tree_version_id=run.tree_version_id,
        status=api_status(run.status), final_status=run.final_status,
        created_at=RunService._utc(run.created_at),
        started_at=RunService._utc(run.started_at) if run.status != "pending" else None,
        finished_at=RunService._utc(run.finished_at),
        cancellation_requested=run.cancellation_requested_at is not None,
        cancellation_requested_at=RunService._utc(run.cancellation_requested_at),
        usage=run.usage_json, metrics=run.metrics_json,
        error=({"code": (run.error_code or "execution_failed").lower(),
                "message": run.error_message or "AgentTree execution failed."}
               if run.status == "failed" else None),
        artifact_count=database.scalar(select(func.count()).select_from(RunArtifact).where(
            RunArtifact.run_id == run.id,
        )) or 0,
        latest_event_sequence=latest_sequence(database, run.id),
        final_output=output.get("value") if run.status in TERMINAL else None,
        links=links(run.id),
    )


def _canonical_submission(payload: RunSubmitRequest) -> str:
    raw = json.dumps(payload.model_dump(mode="json"), sort_keys=True,
                     separators=(",", ":"), ensure_ascii=False)
    return sha256(raw.encode()).hexdigest()


@router.post("/runs", status_code=202, response_model=RunAccepted,
             dependencies=[Depends(bearer_docs)],
             responses={401: {"model": PublicError}, 404: {"model": PublicError},
                        409: {"model": PublicError}, 422: {"model": PublicError},
                        429: {"model": PublicError}, 503: {"model": PublicError}})
def submit_run(payload: RunSubmitRequest, request: Request,
               idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
               database: Session = Depends(get_db)) -> RunAccepted:
    user = public_user(request, database)
    tree = accessible_tree(database, user, payload.tree_id)
    if tree.status != "ready" or tree.current_version is None or tree.current_version.status != "ready":
        raise PublicAPIError(409, "tree_not_ready", "The requested Tree is not ready.")
    if idempotency_key is not None and not re.fullmatch(r"[A-Za-z0-9._:-]{1,128}", idempotency_key):
        raise PublicAPIError(422, "invalid_idempotency_key", "Idempotency-Key is invalid.")
    token_id = request.state.api_token_id
    request_hash = _canonical_submission(payload)
    now = datetime.now(timezone.utc)
    with _idempotency_lock:
        mapping = None
        key_hash = sha256(idempotency_key.encode()).hexdigest() if idempotency_key else None
        if key_hash:
            mapping = database.scalar(select(RunIdempotency).where(
                RunIdempotency.api_token_id == token_id,
                RunIdempotency.action == "run.submit",
                RunIdempotency.key_hash == key_hash,
            ))
            if mapping is not None:
                expires = mapping.expires_at
                if expires.tzinfo is None:
                    expires = expires.replace(tzinfo=timezone.utc)
                if expires <= now:
                    database.delete(mapping)
                    database.flush()
                    mapping = None
            if mapping is not None:
                if mapping.request_hash != request_hash:
                    raise PublicAPIError(409, "idempotency_conflict",
                                         "Idempotency-Key was used with a different request.")
                existing = database.get(Run, mapping.run_id)
                if existing is not None:
                    return RunAccepted(run_id=existing.id, tree_id=existing.tree_id,
                        tree_version_id=existing.tree_version_id, status=api_status(existing.status),
                        created_at=existing.created_at, links=links(existing.id))
        run = RunService(database).prepare(
            tree.id, InvocationRequest(input={"input": payload.input},
                                       metadata=payload.metadata.model_dump()),
            invocation_source="public_api_v2", submitted_by_user_id=user.id,
            submitted_by_token_id=token_id,
        )
        if key_hash:
            database.add(RunIdempotency(
                api_token_id=token_id, run_id=run.id, action="run.submit",
                key_hash=key_hash, request_hash=request_hash,
                expires_at=now + timedelta(hours=24),
            ))
        AuthService(database).event("public_api_v2.run_submitted", user, user)
        database.commit()
        factory = sessionmaker(bind=database.get_bind(), autoflush=False, expire_on_commit=False)
        try:
            get_async_run_coordinator().submit(
                factory, run.id, timeout_seconds=payload.timeout_seconds,
            )
        except RuntimeCapacityError:
            database.delete(run)
            database.commit()
            raise PublicAPIError(503, "runtime_capacity", "Run capacity is temporarily exhausted.") from None
    return RunAccepted(run_id=run.id, tree_id=run.tree_id,
                       tree_version_id=run.tree_version_id, status="queued",
                       created_at=run.created_at, links=links(run.id))


@router.get("/runs/{run_id}", response_model=RunState,
            dependencies=[Depends(bearer_docs)], responses={404: {"model": PublicError}})
def get_run(run_id: str, request: Request, database: Session = Depends(get_db)) -> RunState:
    return run_read(database, authorized_run(database, public_user(request, database), run_id))


@router.get("/runs/{run_id}/result", response_model=RunResult,
            dependencies=[Depends(bearer_docs)], responses={404: {"model": PublicError},
                                                            409: {"model": PublicError}})
def get_result(run_id: str, request: Request, database: Session = Depends(get_db)) -> RunResult:
    run = authorized_run(database, public_user(request, database), run_id)
    if run.status not in TERMINAL:
        raise PublicAPIError(409, "run_not_terminal", "The Run has not reached a terminal state.")
    artifacts = list(database.scalars(select(RunArtifact).where(
        RunArtifact.run_id == run.id,
    ).order_by(RunArtifact.created_at, RunArtifact.id)))
    return RunResult(run_id=run.id, status=api_status(run.status),
                     final_output=(run.output_json or {}).get("value"),
                     final_status=run.final_status, usage=run.usage_json,
                     metrics=run.metrics_json,
                     artifacts=[artifact_read(item) for item in artifacts])


@router.get("/runs/{run_id}/events", response_model=EventPage,
            dependencies=[Depends(bearer_docs)], responses={404: {"model": PublicError}})
def get_events(run_id: str, request: Request, after: int = Query(default=0, ge=0),
               limit: int = Query(default=100, ge=1, le=500),
               database: Session = Depends(get_db)) -> EventPage:
    authorized_run(database, public_user(request, database), run_id)
    rows = list(database.scalars(select(TraceEvent).where(
        TraceEvent.run_id == run_id, TraceEvent.core_sequence.is_not(None),
        TraceEvent.core_sequence > after,
    ).order_by(TraceEvent.core_sequence).limit(limit + 1)))
    page = rows[:limit]
    return EventPage(events=[PublicEvent(
        sequence=item.core_sequence, type=item.event_type,
        agent_id=item.agent_id, agent_name=item.agent_name,
        payload=item.payload_json, created_at=RunService._utc(item.created_at),
    ) for item in page], next_after=page[-1].core_sequence if page else after,
        has_more=len(rows) > limit)


def _sse_type(event_type: str) -> str:
    if event_type == "artifact.committed":
        return "artifact.committed"
    if event_type == "output.final.available":
        return event_type
    return {
        "execution.queued": "run.status",
        "execution.started": "run.status",
        "execution.completed": "run.completed",
        "execution.failed": "run.failed",
        "execution.cancelled": "run.cancelled",
    }.get(event_type, "execution.event")


def _frame(event: str, data: dict[str, Any], event_id: int | None = None) -> str:
    prefix = f"id: {event_id}\n" if event_id is not None else ""
    return prefix + f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"


def _stream(factory: sessionmaker, run_id: str, cursor: int,
            identity: str) -> Iterator[str]:
    stop = Event()
    deltas: Queue[Any] = Queue(maxsize=64)
    local_dropped = 0

    def pump() -> None:
        nonlocal local_dropped
        runtime = get_studio_runtime()
        while not stop.is_set():
            try:
                for delta in runtime.stream_output(run_id, timeout=1.0):
                    if stop.is_set():
                        return
                    try:
                        deltas.put_nowait(delta)
                    except Full:
                        local_dropped += 1
                        try:
                            deltas.get_nowait()
                        except Empty:
                            pass
                        try:
                            deltas.put_nowait(delta)
                        except Full:
                            pass
                with factory() as db:
                    run = db.get(Run, run_id)
                    if run is None or run.status in TERMINAL:
                        return
            except KeyError:
                with factory() as db:
                    run = db.get(Run, run_id)
                    if run is None or run.status in TERMINAL:
                        return
                stop.wait(0.05)

    output_thread = Thread(target=pump, daemon=True, name=f"studio-sse-{run_id[:8]}")
    output_thread.start()
    last_heartbeat = monotonic()
    first_pass = True
    try:
        while True:
            sent = False
            with factory() as db:
                rows = list(db.scalars(select(TraceEvent).where(
                    TraceEvent.run_id == run_id,
                    TraceEvent.core_sequence.is_not(None),
                    TraceEvent.core_sequence > cursor,
                ).order_by(TraceEvent.core_sequence).limit(100)))
                run = db.get(Run, run_id)
                latest = latest_sequence(db, run_id)
            if first_pass:
                first_pass = False
                if run is not None and run.status not in TERMINAL:
                    yield ": connected\n\n"
            for item in rows:
                cursor = item.core_sequence
                data = {"run_id": run_id, "sequence": cursor,
                        "type": item.event_type, "agent_id": item.agent_id,
                        "agent_name": item.agent_name, "payload": item.payload_json,
                        "created_at": RunService._utc(item.created_at)}
                yield _frame(_sse_type(item.event_type), data, cursor)
                sent = True
            while True:
                try:
                    delta = deltas.get_nowait()
                except Empty:
                    break
                dropped = delta.dropped_before + local_dropped
                local_dropped = 0
                yield _frame("agent.output.delta", {
                    "run_id": run_id, "role": delta.role, "agent_id": delta.agent_id,
                    "operation_id": delta.operation_id, "attempt": delta.attempt,
                    "sequence": delta.sequence, "delta": delta.delta,
                    "dropped_before": dropped, "created_at": delta.timestamp,
                })
                sent = True
            if run is None or run.status in TERMINAL and cursor >= latest:
                return
            if not sent and monotonic() - last_heartbeat >= 15:
                yield ": heartbeat\n\n"
                last_heartbeat = monotonic()
            stop.wait(0.1)
    finally:
        stop.set()
        output_thread.join(timeout=1.2)
        release_sse(identity)


async def _async_stream(factory: sessionmaker, run_id: str, cursor: int,
                        identity: str):
    """Close the synchronous subscriber when an ASGI client disconnects."""
    iterator = _stream(factory, run_id, cursor, identity)

    def next_frame() -> str | None:
        try:
            return next(iterator)
        except StopIteration:
            return None

    try:
        while True:
            frame = await anyio.to_thread.run_sync(next_frame)
            if frame is None:
                return
            yield frame
    finally:
        with anyio.CancelScope(shield=True):
            await anyio.to_thread.run_sync(iterator.close)


@router.get("/runs/{run_id}/stream", dependencies=[Depends(bearer_docs)],
            response_class=StreamingResponse,
            responses={200: {"content": {"text/event-stream": {}}},
                       404: {"model": PublicError}, 429: {"model": PublicError}})
def stream_run(run_id: str, request: Request,
               after: int | None = Query(default=None, ge=0),
               last_event_id: str | None = Header(default=None, alias="Last-Event-ID"),
               database: Session = Depends(get_db)) -> StreamingResponse:
    authorized_run(database, public_user(request, database), run_id)
    header_cursor = 0
    if last_event_id:
        if not last_event_id.isdigit():
            raise PublicAPIError(422, "invalid_cursor", "Last-Event-ID must be a durable sequence.")
        header_cursor = int(last_event_id)
    cursor = after if after is not None else header_cursor
    identity = request.state.api_token_id
    if not acquire_sse(identity, limit=4):
        raise PublicAPIError(429, "rate_limited", "Too many concurrent SSE connections.")
    factory = sessionmaker(bind=database.get_bind(), autoflush=False, expire_on_commit=False)
    return StreamingResponse(_async_stream(factory, run_id, cursor, identity), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"})


@router.post("/runs/{run_id}/cancel", response_model=CancelResponse,
             dependencies=[Depends(bearer_docs)], responses={404: {"model": PublicError}})
def cancel_run(run_id: str, request: Request,
               database: Session = Depends(get_db)) -> CancelResponse:
    user = public_user(request, database)
    authorized_run(database, user, run_id)
    result = RunService(database).cancel_run(run_id)
    AuthService(database).event("public_api_v2.run_cancelled", user, user)
    database.commit()
    return CancelResponse(run_id=run_id, status=api_status(result.status.value),
                          cancellation_requested=result.status.value in {
                              "cancellation_requested", "cancelled",
                          })


@router.get("/runs/{run_id}/artifacts", response_model=ArtifactList,
            dependencies=[Depends(bearer_docs)], responses={404: {"model": PublicError}})
def list_artifacts(run_id: str, request: Request,
                   database: Session = Depends(get_db)) -> ArtifactList:
    authorized_run(database, public_user(request, database), run_id)
    rows = database.scalars(select(RunArtifact).where(
        RunArtifact.run_id == run_id,
    ).order_by(RunArtifact.created_at, RunArtifact.id)).all()
    return ArtifactList(artifacts=[artifact_read(item) for item in rows])


def _download_name(item: RunArtifact) -> str:
    candidate = (item.logical_path or item.name or "artifact").replace("\\", "/").split("/")[-1]
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", candidate).strip("._")[:100]
    return safe or f"artifact-{item.id[:8]}"


@router.get("/runs/{run_id}/artifacts/{artifact_id}", dependencies=[Depends(bearer_docs)],
            responses={200: {"content": {"application/octet-stream": {}}},
                       404: {"model": PublicError}, 409: {"model": PublicError}})
def get_artifact(run_id: str, artifact_id: str, request: Request,
                 database: Session = Depends(get_db)) -> Response:
    authorized_run(database, public_user(request, database), run_id)
    artifact, content = RunService(database).artifact_content(run_id, artifact_id)
    if len(content) > settings.max_artifact_bytes or sha256(content).hexdigest() != artifact.sha256:
        raise PublicAPIError(409, "artifact_corrupt", "Artifact content failed integrity validation.")
    media_type = artifact.media_type if re.fullmatch(r"[A-Za-z0-9!#$&^_.+-]+/[A-Za-z0-9!#$&^_.+-]+", artifact.media_type) else "application/octet-stream"
    return Response(content=content, media_type=media_type, headers={
        "Content-Disposition": f'attachment; filename="{_download_name(artifact)}"',
        "X-Content-Type-Options": "nosniff", "Digest": f"sha-256={artifact.sha256}",
    })
