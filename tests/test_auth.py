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


def test_template_builder_draft_http_boundary_is_read_only_and_permission_checked(clients):
    admin, member, factory = clients
    path = '/api/templates/builtin-general-analysis'
    prepared = admin.get(path + '/draft')
    assert prepared.status_code == 200
    assert len(prepared.json()['configuration']['agents']) == 5
    validation = admin.post(path + '/validate-draft', json=prepared.json())
    assert validation.status_code == 200 and not validation.json()['valid']
    with factory() as db:
        assert db.scalars(select(Tree)).all() == []
    make_user(admin, name='draft-restricted', permissions=['use_trees'])
    assert member.post('/api/auth/login', json={'username':'draft-restricted', 'password':USER_PASSWORD}).status_code == 200
    assert member.get(path + '/draft').status_code == 403
    assert member.post(path + '/validate-draft', json=prepared.json()).status_code == 403
    assert member.post(path + '/instantiate', json=prepared.json()).status_code == 403


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


def test_builder_preview_requires_studio_tree_management_and_csrf(clients):
    admin, user, _ = clients
    payload = {'name': 'Canvas', 'agents': []}
    assert user.post('/api/trees/validate-draft', json=payload).status_code == 401
    make_user(admin, name='previewreader', permissions=['use_trees'])
    assert user.post('/api/auth/login', json={'username': 'previewreader', 'password': USER_PASSWORD}).status_code == 200
    assert user.post('/api/trees/validate-draft', json=payload).status_code == 403
    assert admin.post('/api/trees/validate-draft', json=payload, headers={'Origin': 'https://untrusted.invalid'}).status_code == 403
    result = admin.post('/api/trees/validate-draft', json=payload)
    assert result.status_code == 200
    assert not result.json()['valid']

# Tree-scoped Builder regression: actions and resources are independent dimensions.
@pytest.fixture
def scoped_trees(clients):
    admin, member, factory = clients
    roots = []
    for name in ("Allowed Tree", "Hidden Tree"):
        response = admin.post('/api/trees', json={'name': name, 'agents': [
            {'agent_type': 'root', 'name': name + ' Root', 'capabilities': [name.lower().replace(' ', '-')]},
        ]})
        assert response.status_code == 201
        roots.append(response.json())
    return admin, member, factory, roots[0], roots[1]


def scoped_login(admin, client, tree, permissions, mode='selected'):
    account = make_user(admin, permissions=permissions, tree_ids=[tree['id']])
    if mode != 'selected':
        assert admin.put('/api/users/' + account['id'], json={'tree_access_mode': mode}).status_code == 200
    assert client.post('/api/auth/login', json={'username': 'member', 'password': USER_PASSWORD}).status_code == 200
    assert client.post('/api/auth/change-password', json={
        'current_password': USER_PASSWORD, 'new_password': 'isolated-matrix-password-2026',
    }).status_code == 200
    return account


@pytest.mark.parametrize('permission,granted,status', [
    ('manage_trees_agents', True, 200), ('manage_trees_agents', False, 403),
    ('use_trees', True, 403), ('use_trees', False, 403),
])
def test_builder_action_and_resource_matrix(scoped_trees, permission, granted, status):
    admin, member, _, allowed, hidden = scoped_trees
    scoped_login(admin, member, allowed, [permission])
    target = allowed if granted else hidden
    assert member.get('/api/trees/' + target['id']).status_code == status
    assert member.put('/api/trees/' + target['id'], json={'description': 'harmless edit'}).status_code == status
    if status == 200:
        assert member.get('/api/trees/' + target['id']).json()['description'] == 'harmless edit'
    else:
        assert admin.get('/api/trees/' + target['id']).json()['description'] == ''


@pytest.mark.parametrize('permission,granted,status', [
    ('use_trees', True, 422), ('use_trees', False, 403),
    ('manage_trees_agents', True, 403), ('manage_trees_agents', False, 403),
])
def test_execution_action_and_resource_matrix(scoped_trees, permission, granted, status):
    admin, member, _, allowed, hidden = scoped_trees
    scoped_login(admin, member, allowed, [permission])
    target = allowed if granted else hidden
    # Invalid payload stops at validation, so no provider execution is spent.
    assert member.post('/api/trees/' + target['id'] + '/test-run', json={'input': 'invalid'}).status_code == status
    assert member.post('/api/runtime/trees/' + target['id'] + '/invoke', json={'input': 'invalid'}).status_code == status


