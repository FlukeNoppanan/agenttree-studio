"""Public API HTTP boundary, dynamic grants and safe serialized contracts."""

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.core import authz
from backend.core.public_api import _buckets
from backend.db.session import get_db
from backend.main import app
from backend.models.auth import ApiToken, SecurityEvent, User
from backend.models.run import Run, TraceEvent
from backend.models.tree import AgentConfig, Tree, TreeVersion
from backend.services.auth_service import AuthService


@pytest.fixture
def clients(database_factory, monkeypatch):
    monkeypatch.setattr(authz, "SessionLocal", database_factory)
    _buckets.clear()

    def override():
        with database_factory() as database:
            yield database

    app.dependency_overrides[get_db] = override
    with database_factory() as database:
        AuthService(database).bootstrap("apiadmin", "strong-admin-password-2026")
    admin, external = TestClient(app), TestClient(app)
    assert admin.post("/api/auth/login", json={"username": "apiadmin", "password": "strong-admin-password-2026"}).status_code == 200
    yield admin, external, database_factory
    admin.close()
    external.close()
    app.dependency_overrides.clear()
    _buckets.clear()


def make_tree(factory, name, *, ready=True):
    with factory() as db:
        tree = Tree(name=name, description="Safe public description", status="ready" if ready else "draft")
        db.add(tree)
        db.flush()
        version = TreeVersion(tree_id=tree.id, version_number=2, status="ready" if ready else "draft")
        db.add(version)
        db.flush()
        db.add(AgentConfig(tree_version_id=version.id, agent_type="root", name="Root", capabilities_json=["triage"]))
        tree.current_version_id = version.id
        db.commit()
        return tree.id, version.id


def make_member(admin, external, trees):
    user = admin.post("/api/users", json={"username": "api_member", "password": "member-strong-password-2026",
                                           "permissions": ["use_trees"], "allowed_tree_ids": trees}).json()
    assert external.post("/api/auth/login", json={"username": "api_member", "password": "member-strong-password-2026"}).status_code == 200
    assert external.post("/api/auth/change-password", json={"current_password": "member-strong-password-2026",
                                                               "new_password": "member-new-password-2026"}).status_code == 200
    key = external.post("/api/auth/tokens", json={"name": "external"}).json()
    external.cookies.clear()
    return user, key, {"Authorization": f"Bearer {key['token']}"}


def test_public_auth_discovery_grants_and_revocation(clients):
    admin, external, factory = clients
    a, _ = make_tree(factory, "Allowed")
    b, _ = make_tree(factory, "Later revoked")
    draft, _ = make_tree(factory, "Draft", ready=False)
    user, key, headers = make_member(admin, external, [a, b, draft])
    assert external.get("/api/v1/health").json() == {"status": "ok", "api_version": "v1"}
    assert external.get("/api/v1/me").status_code == 401
    me = external.get("/api/v1/me", headers=headers)
    assert me.status_code == 200 and me.json()["tree_access"] == {"mode": "selected", "count": 2}
    assert me.headers["x-request-id"].startswith("req_")
    assert {row["id"] for row in external.get("/api/v1/trees", headers=headers).json()["data"]} == {a, b}
    assert external.get(f"/api/v1/trees/{a}", headers=headers).json()["agents"]["root"] == 1
    assert external.get(f"/api/v1/trees/{draft}", headers=headers).status_code == 404
    admin.put(f"/api/users/{user['id']}", json={"allowed_tree_ids": [a]})
    assert {row["id"] for row in external.get("/api/v1/trees", headers=headers).json()["data"]} == {a}
    assert external.get(f"/api/v1/trees/{b}", headers=headers).status_code == 404
    assert external.post(f"/api/v1/trees/{b}/invoke", headers=headers, json={"input": "hello"}).status_code == 404
    with factory() as db:
        record = db.get(ApiToken, key["id"])
        assert record.last_used_at is not None and record.token_hash != key["token"]
        assert key["token"] not in str(db.scalars(select(SecurityEvent)).all())
    admin.put(f"/api/users/{user['id']}", json={"tree_access_mode": "all"})
    assert {row["id"] for row in external.get("/api/v1/trees", headers=headers).json()["data"]} == {a, b}
    admin.put(f"/api/users/{user['id']}", json={"permissions": []})
    assert external.get("/api/v1/trees", headers=headers).json() == {"data": []}
    admin.put(f"/api/users/{user['id']}", json={"permissions": ["use_trees"]})
    admin.put(f"/api/users/{user['id']}", json={"is_active": False})
    assert external.get("/api/v1/me", headers=headers).status_code == 401
    admin.put(f"/api/users/{user['id']}", json={"is_active": True})
    with factory() as db:
        db.get(ApiToken, key["id"]).revoked_at = datetime.now(timezone.utc)
        db.commit()
    assert external.get("/api/v1/me", headers=headers).status_code == 401


