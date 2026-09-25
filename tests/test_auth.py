"""HTTP-boundary authentication, permissions, grants and revocation tests."""

from datetime import datetime

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from backend.core import authz
from backend.db.session import get_db
from backend.main import app
from backend.models.auth import ApiToken, SecurityEvent, User, UserSession, UserTreeAccess
from backend.models.tree import Tree
from backend.services.auth_service import AuthService, _attempts

ADMIN_PASSWORD = "bootstrap-strong-password-2026"
USER_PASSWORD = "temporary-strong-password-2026"


@pytest.fixture
def clients(database_factory, monkeypatch):
    _attempts.clear()
    monkeypatch.setattr(authz, "SessionLocal", database_factory)

    def db_override():
        with database_factory() as database:
            yield database

    app.dependency_overrides[get_db] = db_override
    with database_factory() as database:
        AuthService(database).bootstrap("RootAdmin", ADMIN_PASSWORD)
    admin = TestClient(app)
    user = TestClient(app)
    assert admin.post("/api/auth/login", json={"username": "rootadmin", "password": ADMIN_PASSWORD}).status_code == 200
    yield admin, user, database_factory
    admin.close()
    user.close()
    app.dependency_overrides.clear()
    _attempts.clear()


def make_user(admin, name="member", permissions=None, tree_ids=None):
    response = admin.post("/api/users", json={"username": name, "password": USER_PASSWORD,
        "permissions": permissions or [], "allowed_tree_ids": tree_ids or []})
    assert response.status_code == 201, response.text
    return response.json()


def test_every_registered_api_route_has_an_explicit_policy():
    """Catch future endpoints that accidentally fall through the deny policy."""
    for route in app.routes:
        if not getattr(route, "path", "").startswith("/api/"):
            continue
        path = route.path.replace("{tree_id}", "sample-tree").replace("{run_id}", "sample-run")
        path = path.replace("{provider_id}", "sample-provider").replace("{tool_id}", "sample-tool")
        path = path.replace("{secret_id}", "sample-secret").replace("{destination_id}", "sample-destination")
        path = path.replace("{user_id}", "sample-user").replace("{token_id}", "sample-token")
        for method in route.methods - {"HEAD", "OPTIONS"}:
            assert authz.required_access(path, method) != ("deny", None), (method, route.path)


def test_tree_configuration_edit_requires_management_permission(clients):
    admin, user, _ = clients
    make_user(admin, name="treeoperator", permissions=["use_trees"])
    assert user.post("/api/auth/login", json={"username": "treeoperator", "password": USER_PASSWORD}).status_code == 200
    response = user.put("/api/trees/missing/configuration", json={})
    assert response.status_code == 403
    # Authorized requests reach the Tree endpoint (and then fail on the missing ID).
    assert admin.put("/api/trees/missing/configuration", json={}).status_code == 422


def test_fresh_primary_bootstrap_default_and_idempotence(database_factory):
    with database_factory() as database:
        service = AuthService(database)
        service.bootstrap()
        primary = database.scalar(select(User).where(User.is_primary_admin.is_(True)))
        assert primary.username == "admin"
        assert primary.is_admin and primary.is_active and primary.must_change_password
        assert primary.password_hash.startswith("$argon2id$") and primary.password_hash != "admin"
        original_hash = primary.password_hash
        service.bootstrap("other", "other-strong-password-2026")
        assert database.get(User, primary.id).password_hash == original_hash
        assert len(list(database.scalars(select(User)))) == 1


def test_default_bootstrap_rejects_populated_database(database_factory):
    with database_factory() as database:
        database.add(Tree(name="Existing Tree"))
        database.commit()
        with pytest.raises(RuntimeError, match="genuinely fresh"):
            AuthService(database).bootstrap()
        AuthService(database).bootstrap("recovery", "strong-recovery-password-2026")
        assert database.scalar(select(User).where(User.is_primary_admin.is_(True))).username == "recovery"