@pytest.mark.parametrize('mode', ['selected', 'all'])
def test_tree_list_account_dashboard_and_capabilities_are_scoped(scoped_trees, mode):
    admin, member, _, allowed, hidden = scoped_trees
    scoped_login(admin, member, allowed, ['manage_trees_agents'], mode)
    ids = {allowed['id']} if mode == 'selected' else {allowed['id'], hidden['id']}
    assert {t['id'] for t in member.get('/api/trees').json()} == ids
    dashboard = member.get('/api/dashboard/me').json()
    assert {t['id'] for t in dashboard['onboarding']['trees']} == ids
    assert dashboard['trees_count'] == len(ids)
    assert {t['id'] for t in member.get('/api/auth/account').json()['allowed_trees']} == ids
    assert member.get('/api/me/trees').status_code == 403  # Management isn't execution.
    catalog = {t['id'] for t in member.get('/api/capabilities').json()}
    assert 'allowed-tree' in catalog
    assert ('hidden-tree' in catalog) == (mode == 'all')
    assert {t['id'] for t in admin.get('/api/trees').json()} == {allowed['id'], hidden['id']}
    assert admin.get('/api/trees/' + hidden['id']).status_code == 200
    assert admin.put('/api/trees/' + hidden['id'], json={'description': 'Admin global'}).status_code == 200
    assert admin.post('/api/trees/' + hidden['id'] + '/test-run', json={'input': 'invalid'}).status_code == 422


@pytest.mark.parametrize('method,suffix,body', [
    ('GET', '', None), ('GET', '/version', None), ('GET', '/template-setup', None),
    ('GET', '/destinations', None), ('GET', '/webhooks', None),
    ('PUT', '', {'description': 'deny'}), ('DELETE', '', None),
    ('PUT', '/version', {'name': 'deny', 'agents': []}),
    ('PUT', '/configuration', {'name': 'deny', 'agents': []}),
    ('POST', '/validate?mark_ready=true', None),
    ('POST', '/save-as-template', {}),
    ('POST', '/template-setup/agents', {}),
    ('PATCH', '/template-setup/agents/{agent}', {'name': 'deny'}),
    ('PUT', '/template-setup/agents/{agent}/tools', {'tool_ids': []}),
    ('PATCH', '/template-setup/agents/{agent}/model', {}),
    ('POST', '/template-setup/apply-default', {}),
    ('POST', '/destinations', {}),
])
def test_ungranted_tree_routes_reject_before_read_or_mutation(scoped_trees, method, suffix, body):
    admin, member, _, allowed, hidden = scoped_trees
    scoped_login(admin, member, allowed, ['manage_trees_agents'])
    url = '/api/trees/' + hidden['id'] + suffix.replace('{agent}', hidden['root']['id'])
    response = member.request(method, url, json=body)
    assert response.status_code == 403
    assert response.json() == {'detail': 'Access denied'}
    assert admin.get('/api/trees/' + hidden['id']).json() == hidden


def test_preview_query_and_foreign_agent_version_ids_cannot_bypass_scope(scoped_trees):
    admin, member, _, allowed, hidden = scoped_trees
    scoped_login(admin, member, allowed, ['manage_trees_agents'])
    assert member.post('/api/trees/validate-draft', params={'tree_id': hidden['id']}, json={'name': 'preview'}).status_code == 403
    assert member.post('/api/trees/validate-draft', params={'tree_id': allowed['id']}, json={'name': 'preview'}).status_code == 200
    assert member.post('/api/trees/validate-draft', json={'name': 'new unsaved'}).status_code == 200
    assert member.get('/api/trees/' + allowed['id'] + '/version', params={'version_id': hidden['current_version_id']}).status_code == 404
    assert member.patch('/api/trees/' + allowed['id'] + '/template-setup/agents/' + hidden['root']['id'], json={'name': 'deny'}).status_code == 404
    assert member.put('/api/trees/' + allowed['id'] + '/template-setup/agents/' + hidden['root']['id'] + '/tools', json={'tool_ids': []}).status_code == 404
    forged = {'name': allowed['name'], 'agents': hidden['version']['agents']}
    assert member.put('/api/trees/' + allowed['id'] + '/version', json=forged).status_code == 404
    assert member.post('/api/trees', json=forged).status_code == 404
    assert admin.get('/api/trees/' + hidden['id']).json() == hidden


def test_selected_creator_keeps_blank_and_template_access_without_execution(scoped_trees):
    admin, member, _, allowed, hidden = scoped_trees
    scoped_login(admin, member, allowed, ['manage_trees_agents'])
    created = member.post('/api/trees', json={'name': 'Own new Tree', 'agents': []})
    assert created.status_code == 201
    tid = created.json()['id']
    assert member.get('/api/trees/' + tid).status_code == 200
    assert tid in member.get('/api/auth/me').json()['allowed_tree_ids']
    assert member.post('/api/trees/' + tid + '/test-run', json={'input': 'invalid'}).status_code == 403
    template = member.get('/api/templates').json()[0]
    created = member.post('/api/templates/' + template['id'] + '/instantiate', json={'name': 'Own template Tree'})
    assert created.status_code == 201
    assert member.get('/api/trees/' + created.json()['id']).status_code == 200
    assert member.get('/api/trees/' + hidden['id']).status_code == 403