def test_v2_run_reads_follow_current_tree_grant_and_request_id(clients):
    admin, external, factory = clients
    tree_id, version_id = make_tree(factory, "V2 access")
    user, key, headers = make_member(admin, external, [tree_id])
    with factory() as database:
        run = Run(tree_id=tree_id, tree_version_id=version_id, status="completed",
                  core_execution_id=None, input_json={"input": "safe"}, metadata_json={},
                  invocation_source="public_api_v2", started_at=datetime.now(timezone.utc),
                  finished_at=datetime.now(timezone.utc), output_json={"value": "root result"})
        database.add(run)
        database.flush()
        for sequence, kind in enumerate(("execution.queued", "output.final.available", "execution.completed"), 1):
            database.add(TraceEvent(run_id=run.id, sequence=sequence, core_sequence=sequence,
                                    event_type=kind, payload_json={}, created_at=datetime.now(timezone.utc)))
        database.commit()
        run_id = run.id

    response = external.get(f"/api/v2/runs/{run_id}", headers={**headers, "X-Request-ID": "client-42"})
    assert response.status_code == 200
    assert response.json()["final_output"] == "root result"
    assert response.headers["x-request-id"] == "client-42"
    assert external.get(f"/api/v2/runs/{run_id}/events", headers=headers).status_code == 200
    assert external.get(f"/api/v2/runs/{run_id}/artifacts", headers=headers).status_code == 200
    replay = external.get(f"/api/v2/runs/{run_id}/stream",
                          headers={**headers, "Last-Event-ID": "1"})
    assert replay.status_code == 200
    assert "id: 1\n" not in replay.text
    assert "id: 2\n" in replay.text and "id: 3\n" in replay.text
    schema = external.get("/openapi.json").json()
    assert "/api/v2/runs/{run_id}/stream" in schema["paths"]
    admin.put(f"/api/users/{user['id']}", json={"allowed_tree_ids": []})
    for suffix in ("", "/result", "/events", "/artifacts", "/stream"):
        denied = external.get(f"/api/v2/runs/{run_id}{suffix}", headers=headers)
        assert denied.status_code == 404
        assert denied.json()["error"]["request_id"] == denied.headers["x-request-id"]
    with factory() as database:
        database.get(ApiToken, key["id"]).revoked_at = datetime.now(timezone.utc)
        database.commit()
    assert external.get(f"/api/v2/runs/{run_id}", headers=headers).status_code == 401


@pytest.mark.parametrize("header", [None, "Basic abc", "Bearer wrong", "Bearer ats_short"])
def test_public_bad_auth_is_safe(clients, header):
    _, external, _ = clients
    response = external.get("/api/v1/trees", headers={"Authorization": header} if header else {})
    assert response.status_code == 401
    assert response.json()["error"]["request_id"] == response.headers["x-request-id"]
    assert "ats_" not in response.text


def test_public_run_access_and_validation(clients):
    admin, external, factory = clients
    a, version = make_tree(factory, "Allowed")
    b, other_version = make_tree(factory, "Hidden")
    _, _, headers = make_member(admin, external, [a])
    with factory() as db:
        for tree_id, version_id in [(a, version), (b, other_version)]:
            run = Run(tree_id=tree_id, tree_version_id=version_id, status="completed",
                      input_json={"input": "hello"}, output_json={"type": "text", "value": "done"},
                      started_at=datetime.now(timezone.utc), finished_at=datetime.now(timezone.utc), duration_ms=12)
            db.add(run)
            db.flush()
            if tree_id == a:
                allowed_run = run.id
            else:
                hidden_run = run.id
        db.commit()
    response = external.get(f"/api/v1/runs/{allowed_run}", headers=headers)
    assert response.status_code == 200 and response.json()["output"] == {"type": "text", "content": "done"}
    assert external.get(f"/api/v1/runs/{hidden_run}", headers=headers).status_code == 404
    assert external.get("/api/v1/runs/nonexistent", headers=headers).status_code == 404
    assert external.post(f"/api/v1/trees/{a}/invoke", headers=headers, json={"input": ""}).status_code == 422
    assert external.post(f"/api/v1/trees/{a}/invoke", headers=headers, json={"input": "hi", "metadata": {"evil": "x"}}).status_code == 422
    assert external.post(f"/api/v1/trees/{a}/invoke", headers=headers, json={"input": "hi", "metadata": {"client_request_id": "ok"}}).status_code in {200, 422}


def test_public_cors_csrf_and_request_id(clients, monkeypatch):
    admin, external, factory = clients
    a, _ = make_tree(factory, "Allowed")
    _, _, headers = make_member(admin, external, [a])
    assert external.get("/api/v1/me", headers={**headers, "X-Request-ID": "client-123"}).headers["x-request-id"] == "client-123"
    assert external.get("/api/v1/me", headers={**headers, "X-Request-ID": "bad space"}).headers["x-request-id"].startswith("req_")
    assert external.get("/api/v1/me", headers={**headers, "Origin": "http://evil.example"}).headers.get("access-control-allow-origin") is None
    assert external.get("/api/v1/me", headers={**headers, "Origin": "http://localhost:5173"}).headers["access-control-allow-origin"] == "http://localhost:5173"
    assert admin.post("/api/auth/tokens", json={"name": "csrf-check"}, headers={"Origin": "http://evil.example"}).status_code == 403
    assert external.get("/api/v1/me", cookies={"studio_session": "fake"}).status_code == 401
    monkeypatch.setenv("AGENTTREE_PUBLIC_API_CORS_ORIGINS", "http://localhost:3000")
    preflight = external.options("/api/v1/trees", headers={"Origin": "http://localhost:3000",
                                                          "Access-Control-Request-Method": "GET",
                                                          "Access-Control-Request-Headers": "Authorization"})
    assert preflight.status_code == 204
    assert preflight.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "access-control-allow-credentials" not in preflight.headers
    assert external.get("/api/v1/me", headers={**headers, "Origin": "http://localhost:3000"}).headers["access-control-allow-origin"] == "http://localhost:3000"
    assert admin.get("/api/auth/me", headers={"Origin": "http://localhost:3000"}).headers.get("access-control-allow-origin") is None


