"""Incoming credentials, current authorization, and normal runtime persistence."""

from hashlib import sha256
import json

import pytest
from sqlalchemy import select

from backend.models.auth import User
from backend.models.run import Run, TraceEvent
from backend.models.webhook import WebhookIntegration
from backend.services.async_runs import RuntimeCapacityError
from backend.services.run_service import RunService
from backend.services.tree_service import TreeService
from tests.test_auth import clients, make_user, USER_PASSWORD  # noqa: F401
from tests.test_runs import runtime_tree, scripted_builder


@pytest.fixture
def ingress(clients, monkeypatch):
    admin, anonymous, factory = clients
    with factory() as db:
        tree, _, _ = runtime_tree(db)
        assert TreeService(db).validate(tree.id, mark_ready=True).valid
    response = admin.post(f"/api/trees/{tree.id}/webhooks", json={"name": "Events"})
    assert response.status_code == 201, response.text
    created = response.json()

    class Coordinator:
        calls = []
        def submit(self, factory, run_id):
            self.calls.append(run_id)

    coordinator = Coordinator()
    monkeypatch.setattr("backend.services.webhook_service.get_async_run_coordinator", lambda: coordinator)
    return admin, anonymous, factory, tree, created, coordinator


def deliver(ingress, secret=None, payload=None):
    _, sender, _, _, item, _ = ingress
    return sender.post(f"/api/webhooks/{item['id']}",
        headers={"Authorization": "Bearer " + (secret if secret is not None else item["secret"])},
        json=payload or {"event": {"message": "An external event"}, "metadata": {"source": "generic"}})


def test_webhook_hash_only_once_visible_and_normal_run(ingress):
    admin, sender, factory, tree, created, coordinator = ingress
    raw = created["secret"]
    with factory() as db:
        stored = db.get(WebhookIntegration, created["id"])
        assert stored.secret_hash == sha256(raw.encode()).hexdigest()
        assert raw not in json.dumps(stored.__dict__, default=str)
    listed = admin.get(f"/api/trees/{tree.id}/webhooks")
    assert raw not in listed.text and "secret_hash" not in listed.text and '"secret"' not in listed.text
    accepted = deliver(ingress, payload={"event": {"echo": raw, "authorization": raw, raw: "key echo"}, "metadata": {"secret": raw}})
    assert accepted.status_code == 202, accepted.text
    assert accepted.headers["x-request-id"]
    assert accepted.json()["status"] == "queued"
    run_id = accepted.json()["run_id"]
    assert coordinator.calls == [run_id]
    with factory() as db:
        run = db.get(Run, run_id)
        assert run.tree_version_id == tree.version.id
        assert run.invocation_source == "webhook_ingress" and run.submitted_by_token_id is None
        assert raw not in json.dumps(run.input_json) + json.dumps(run.metadata_json)
        assert run.input_json["event"]["echo"] == "[REDACTED]"
        assert db.get(WebhookIntegration, created["id"]).last_received_at is not None
        # Execute with real Core and deterministic providers through the existing service.
        builder, _, _ = scripted_builder(db)
        result = RunService(db, runtime_builder=builder).execute(run_id)
        assert result.status == "completed"
        events = list(db.scalars(select(TraceEvent).where(TraceEvent.run_id == run_id)))
        assert events and any(event.core_sequence is not None for event in events)
    assert admin.get(f"/api/runs/{run_id}").status_code == 200
    assert admin.get(f"/api/runs/{run_id}/trace").json()


@pytest.mark.parametrize("secret", ["", "invalid", "ats_" + "x" * 48, "athw_" + "x" * 48])
def test_invalid_credentials_are_nonenumerating(ingress, secret):
    response = deliver(ingress, secret)
    assert response.status_code == 404
    missing = ingress[1].post("/api/webhooks/wh_missing", headers={"Authorization": "Bearer " + secret}, json={"event": {}})
    assert missing.status_code == response.status_code
    assert missing.json()["error"]["code"] == response.json()["error"]["code"]
    assert ingress[-1].calls == []


def test_disable_rotate_delete_and_cookie_do_not_authorize(ingress):
    admin, _, _, tree, item, coordinator = ingress
    management = f"/api/trees/{tree.id}/webhooks/{item['id']}"
    assert admin.post(f"/api/webhooks/{item['id']}", json={"event": {}}).status_code == 404
    assert admin.patch(management, json={"enabled": False}).status_code == 200
    assert deliver(ingress).status_code == 404
    assert admin.patch(management, json={"enabled": True}).status_code == 200
    rotated = admin.post(management + "/rotate").json()["secret"]
    assert deliver(ingress).status_code == 404
    assert deliver(ingress, rotated).status_code == 202
    assert admin.delete(management).status_code == 204
    assert deliver(ingress, rotated).status_code == 404
    assert len(coordinator.calls) == 1


