"""Studio cookie facade uses V2 Run services without exposing API keys."""

from tests.test_public_api import clients  # noqa: F401
from tests.test_runs import runtime_tree
from backend.services.tree_service import TreeService
from backend.services.async_runs import reconcile_interrupted_runs
from backend.models.run import Run, TraceEvent
from sqlalchemy import select
from datetime import datetime, timezone


def test_active_cancellation_status_fits_database_column(database, monkeypatch):
    from types import SimpleNamespace
    from agenttree.core.execution_store import ExecutionState
    from backend.services.run_service import RunService

    tree, _, _ = runtime_tree(database)
    run = Run(tree_id=tree.id, tree_version_id=tree.version.id,
              status="running", input_json={"input": "test"}, metadata_json={},
              started_at=datetime.now(timezone.utc))
    database.add(run)
    database.commit()
    service = RunService(database)
    monkeypatch.setattr(service._core_runtime, "cancel", lambda _: SimpleNamespace(
        state=ExecutionState.CANCELLATION_REQUESTED,
        cancellation_requested_at=datetime.now(timezone.utc), finished_at=None,
    ))
    result = service.cancel_run(run.id)
    assert result.status == "cancellation_requested"
    assert Run.__table__.c.status.type.length >= len(result.status)


def test_studio_live_submit_status_cancel_and_cookie_boundary(clients, monkeypatch):
    admin, external, factory = clients
    with factory() as database:
        tree, _, _ = runtime_tree(database)
        assert TreeService(database).validate(tree.id, mark_ready=True).valid
        tree_id = tree.id

    submitted = []

    class Coordinator:
        def submit(self, factory, run_id, *, timeout_seconds=None):
            submitted.append(run_id)

    monkeypatch.setattr("backend.api.studio_runs.get_async_run_coordinator", lambda: Coordinator())
    response = admin.post("/api/studio/runs", json={"tree_id": tree_id, "input": "Inspect work"})
    assert response.status_code == 202, response.text
    run_id = response.json()["run_id"]
    assert submitted == [run_id]
    assert admin.get(f"/api/studio/runs/{run_id}").json()["status"] == "queued"
    assert admin.get(f"/api/studio/runs/{run_id}/events").json()["events"] == []
    assert external.get(f"/api/studio/runs/{run_id}").status_code == 401
    assert external.get(f"/api/studio/runs/{run_id}", headers={"Authorization": "Bearer ats_fakefakefake"}).status_code == 401
    cancelled = admin.post(f"/api/studio/runs/{run_id}/cancel")
    assert cancelled.status_code == 200 and cancelled.json()["status"] == "cancelled"
    assert admin.get(f"/api/studio/runs/{run_id}").json()["status"] == "cancelled"


def test_interrupted_run_is_closed_with_durable_recovery_error(database):
    tree, _, _ = runtime_tree(database)
    run = Run(tree_id=tree.id, tree_version_id=tree.version.id,
              status="running", input_json={"input": "test"}, metadata_json={},
              started_at=datetime.now(timezone.utc))
    database.add(run)
    database.commit()
    assert reconcile_interrupted_runs(database) == 1
    database.refresh(run)
    assert run.status == "failed"
    assert run.final_status == "failed"
    assert run.error_code == "RECOVERY_UNAVAILABLE"
    assert run.finished_at is not None
    events = list(database.scalars(select(TraceEvent).where(TraceEvent.run_id == run.id)))
    assert [(item.core_sequence, item.event_type) for item in events] == [(1, "execution.failed")]
    assert reconcile_interrupted_runs(database) == 0


def test_pinned_tree_version_http_selector_remains_authorized_and_scoped(clients):
    admin, external, factory = clients
    with factory() as database:
        service = TreeService(database)
        tree, _, _ = runtime_tree(database)
        other, _, _ = runtime_tree(database)
        tree_id, version_id, other_version_id = tree.id, tree.version.id, other.version.id
    endpoint = f"/api/trees/{tree_id}/version?version_id={version_id}"
    assert admin.get(endpoint).json()["id"] == version_id
    assert external.get(endpoint).status_code == 401
    assert admin.get(f"/api/trees/{tree_id}/version?version_id={other_version_id}").status_code == 404