def test_tool_assignment_and_catalog_body_ids_cannot_bypass_scope(scoped_trees):
    admin, member, factory, allowed, hidden = scoped_trees
    scoped_login(admin, member, allowed, ['manage_trees_agents', 'manage_tools_mcp'])
    tool = admin.post('/api/tools', json={'name': 'Safe artifact', 'tool_type': 'artifact'}).json()
    assert admin.post('/api/tools/' + tool['id'] + '/test').status_code == 200
    path = '/api/tools/' + tool['id'] + '/assignments'
    assert admin.put(path, json={'agent_ids': [allowed['root']['id'], hidden['root']['id']]}).status_code == 200
    assert [a['tree_id'] for a in member.get(path).json()['assignments']] == [allowed['id']]
    assert member.put(path, json={'agent_ids': [hidden['root']['id']]}).status_code == 403
    assert member.put(path, json={'agent_ids': []}).status_code == 200
    assert [a['tree_id'] for a in admin.get(path).json()['assignments']] == [hidden['id']]
    assert member.put(path, json={'agent_ids': [allowed['root']['id']]}).status_code == 200
    assert len(admin.get(path).json()['assignments']) == 2
    for url,payload in [('/api/tool-catalog/resolve-required', {'tree_id': hidden['id']}),
                        ('/api/tool-catalog/http-api/resolve-requirement', {'tree_id': hidden['id'], 'requirement_id': 'any'})]:
        assert member.post(url, json=payload).status_code == 403
    assert admin.put('/api/users/' + member.get('/api/auth/me').json()['id'], json={'permissions': ['manage_tools_mcp']}).status_code == 200
    assert member.get(path).status_code == 403
    assert member.put(path, json={'agent_ids': []}).status_code == 403
    assert member.post('/api/tool-catalog/resolve-required', json={'tree_id': allowed['id']}).status_code == 403


def test_run_history_ids_and_dashboard_follow_tree_scope(scoped_trees):
    from backend.models.run import Run
    admin, member, factory, allowed, hidden = scoped_trees
    with factory() as db:
        runs = [Run(tree_id=t['id'], tree_version_id=t['current_version_id'], input_json={'input': 'test'}, started_at=datetime.now()) for t in (allowed, hidden)]
        db.add_all(runs); db.commit()
        run_ids = [r.id for r in runs]
    scoped_login(admin, member, allowed, ['view_executions'])
    assert {r['id'] for r in member.get('/api/runs').json()} == {run_ids[0]}
    assert member.get('/api/runs/' + run_ids[0]).status_code == 200
    assert member.get('/api/runs/' + run_ids[1]).status_code == 403
    assert member.get('/api/runs/' + run_ids[1] + '/trace').status_code == 403
    assert member.get('/api/runs', params={'tree_id': hidden['id']}).status_code == 403
    assert member.get('/api/trees/' + hidden['id'] + '/live').status_code == 403
    assert member.get('/api/trees/' + hidden['id'] + '/runs').status_code == 403
    dashboard = member.get('/api/dashboard/me').json()
    assert dashboard['runs_count'] == 1
    assert [r['id'] for r in dashboard['recent_runs']] == [run_ids[0]]

@pytest.mark.parametrize('kind,permission', [('tool','manage_tools_mcp'), ('provider','manage_providers_models'), ('secret','manage_secrets')])
def test_resource_dependencies_hide_ungranted_tree_configuration_but_preserve_delete_guard(scoped_trees, kind, permission):
    from backend.models.provider import ProviderConnection
    from backend.models.secret import Secret
    from backend.models.destination import ResultDestination
    from backend.models.tool import ToolConnection, ToolAssignment
    from backend.models.tree import AgentConfig
    admin, member, factory, allowed, hidden = scoped_trees
    scoped_login(admin, member, allowed, ['manage_trees_agents', permission])
    with factory() as db:
        resource = {'provider': lambda: ProviderConnection(name='Dependency Provider',provider_type='ollama'),
                    'tool': lambda: ToolConnection(name='Dependency Tool',tool_type='artifact'),
                    'secret': lambda: Secret(name='Dependency Secret',secret_type='api_key',encrypted_value='isolated-unused-test-ciphertext')}[kind]()
        db.add(resource);db.flush()
        for tree in [allowed,hidden]:
            agent=db.get(AgentConfig,tree['root']['id'])
            if kind=='provider':agent.provider_connection_id=resource.id
            elif kind=='tool':db.add(ToolAssignment(tree_version_id=tree['current_version_id'],agent_config_id=agent.id,tool_connection_id=resource.id))
            else:db.add(ResultDestination(tree_id=tree['id'],name='Dependency destination',destination_type='webhook',secret_id=resource.id))
        db.commit();rid=resource.id
    path='/api/'+ {'tool':'tools','provider':'providers','secret':'secrets'}[kind]+'/'+rid+'/dependencies'
    result=member.get(path)
    assert result.status_code==200
    assert [item['tree_id'] for item in result.json()['dependencies']]==[allowed['id']]
    assert hidden['id'] not in result.text and hidden['root']['id'] not in result.text
    assert not result.json()['can_delete']
    user_id=member.get('/api/auth/me').json()['id']
    assert admin.put('/api/users/'+user_id,json={'allowed_tree_ids':[]}).status_code==200
    result=member.get(path).json()
    assert result['dependencies']==[] and not result['can_delete']
    assert len(admin.get(path).json()['dependencies'])==2
    assert member.delete(path.removesuffix('/dependencies')).status_code==409
