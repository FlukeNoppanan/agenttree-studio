"""Public API V2 durable resource, cursor, SSE, and artifact contracts."""

from datetime import datetime, timezone
from hashlib import sha256
import json
from threading import Event, Thread
from time import sleep

import pytest
from agenttree.models import ArtifactRef, ArtifactType, FileIntent, Task
from fastapi import Request
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.api.public_v2 import (_async_stream, _stream, get_events, get_result, get_run,
                                   list_artifacts, submit_run)
from backend.core.public_api import PublicAPIError, _connections, acquire_sse
from backend.models.auth import ApiToken, User
from backend.db.base import Base
from backend.models.run import Run, RunArtifact, TraceEvent
from backend.schemas.public_api_v2 import RunSubmitRequest
from backend.schemas.run import InvocationRequest
from backend.services.core_runtime import StudioAgentTreeRuntime
from backend.services.errors import ResourceNotFoundError
from backend.services.run_service import RunService
from backend.services.tree_service import TreeService
from tests.test_runs import runtime_tree, scripted_builder
from tests.test_phase8a_core_runtime import streaming_bundle


def request_for(user_id: str, token_id: str = "token") -> Request:
    request = Request({
        "type": "http", "method": "GET", "scheme": "http",
        "path": "/api/v2/runs", "raw_path": b"/api/v2/runs",
        "query_string": b"", "headers": [], "client": ("test", 1),
        "server": ("test", 80), "state": {},
    })
    request.state.user_id = user_id
    request.state.api_token_id = token_id
    request.state.request_id = "req_test"
    return request


def admin(database) -> User:
    user = User(username="v2admin", username_key="v2admin", password_hash="unused",
                is_admin=True, is_active=True, must_change_password=False)
    database.add(user)
    database.commit()
    return user


def persisted_run(database, *, status="completed"):
    tree, _, _ = runtime_tree(database)
    run = Run(tree_id=tree.id, tree_version_id=tree.version.id, status=status,
              core_execution_id=None, input_json={"input": "safe"}, metadata_json={},
              invocation_source="public_api_v2", started_at=datetime.now(timezone.utc),
              output_json={"value": "final"} if status == "completed" else None,
              final_status="partial" if status == "completed" else None,
              finished_at=datetime.now(timezone.utc) if status == "completed" else None)
    database.add(run)
    database.flush()
    for sequence, kind in enumerate(("execution.queued", "artifact.committed",
                                     "output.final.available", "execution.completed"), 1):
        database.add(TraceEvent(run_id=run.id, sequence=sequence,
            core_sequence=sequence, event_type=kind, payload_json={"safe": True},
            created_at=datetime.now(timezone.utc)))
    database.commit()
    return run


def test_v2_request_bounds_metadata_and_forbids_runtime_injection():
    parsed = RunSubmitRequest(tree_id="tree", input="hello",
                              metadata={"client": "ok", "flags": [1, True]})
    assert parsed.input == "hello"
    with pytest.raises(Exception):
        RunSubmitRequest(tree_id="tree", input="hello", provider_api_key="secret")
    with pytest.raises(Exception):
        RunSubmitRequest(tree_id="tree", input="hello", metadata={"nested": {"x": 1}})
    with pytest.raises(Exception):
        RunSubmitRequest(tree_id="tree", input="hello",
                         metadata={str(index): index for index in range(17)})


def test_v2_submission_is_immediate_version_pinned_and_idempotent(database, monkeypatch):
    user = admin(database)
    token = ApiToken(user_id=user.id, name="v2", token_hash="a" * 64)
    database.add(token)
    tree, _, _ = runtime_tree(database)
    assert TreeService(database).validate(tree.id, mark_ready=True).valid
    database.commit()
    request = request_for(user.id, token.id)

    class Coordinator:
        calls = []
        def submit(self, factory, run_id, *, timeout_seconds=None):
            self.calls.append((run_id, timeout_seconds))

    coordinator = Coordinator()
    monkeypatch.setattr("backend.api.public_v2.get_async_run_coordinator", lambda: coordinator)
    payload = RunSubmitRequest(tree_id=tree.id, input="slow deterministic work",
                               timeout_seconds=60, metadata={"client": "test"})
    accepted = submit_run(payload, request, "retry-key", database)
    assert accepted.status == "queued" and accepted.tree_version_id == tree.version.id
    assert coordinator.calls == [(accepted.run_id, 60)]
    repeated = submit_run(payload, request, "retry-key", database)
    assert repeated.run_id == accepted.run_id and len(coordinator.calls) == 1
    with pytest.raises(PublicAPIError) as conflict:
        submit_run(payload.model_copy(update={"input": "different"}), request,
                   "retry-key", database)
    assert conflict.value.status_code == 409 and conflict.value.code == "idempotency_conflict"


