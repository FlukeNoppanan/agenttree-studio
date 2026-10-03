"""Getting Started facts use existing readiness, grants and persisted Runs."""
from datetime import datetime, timezone
from starlette.requests import Request
from backend.api import dashboard
from backend.models.auth import User, UserPermission, UserTreeAccess
from backend.models.provider import ProviderConnection, ProviderModel
from backend.models.tree import Tree, TreeVersion
from backend.models.run import Run


def account(database, monkeypatch, permissions=(), admin=False):
    user = User(username="beginner", username_key="beginner", password_hash="unused", is_admin=admin)
    database.add(user)
    database.flush()
    user.permissions = [UserPermission(permission=p) for p in permissions]
    database.commit()
    monkeypatch.setattr(dashboard, "current_user", lambda *_: user)
    return user


def facts(database):
    return dashboard.my_dashboard(Request({"type": "http"}), database).onboarding


def tree(database, status="draft", version_status="draft"):
    item = Tree(name="First", status=status)
    version = TreeVersion(tree=item, version_number=1, status=version_status)
    item.current_version = version
    database.add(item)
    database.commit()
    return item


def test_fresh_admin_has_no_fabricated_progress(database, monkeypatch):
    account(database, monkeypatch, admin=True)
    result = facts(database)
    assert result.provider_ready is False
    assert result.trees == []
    assert result.has_successful_run is False
    assert result.runnable_tree_id is None


def test_provider_requires_connected_and_verified_generation_model(database, monkeypatch):
    account(database, monkeypatch, ["manage_providers_models"])
    provider = ProviderConnection(name="AI", provider_type="gemini", status="error")
    database.add(provider); database.flush()
    model = ProviderModel(provider_connection_id=provider.id, model_id="real", is_available=True,
                          generation_candidate=True, qualification_status="qualified")
    database.add(model); database.commit()
    assert facts(database).provider_ready is False
    provider.status = "connected"; database.commit()
    assert facts(database).provider_ready is True
    model.qualification_status = "unknown"; database.commit()
    assert facts(database).provider_ready is False


def test_ready_requires_current_tree_and_version_and_run_grant(database, monkeypatch):
    user = account(database, monkeypatch, ["manage_trees_agents", "use_trees"])
    item = tree(database, "ready", "draft")
    assert facts(database).trees == []  # Management still requires resource access.
    database.add(UserTreeAccess(user_id=user.id, tree_id=item.id)); database.commit()
    assert not facts(database).trees[0].ready
    item.current_version.status = "ready"; database.commit()
    assert facts(database).trees[0].ready
    assert facts(database).runnable_tree_id == item.id
    database.delete(user.tree_grants[0]); database.commit()
    assert facts(database).trees == []
    assert facts(database).runnable_tree_id is None


def test_completion_uses_success_ownership_and_current_grants(database, monkeypatch):
    user = account(database, monkeypatch, ["view_executions", "use_trees"])
    other = User(username="other", username_key="other", password_hash="unused")
    database.add(other); database.commit()
    item = tree(database, "ready", "ready")
    grant = UserTreeAccess(user_id=user.id, tree_id=item.id)
    run = Run(tree=item, tree_version=item.current_version, status="completed", input_json={},
              started_at=datetime.now(timezone.utc), submitted_by_user_id=other.id)
    database.add_all([grant, run]); database.commit()
    assert facts(database).has_successful_run is False
    run.submitted_by_user_id = user.id; run.status = "failed"; database.commit()
    assert facts(database).has_successful_run is False
    run.status = "completed"; database.commit()
    assert facts(database).successful_run_id == run.id
    database.delete(grant); database.commit()
    assert facts(database).trees == []
    assert facts(database).has_successful_run is False


def test_legacy_unowned_success_counts_only_on_accessible_tree(database, monkeypatch):
    user = account(database, monkeypatch, ["view_executions", "use_trees"])
    item = tree(database, "ready", "ready")
    database.add(Run(tree=item, tree_version=item.current_version, status="completed", input_json={},
                     started_at=datetime.now(timezone.utc)))
    database.commit()
    assert facts(database).has_successful_run is False
    database.add(UserTreeAccess(user_id=user.id, tree_id=item.id)); database.commit()
    assert facts(database).has_successful_run is True


def test_restricted_account_receives_no_hidden_resources(database, monkeypatch):
    account(database, monkeypatch)
    tree(database, "ready", "ready")
    result = facts(database)
    assert result.trees == []
    assert result.provider_ready is None
    assert result.has_successful_run is None