def test_draft_rejected_legacy_tree_id_not_a_credential(ingress):
    admin, sender, factory, tree, item, coordinator = ingress
    with factory() as db:
        from backend.models.tree import Tree
        db.get(Tree, tree.id).status = "draft"
        db.commit()
    assert deliver(ingress).status_code == 409
    assert admin.post(f"/api/trees/{tree.id}/webhooks", json={"name": "Draft"}).status_code == 409
    assert sender.post(f"/api/trees/{tree.id}/webhook", json={"event": {}}).status_code != 202
    assert sender.post(f"/api/webhooks/{tree.id}", headers={"Authorization": "Bearer " + item["secret"]}, json={"event": {}}).status_code == 404
    assert not coordinator.calls


def test_payload_bounds_safe_errors_and_duplicate_contract(ingress):
    _, sender, _, _, item, coordinator = ingress
    headers = {"Authorization": "Bearer " + item["secret"], "Content-Type": "application/json"}
    for body, status in [("bad-json", 422), (json.dumps({"event": "wrong"}), 422),
                         ('{"event":{"number":NaN}}', 422),
                         ('{"event":' + '{"a":' * 40 + '{}' + '}' * 40 + '}', 422),
                         (json.dumps({"event": {}, "tree_id": "injected"}), 422),
                         (json.dumps({"event": {"data": "x" * 65536}}), 413)]:
        response = sender.post(f"/api/webhooks/{item['id']}", headers=headers, content=body)
        assert response.status_code == status
        assert item["secret"] not in response.text
    first, second = deliver(ingress), deliver(ingress)
    assert first.status_code == second.status_code == 202
    assert first.json()["run_id"] != second.json()["run_id"]
    assert len(coordinator.calls) == 2


@pytest.mark.parametrize("change", ["grant", "permission", "inactive", "password"])
def test_owner_current_access_is_rechecked(clients, monkeypatch, change):
    admin, user, factory = clients
    with factory() as db:
        tree, _, _ = runtime_tree(db)
        TreeService(db).validate(tree.id, mark_ready=True)
    owner = make_user(admin, permissions=["use_trees", "manage_trees_agents"], tree_ids=[tree.id])
    user.post("/api/auth/login", json={"username": owner["username"], "password": USER_PASSWORD})
    user.post("/api/auth/change-password", json={"current_password": USER_PASSWORD, "new_password": "changed-password-for-webhook"})
    created = user.post(f"/api/trees/{tree.id}/webhooks", json={"name": "Owned events"}).json()
    with factory() as db:
        owner = db.get(User, owner["id"])
        if change == "grant": owner.tree_grants.clear()
        if change == "permission": owner.permissions = [p for p in owner.permissions if p.permission != "use_trees"]
        if change == "inactive": owner.is_active = False
        if change == "password": owner.must_change_password = True
        db.commit()
    response = user.post(f"/api/webhooks/{created['id']}", headers={"Authorization": "Bearer " + created["secret"]}, json={"event": {}})
    assert response.status_code == 404


def test_management_permissions_csrf_and_capacity(ingress, monkeypatch):
    admin, sender, _, tree, item, _ = ingress
    path = f"/api/trees/{tree.id}/webhooks"
    assert sender.get(path).status_code == 401
    assert admin.post(path, headers={"Origin": "https://evil.example"}, json={"name": "CSRF"}).status_code == 403

    class Full:
        def submit(self, *args): raise RuntimeCapacityError()
    monkeypatch.setattr("backend.services.webhook_service.get_async_run_coordinator", lambda: Full())
    assert deliver(ingress).status_code == 503
    with ingress[2]() as db:
        assert list(db.scalars(select(Run))) == []


def test_management_requires_tree_use_and_cannot_take_another_owners_integration(ingress):
    admin, other, _, tree, item, _ = ingress
    member = make_user(admin, name="other-manager", permissions=["manage_trees_agents"], tree_ids=[tree.id])
    assert other.post("/api/auth/login", json={"username": member["username"], "password": USER_PASSWORD}).status_code == 200
    assert other.post("/api/auth/change-password", json={"current_password": USER_PASSWORD, "new_password": "other-manager-password-2026"}).status_code == 200
    path = f"/api/trees/{tree.id}/webhooks"
    assert other.post(path, json={"name": "No use permission"}).status_code == 404
    assert admin.put(f"/api/users/{member['id']}", json={"permissions": ["manage_trees_agents", "use_trees"]}).status_code == 200
    assert other.get(path).json() == []
    assert other.post(path + f"/{item['id']}/rotate").status_code == 404
    assert other.patch(path + f"/{item['id']}", json={"enabled": False}).status_code == 404
    assert other.delete(path + f"/{item['id']}").status_code == 404


def test_integration_config_uses_public_origin_and_stays_cookie_only(clients, monkeypatch):
    admin, anonymous, _ = clients
    monkeypatch.setenv("AGENTTREE_STUDIO_PUBLIC_ORIGIN", "https://studio.example.com")
    assert anonymous.get("/api/auth/integration-config").status_code == 401
    assert admin.get("/api/auth/integration-config").json() == {"public_origin": "https://studio.example.com"}
    key = admin.post("/api/auth/tokens", json={"name": "Integration configuration"}).json()["token"]
    assert anonymous.get("/api/auth/integration-config", headers={"Authorization": "Bearer " + key}).status_code == 401