def test_v2_status_result_events_and_cursor_are_dynamic_and_ordered(database):
    user = admin(database)
    run = persisted_run(database)
    request = request_for(user.id)

    state = get_run(run.id, request, database)
    assert state.status == "completed"
    assert state.final_status == "partial" and state.final_output == "final"
    assert state.latest_event_sequence == 4
    result = get_result(run.id, request, database)
    assert result.final_output == "final" and result.final_status == "partial"
    first = get_events(run.id, request, after=0, limit=2, database=database)
    assert [item.sequence for item in first.events] == [1, 2]
    assert first.next_after == 2 and first.has_more
    second = get_events(run.id, request, after=2, limit=100, database=database)
    assert [item.sequence for item in second.events] == [3, 4]
    assert not second.has_more


def test_v2_sse_durable_reconnect_and_multiple_consumers(database_factory):
    with database_factory() as database:
        user = admin(database)
        run = persisted_run(database)
        run_id = run.id
    first = list(_stream(database_factory, run_id, 0, "consumer-a"))
    second = list(_stream(database_factory, run_id, 2, "consumer-b"))
    peer = list(_stream(database_factory, run_id, 0, "consumer-c"))
    assert [line.split("\n", 1)[0] for line in first] == ["id: 1", "id: 2", "id: 3", "id: 4"]
    assert [line.split("\n", 1)[0] for line in second] == ["id: 3", "id: 4"]
    assert peer == first
    assert any("event: artifact.committed" in line for line in first)
    assert any("event: output.final.available" in line for line in first)


@pytest.mark.anyio
@pytest.mark.parametrize("anyio_backend", ["asyncio"])
async def test_v2_sse_disconnect_releases_connection_slot(database_factory):
    with database_factory() as database:
        admin(database)
        run_id = persisted_run(database).id
    identity = "disconnect-test-token"
    assert acquire_sse(identity, limit=1)
    stream = _async_stream(database_factory, run_id, 0, identity)
    assert (await anext(stream)).startswith("id: 1\n")
    await stream.aclose()
    assert identity not in _connections


def test_v2_late_result_does_not_replace_cancelled_run(database_factory):
    with database_factory() as database:
        tree, _, _ = runtime_tree(database)
        builder, _, _ = scripted_builder(database)

        class LateResult:
            def execute(self, bundle, task):
                with database_factory() as cancelling_database:
                    cancelled = RunService(cancelling_database).cancel_run(task.id)
                    assert cancelled.status == "cancelled"
                return bundle.runtime.run(task)

        result = RunService(database, builder, execution_backend=LateResult()).invoke(
            tree.id, InvocationRequest(input={"input": "safe"}),
            invocation_source="public_api_v2",
        )
        database.refresh(database.get(Run, result.id))
        assert result.status == "cancelled"
        assert database.get(Run, result.id).output_json is None