def test_database_allows_at_most_one_primary_admin(database_factory):
    with database_factory() as database:
        AuthService(database).bootstrap()
        database.add(User(username="second", username_key="second", password_hash="unused",
                          is_admin=True, is_primary_admin=True, is_active=True, must_change_password=False))
        with pytest.raises(IntegrityError):
            database.commit()
        database.rollback()


def test_default_primary_must_change_before_api_access(database_factory, monkeypatch):
    _attempts.clear()
    monkeypatch.setattr(authz, "SessionLocal", database_factory)
    def db_override():
        with database_factory() as database:
            yield database
    app.dependency_overrides[get_db] = db_override
    try:
        with database_factory() as database:
            AuthService(database).bootstrap()
        client = TestClient(app)
        login = client.post("/api/auth/login", json={"username": "admin", "password": "admin"})
        assert login.status_code == 200 and login.json()["must_change_password"] is True
        assert client.get("/api/dashboard/summary").status_code == 403
        assert client.get("/api/auth/account").status_code == 403
        new_password = "changed-default-admin-2026"
        assert client.post("/api/auth/change-password", json={"current_password": "admin", "new_password": new_password}).status_code == 200
        assert client.get("/api/dashboard/summary").status_code == 200
        with database_factory() as database:
            AuthService(database).bootstrap()
        client.post("/api/auth/logout")
        assert client.post("/api/auth/login", json={"username": "admin", "password": "admin"}).status_code == 401
        assert client.post("/api/auth/login", json={"username": "admin", "password": new_password}).status_code == 200
        client.close()
    finally:
        app.dependency_overrides.clear()
        _attempts.clear()


def test_primary_admin_guards_and_account_metadata(clients):
    admin, _, factory = clients
    me = admin.get("/api/auth/me").json()
    assert me["is_primary_admin"] is True
    assert "password_hash" not in str(me)
    primary_id = me["id"]
    assert admin.delete(f"/api/users/{primary_id}").status_code == 409
    assert admin.put(f"/api/users/{primary_id}", json={"is_active": False}).status_code == 409
    assert admin.put(f"/api/users/{primary_id}", json={"is_admin": False}).status_code == 409
    with factory() as database:
        assert database.get(User, primary_id).is_admin and database.get(User, primary_id).is_active
    account = admin.get("/api/auth/account")
    assert account.status_code == 200
    payload = account.json()
    assert payload["user"]["is_primary_admin"] is True
    assert payload["session_expires_at"] and payload["active_token_count"] == 0
    assert "password_hash" not in account.text


def test_security_events_are_admin_only_and_metadata_only(clients):
    admin, member_client, _ = clients
    make_user(admin, name="auditmember", permissions=["use_trees"])
    assert member_client.post("/api/auth/login", json={"username": "auditmember", "password": USER_PASSWORD}).status_code == 200
    assert member_client.get("/api/security-events").status_code == 403
    result = admin.get("/api/security-events")
    assert result.status_code == 200
    rows = result.json()["items"]
    assert any(row["event_type"] == "user_created" for row in rows)
    assert len(rows) <= 100
    assert all(set(row) == {"id", "event_type", "actor_username", "subject_user_id", "created_at"} for row in rows)
    assert USER_PASSWORD not in result.text


