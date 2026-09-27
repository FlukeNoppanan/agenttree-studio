"""Studio cookie facade uses V2 Run services without exposing API keys."""

from tests.test_public_api import clients  # noqa: F401
from tests.test_runs import runtime_tree
from backend.services.tree_service import TreeService
from backend.services.async_runs import reconcile_interrupted_runs
from backend.models.run import Run, TraceEvent
from sqlalchemy import select
from datetime import datetime, timezone


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