def test_public_invocation_rate_limit_is_per_key(clients):
    admin, external, factory = clients
    a, _ = make_tree(factory, "Allowed")
    _, _, headers = make_member(admin, external, [a])
    for _ in range(30):
        assert external.post(f"/api/v1/trees/{a}/invoke", headers=headers, json={"input": "hi"}).status_code == 422
    blocked = external.post(f"/api/v1/trees/{a}/invoke", headers=headers, json={"input": "hi"})
    assert blocked.status_code == 429 and blocked.json()["error"]["code"] == "rate_limited"
    assert external.get("/api/v1/me", headers=headers).status_code == 200


def test_public_openapi_and_internal_error_are_safe(clients, monkeypatch):
    from backend.api import public_v1

    admin, external, factory = clients
    a, _ = make_tree(factory, "Allowed")
    _, _, headers = make_member(admin, external, [a])
    document = app.openapi()
    assert "security" not in document["paths"]["/api/v1/health"]["get"]
    assert document["paths"]["/api/v1/me"]["get"]["security"]
    assert "Public API v1" in document["paths"]["/api/v1/trees"]["get"]["tags"]
    assert "token_hash" not in str(document["components"]["schemas"]["PublicMe"])

    def fail(*_args, **_kwargs):
        raise RuntimeError("private-provider-credential")

    monkeypatch.setattr(public_v1, "public_user", fail)
    client = TestClient(app, raise_server_exceptions=False)
    response = client.get("/api/v1/me", headers=headers)
    client.close()
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "internal_error"
    assert "private-provider-credential" not in response.text


def test_public_invocation_uses_real_run_and_trace_pipeline(clients, monkeypatch):
    from backend.api import public_v1
    from backend.services.run_service import RunService
    from backend.services.tree_service import TreeService
    from test_runs import runtime_tree, scripted_builder

    admin, external, factory = clients
    with factory() as db:
        tree, _, _ = runtime_tree(db)
        validation = TreeService(db).validate(tree.id, mark_ready=True)
        assert validation.valid
        tree_id = tree.id
    _, _, headers = make_member(admin, external, [tree_id])
    monkeypatch.setattr(public_v1, "RunService", lambda db: RunService(db, scripted_builder(db)[0]))
    invoked = external.post(f"/api/v1/trees/{tree_id}/invoke", headers=headers,
                            json={"input": "Inspect network logs", "metadata": {"client_request_id": "playground-123"}})
    assert invoked.status_code == 200, invoked.text
    result = invoked.json()
    assert result["status"] == "completed" and result["output"] == {
        "type": "text", "content": "Network analysis complete",
    }
    run_id = result["run_id"]
    retrieved = external.get(f"/api/v1/runs/{run_id}", headers=headers)
    assert retrieved.status_code == 200 and retrieved.json()["output"] == result["output"]
    assert any(run["id"] == run_id for run in admin.get("/api/runs").json())
    assert any(row["run"]["id"] == run_id for row in admin.get(f"/api/trees/{tree_id}/live").json()["executions"])
    with factory() as db:
        assert db.scalar(select(TraceEvent).where(TraceEvent.run_id == run_id)) is not None
        stored = db.get(Run, run_id)
        assert stored.invocation_source == "public_api_v1"
        assert stored.output_json["value"] == "Network analysis complete"
        assert isinstance(stored.output_json["orchestration"], dict)


def test_public_invocation_failure_is_safe_and_persisted(clients, monkeypatch):
    from backend.api import public_v1
    from backend.services.run_service import RunService
    from backend.services.tree_service import TreeService
    from test_runs import runtime_tree, scripted_builder

    admin, external, factory = clients
    with factory() as db:
        tree, _, _ = runtime_tree(db)
        assert TreeService(db).validate(tree.id, mark_ready=True).valid
        tree_id = tree.id
    _, _, headers = make_member(admin, external, [tree_id])
    monkeypatch.setattr(public_v1, "RunService", lambda db: RunService(db, scripted_builder(db, fail=RuntimeError("provider leaked-secret"))[0]))
    response = external.post(f"/api/v1/trees/{tree_id}/invoke", headers=headers, json={"input": "hi"})
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "failed"
    assert "leaked-secret" not in response.text
    assert external.get(f"/api/v1/runs/{response.json()['run_id']}", headers=headers).json()["status"] == "failed"