def test_v2_sse_live_delta_arrives_while_running_and_disconnect_does_not_cancel(
        tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'live.db'}",
                           connect_args={"check_same_thread": False})
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    Base.metadata.create_all(engine)
    with factory() as database:
        tree, _, _ = runtime_tree(database)
        run = Run(tree_id=tree.id, tree_version_id=tree.version.id, status="running",
                  core_execution_id=None, input_json={}, metadata_json={},
                  invocation_source="public_api_v2", started_at=datetime.now(timezone.utc))
        database.add(run)
        database.commit()
        run_id = run.id
    started, release = Event(), Event()
    runtime = StudioAgentTreeRuntime(max_workers=1, max_pending=1)
    monkeypatch.setattr("backend.api.public_v2.get_studio_runtime", lambda: runtime)
    blocker_started, blocker_release = Event(), Event()
    blocker = runtime.submit("sse-blocker", streaming_bundle(blocker_started, blocker_release),
                             Task(id="sse-blocker", objective="block"))
    assert blocker_started.wait(2)
    handle = runtime.submit(run_id, streaming_bundle(started, release),
                            Task(id=run_id, objective="stream"))
    stream = _stream(factory, run_id, 0, "live-client")
    received: list[str] = []
    got_delta = Event()

    def consume_one():
        for frame in stream:
            received.append(frame)
            if "event: agent.output.delta" in frame:
                got_delta.set()
                return

    consumer = Thread(target=consume_one)
    consumer.start()
    for _ in range(50):
        if runtime._runtime._output_hubs[run_id]._subscribers:
            break
        sleep(0.02)
    blocker_release.set()
    assert blocker.result(timeout=3).final_output == "live output"
    assert got_delta.wait(3)
    assert handle.status().state.value == "running"
    stream.close()
    assert handle.status().state.value == "running"
    release.set()
    assert handle.result(timeout=5).final_output == "live output"
    consumer.join(2)
    assert any("\"delta\": \"live\"" in frame for frame in received)
    runtime.release(run_id)
    runtime.release("sse-blocker")
    runtime.shutdown()
    engine.dispose()


def test_v2_artifact_body_is_verified_scoped_and_restart_durable(database, tmp_path, monkeypatch):
    monkeypatch.setenv("AGENTTREE_STUDIO_ARTIFACT_ROOT", str(tmp_path / "artifacts"))
    user = admin(database)
    run = persisted_run(database)
    other = persisted_run(database)
    content = b"durable patch\n"
    digest = sha256(content).hexdigest()
    ref = ArtifactRef(digest, run.id, ArtifactType.PATCH, "fix.patch", "../unsafe/fix.patch",
        FileIntent.MODIFY, "text/x-diff", "utf-8", len(content), digest,
        datetime.now(timezone.utc), "specialist", "worker", None, {})
    runtime_a = StudioAgentTreeRuntime(max_workers=1, max_pending=1)
    runtime_a._artifact_store.put(ref, content)
    artifact = RunArtifact(run_id=run.id, core_artifact_id=ref.artifact_id,
        artifact_type=ref.type.value, name=ref.name, logical_path=ref.path,
        operation=ref.operation.value, media_type=ref.media_type,
        size_bytes=ref.size_bytes, sha256=ref.sha256,
        producer_role=ref.producer_role, producer_agent_id=ref.producer_agent_id,
        metadata_json={}, is_final=True, body_available=True, created_at=ref.created_at)
    database.add(artifact)
    run.core_execution_id = run.id
    database.commit()
    runtime_a.shutdown()

    runtime_b = StudioAgentTreeRuntime(max_workers=1, max_pending=1)
    stored, downloaded = RunService(database, core_runtime=runtime_b).artifact_content(run.id, artifact.id)
    assert downloaded == content and sha256(downloaded).hexdigest() == stored.sha256
    with pytest.raises(ResourceNotFoundError):
        RunService(database, core_runtime=runtime_b).artifact_content(other.id, artifact.id)
    assert list_artifacts(run.id, request_for(user.id), database).artifacts[0].path == "../unsafe/fix.patch"
    runtime_b.shutdown()


def test_v2_provider_secret_sentinel_never_enters_run_events_or_public_state(database):
    sentinel = "SUPER_SECRET_PHASE8B_PROVIDER_VALUE"
    tree, _, _ = runtime_tree(database, secret_value=sentinel)
    result = RunService(database, scripted_builder(database)[0]).invoke(
        tree.id, InvocationRequest(
            input={"input": "safe"}, metadata={"client": "safe"},
        ), invocation_source="public_api_v2",
    )
    run = database.get(Run, result.id)
    serialized = json.dumps({
        "run": RunService(database).get(run.id).model_dump(mode="json"),
        "events": [item.payload_json for item in run.trace_events],
        "artifacts": [item.metadata_json for item in run.artifacts],
    }, default=str)
    assert sentinel not in serialized