def test_security_event_pagination_and_server_filters(clients):
    admin, member_client, factory = clients
    created = make_user(admin, name="auditable", permissions=["use_trees"])
    with factory() as database:
        actor = database.get(User, created["id"])
        database.add_all([
            SecurityEvent(id="event-001", event_type="api_token_created", actor_user_id=actor.id,
                          subject_user_id=actor.id, created_at=datetime(2026, 1, 1, 9, 0, 0)),
            SecurityEvent(id="event-002", event_type="api_token_revoked", actor_user_id=actor.id,
                          subject_user_id=actor.id, created_at=datetime(2026, 1, 2, 9, 0, 0)),
            SecurityEvent(id="event-003", event_type="api_token_created", actor_user_id=actor.id,
                          subject_user_id=actor.id, created_at=datetime(2026, 1, 2, 9, 0, 0)),
        ])
        database.commit()
    first = admin.get("/api/security-events", params={"event_type": "api_token_created", "actor": "auditable", "page_size": 1})
    assert first.status_code == 200
    assert first.json()["total"] == 2
    assert [row["id"] for row in first.json()["items"]] == ["event-003"]
    second = admin.get("/api/security-events", params={"event_type": "api_token_created", "actor": "auditable", "page_size": 1, "page": 2})
    assert [row["id"] for row in second.json()["items"]] == ["event-001"]
    assert admin.get("/api/security-events", params={"search": "revoked", "actor": "auditable"}).json()["items"][0]["id"] == "event-002"
    ranged = admin.get("/api/security-events", params={"actor": "auditable", "after": "2026-01-02T00:00:00", "before": "2026-01-02T23:59:59"})
    assert ranged.status_code == 200 and ranged.json()["total"] == 2
    assert admin.get("/api/security-events", params={"page_size": 101}).status_code == 422
    assert admin.get("/api/security-events", params={"after": "2026-01-03T00:00:00", "before": "2026-01-01T00:00:00"}).status_code == 422
    assert admin.get("/api/security-events", params={"after": "2026-01-03T00:00:00Z", "before": "2026-01-01T00:00:00"}).status_code == 422
    assert member_client.get("/api/security-events").status_code == 401


def test_primary_password_change_and_existing_admin_not_reset(clients):
    admin, _, factory = clients
    primary_id = admin.get("/api/auth/me").json()["id"]
    updated = "changed-primary-password-2026"
    assert admin.post("/api/auth/change-password", json={"current_password": ADMIN_PASSWORD, "new_password": updated}).status_code == 200
    with factory() as database:
        before = database.get(User, primary_id).password_hash
        AuthService(database).bootstrap("admin", "admin")
        after = database.get(User, primary_id).password_hash
        assert before == after
    assert admin.post("/api/auth/login", json={"username": "RootAdmin", "password": "admin"}).status_code == 401
    assert admin.post("/api/auth/login", json={"username": "RootAdmin", "password": updated}).status_code == 200


def test_permission_scoped_dashboard_and_account_trees(clients):
    admin, member_client, factory = clients
    with factory() as database:
        allowed, hidden = Tree(name="Dashboard Allowed"), Tree(name="Dashboard Hidden")
        database.add_all([allowed, hidden]); database.commit()
        allowed_id, hidden_id = allowed.id, hidden.id
    member = make_user(admin, permissions=["use_trees"], tree_ids=[allowed_id])
    member_client.post("/api/auth/login", json={"username": "member", "password": USER_PASSWORD})
    member_client.post("/api/auth/change-password", json={"current_password": USER_PASSWORD, "new_password": "member-strong-password-2026"})
    assert member_client.get("/api/dashboard/summary").status_code == 403
    scoped = member_client.get("/api/dashboard/me").json()
    assert scoped["trees_count"] == 1
    assert [tree["id"] for tree in scoped["available_trees"]] == [allowed_id]
    assert scoped["providers_count"] is None and scoped["runs_count"] is None
    account = member_client.get("/api/auth/account").json()
    assert account["user"]["id"] == member["id"]
    assert [tree["id"] for tree in account["allowed_trees"]] == [allowed_id]
    assert hidden_id not in member_client.get("/api/auth/account").text
    assert {tree["id"] for tree in admin.get("/api/dashboard/me").json()["available_trees"]} == {allowed_id, hidden_id}
    assert {tree["id"] for tree in admin.get("/api/auth/account").json()["allowed_trees"]} == {allowed_id, hidden_id}


@pytest.mark.parametrize("permission,visible", [
    ("manage_trees_agents", "trees_count"),
    ("manage_providers_models", "providers_count"),
    ("manage_tools_mcp", "tools_count"),
    ("view_executions", "runs_count"),
    ("manage_secrets", "secrets_count"),
])
def test_dashboard_exposes_only_permitted_metric(clients, permission, visible):
    admin, member_client, _ = clients
    make_user(admin, permissions=[permission])
    member_client.post("/api/auth/login", json={"username": "member", "password": USER_PASSWORD})
    member_client.post("/api/auth/change-password", json={"current_password": USER_PASSWORD, "new_password": "member-strong-password-2026"})
    payload = member_client.get("/api/dashboard/me").json()
    for field in ("trees_count", "providers_count", "ready_models_count", "tools_count", "runs_count", "secrets_count"):
        if field == visible or (visible == "providers_count" and field == "ready_models_count"):
            assert payload[field] == 0, field
        else:
            assert payload[field] is None, field
    assert payload["available_trees"] == []
    assert member_client.get("/api/dashboard/summary").status_code == 403


def test_login_password_hash_and_generic_failure(clients):
    admin, user, factory = clients
    response = user.post("/api/auth/login", json={"username": "ROOTADMIN", "password": ADMIN_PASSWORD})
    assert response.status_code == 200
    assert "httponly" in response.headers["set-cookie"].lower()
    assert "samesite=lax" in response.headers["set-cookie"].lower()
    assert "password_hash" not in response.text and ADMIN_PASSWORD not in response.text
    with factory() as database:
        stored = database.scalar(select(User).where(User.username_key == "rootadmin"))
        assert stored.password_hash.startswith("$argon2id$")
        assert ADMIN_PASSWORD not in stored.password_hash
        assert database.scalar(select(UserSession)).token_hash != user.cookies.get("studio_session")
    user.post("/api/auth/logout")
    wrong = user.post("/api/auth/login", json={"username": "RootAdmin", "password": "wrong"})
    unknown = user.post("/api/auth/login", json={"username": "not-here", "password": "wrong"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json() == {"detail": "Invalid username or password"}


def test_lan_host_origin_is_accepted_without_allowing_cross_site_requests(clients):
    admin, _, _ = clients
    host = {"Host": "192.0.2.10:5173"}
    denied = admin.post("/api/auth/logout", headers={**host, "Origin": "http://untrusted.example", "Sec-Fetch-Site": "cross-site"})
    assert denied.status_code == 403
    assert admin.get("/api/auth/me").status_code == 200
    allowed = admin.post("/api/auth/logout", headers={**host, "Origin": "http://192.0.2.10:5173", "Sec-Fetch-Site": "same-origin"})
    assert allowed.status_code == 204
    assert admin.get("/api/auth/me").status_code == 401


def test_unauthenticated_logout_and_forced_password_change(clients):
    admin, user, _ = clients
    assert user.get("/api/secrets").status_code == 401
    member = make_user(admin)
    login = user.post("/api/auth/login", json={"username": "member", "password": USER_PASSWORD})
    assert login.status_code == 200 and login.json()["must_change_password"] is True
    assert user.get("/api/me/trees").status_code == 403
    assert user.get("/api/auth/account").status_code == 403
    assert user.post("/api/auth/change-password", json={"current_password": "wrong", "new_password": "new-strong-password-2026"}).status_code == 400
    changed = user.post("/api/auth/change-password", json={"current_password": USER_PASSWORD, "new_password": "new-strong-password-2026"})
    assert changed.status_code == 200 and changed.json()["must_change_password"] is False
    assert user.get("/api/auth/me").json()["id"] == member["id"]
    assert user.post("/api/auth/logout").status_code == 204
    assert user.get("/api/auth/me").status_code == 401
    assert user.post("/api/auth/login", json={"username": "member", "password": USER_PASSWORD}).status_code == 401
    assert user.post("/api/auth/login", json={"username": "member", "password": "new-strong-password-2026"}).status_code == 200


def test_permissions_tree_grants_and_admin_invariant(clients):
    admin, user, factory = clients
    with factory() as database:
        tree_a, tree_b = Tree(name="Allowed Tree"), Tree(name="Hidden Tree")
        database.add_all([tree_a, tree_b]); database.commit()
        a_id, b_id = tree_a.id, tree_b.id
    member = make_user(admin, permissions=["use_trees", "manage_tools_mcp"], tree_ids=[a_id])
    assert admin.get("/api/secrets").status_code == 200
    assert admin.get("/api/trees").status_code == 200
    assert admin.put(f"/api/users/{admin.get('/api/auth/me').json()['id']}", json={"is_active": False}).status_code == 409
    user.post("/api/auth/login", json={"username": "member", "password": USER_PASSWORD})
    user.post("/api/auth/change-password", json={"current_password": USER_PASSWORD, "new_password": "member-strong-password-2026"})
    assert user.get("/api/tools").status_code == 200
    assert user.put(f"/api/users/{member['id']}", json={"tree_access_mode": "all", "permissions": ["use_trees"], "allowed_tree_ids": [b_id]}).status_code == 403
    for endpoint in ("/api/secrets", "/api/providers", "/api/trees", "/api/runs", "/api/users", "/api/dashboard/summary"):
        assert user.get(endpoint).status_code == 403, endpoint
    assert [tree["id"] for tree in user.get("/api/me/trees").json()] == [a_id]
    assert user.post(f"/api/runtime/trees/{b_id}/invoke", json={"input": {}}).status_code == 403
    assert user.post(f"/api/runtime/trees/{a_id}/invoke", json={"input": {}}).status_code == 422
    assert admin.post(f"/api/runtime/trees/{b_id}/invoke", json={"input": {}}).status_code == 422
    assert admin.put(f"/api/users/{member['id']}", json={"allowed_tree_ids": []}).status_code == 200
    assert user.get("/api/me/trees").json() == []
    assert user.post(f"/api/runtime/trees/{a_id}/invoke", json={"input": {}}).status_code == 403
    with factory() as database:
        assert database.scalar(select(UserTreeAccess).where(UserTreeAccess.user_id == member["id"])) is None


def test_tree_access_modes_and_permission_gate_apply_to_session_and_token(clients):
    admin, member_client, factory = clients
    with factory() as database:
        a, b = Tree(name="Grant A"), Tree(name="Hidden B")
        database.add_all([a, b]); database.commit()
        a_id, b_id = a.id, b.id
    primary = admin.get("/api/auth/me").json()
    assert primary["is_primary_admin"] and primary["tree_access_mode"] == "selected"
    assert {row["id"] for row in admin.get("/api/me/trees").json()} == {a_id, b_id}
    created = make_user(admin, permissions=["use_trees"], tree_ids=[a_id])
    assert created["tree_access_mode"] == "selected"
    member_client.post("/api/auth/login", json={"username": "member", "password": USER_PASSWORD})
    member_client.post("/api/auth/change-password", json={"current_password": USER_PASSWORD, "new_password": "member-strong-password-2026"})
    def visible():
        return {row["id"] for row in member_client.get("/api/me/trees").json()}
    def invoke_status(tree_id):
        return member_client.post(f"/api/runtime/trees/{tree_id}/invoke", json={"input": {}}).status_code
    assert visible() == {a_id}
    assert b_id not in member_client.get("/api/auth/account").text
    assert member_client.get("/api/dashboard/me").json()["trees_count"] == 1
    assert invoke_status(a_id) == 422 and invoke_status(b_id) == 403
    token = member_client.post("/api/auth/tokens", json={"name": "tree-access"}).json()["token"]
    bearer = {"Authorization": f"Bearer {token}"}
    assert member_client.post(f"/api/runtime/trees/{b_id}/invoke", headers=bearer, json={"input": {}}).status_code == 403
    changed = admin.put(f"/api/users/{created['id']}", json={"tree_access_mode": "all"})
    assert changed.status_code == 200 and changed.json()["allowed_tree_ids"] == [a_id]
    with factory() as database:
        future = Tree(name="Future C"); database.add(future); database.commit(); c_id = future.id
    assert visible() == {a_id, b_id, c_id}
    assert member_client.get("/api/dashboard/me").json()["trees_count"] == 3
    assert invoke_status(c_id) == 422
    assert member_client.post(f"/api/runtime/trees/{c_id}/invoke", headers=bearer, json={"input": {}}).status_code == 422
    admin.put(f"/api/users/{created['id']}", json={"tree_access_mode": "selected", "allowed_tree_ids": [b_id]})
    assert visible() == {b_id}
    assert invoke_status(a_id) == 403 and invoke_status(b_id) == 422
    admin.put(f"/api/users/{created['id']}", json={"permissions": [], "tree_access_mode": "all"})
    assert member_client.get("/api/me/trees").status_code == 403
    assert member_client.get("/api/dashboard/me").json()["available_trees"] == []
    assert invoke_status(b_id) == 403
    assert member_client.post(f"/api/runtime/trees/{b_id}/invoke", headers=bearer, json={"input": {}}).status_code == 403
    with factory() as database:
        user = database.get(User, created["id"])
        assert AuthService(database).my_trees(user) == []
        assert not AuthService(database).can_use_tree(user, b_id)
        assert database.scalar(select(UserTreeAccess).where(UserTreeAccess.user_id == created["id"])) is not None


def test_invalid_tree_grant_does_not_leave_partial_user(clients):
    admin, _, factory = clients
    response = admin.post("/api/users", json={"username": "not-created", "password": USER_PASSWORD,
        "permissions": ["use_trees"], "allowed_tree_ids": ["missing-tree"]})
    assert response.status_code == 422
    with factory() as database:
        assert database.scalar(select(User).where(User.username_key == "not-created")) is None


def test_deactivation_and_token_revocation_are_immediate(clients):
    admin, user, factory = clients
    with factory() as database:
        tree = Tree(name="Token Tree"); database.add(tree); database.commit(); tree_id = tree.id
    member = make_user(admin, permissions=["use_trees"], tree_ids=[tree_id])
    user.post("/api/auth/login", json={"username": "member", "password": USER_PASSWORD})
    user.post("/api/auth/change-password", json={"current_password": USER_PASSWORD, "new_password": "member-strong-password-2026"})
    created = user.post("/api/auth/tokens", json={"name": "IDE"})
    assert created.status_code == 201
    assert user.post("/api/auth/tokens", json={"name": "   "}).status_code == 422
    raw = created.json()["token"]
    token_id = created.json()["id"]
    assert raw not in user.get("/api/auth/tokens").text
    with factory() as database:
        stored = database.get(ApiToken, token_id)
        assert stored.token_hash != raw and raw not in stored.token_hash
    bearer = {"Authorization": f"Bearer {raw}"}
    assert user.post(f"/api/runtime/trees/{tree_id}/invoke", headers=bearer, json={"input": {}}).status_code == 422
    admin.put(f"/api/users/{member['id']}", json={"allowed_tree_ids": []})
    assert user.post(f"/api/runtime/trees/{tree_id}/invoke", headers=bearer, json={"input": {}}).status_code == 403
    admin.put(f"/api/users/{member['id']}", json={"allowed_tree_ids": [tree_id]})
    assert user.delete(f"/api/auth/tokens/{token_id}").status_code == 204
    assert user.post(f"/api/runtime/trees/{tree_id}/invoke", headers=bearer, json={"input": {}}).status_code == 401
    newer = user.post("/api/auth/tokens", json={"name": "IDE 2"}).json()["token"]
    admin.put(f"/api/users/{member['id']}", json={"is_active": False})
    assert user.get("/api/auth/me").status_code == 401
    assert user.post(f"/api/runtime/trees/{tree_id}/invoke", headers={"Authorization": f"Bearer {newer}"}, json={"input": {}}).status_code == 401
    assert user.post("/api/auth/login", json={"username": "member", "password": "member-strong-password-2026"}).status_code == 401


def test_login_rate_limit_and_last_admin_delete(clients):
    admin, user, _ = clients
    for _ in range(5):
        assert user.post("/api/auth/login", json={"username": "unknown", "password": "bad"}).status_code == 401
    assert user.post("/api/auth/login", json={"username": "unknown", "password": "bad"}).status_code == 429
    # Docker's frontend proxy can put unrelated LAN users behind one peer IP.
    assert user.post("/api/auth/login", json={"username": "rootadmin", "password": ADMIN_PASSWORD}).status_code == 200
    admin_id = admin.get("/api/auth/me").json()["id"]
    assert admin.delete(f"/api/users/{admin_id}").status_code == 409
