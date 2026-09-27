"""Destination configuration, repositories, database configuration, and migrations."""

from pathlib import Path
import sqlite3

import pytest
from alembic import command
from alembic.config import Config
from pydantic import ValidationError

from backend.core.config import PROJECT_ROOT, Settings
from backend.db.session import create_database_engine
from backend.models.destination import ResultDestination
from backend.models.tree import Tree
from backend.repositories.sqlalchemy import SQLAlchemyDestinationRepository, SQLAlchemyTreeRepository
from backend.schemas.destination import DestinationWrite
from backend.services.destination_service import DestinationService
from backend.services.errors import ResourceConflictError


def tree_record(database) -> Tree:
    tree = Tree(name="Destination Tree", description="", template="blank", status="draft")
    database.add(tree)
    database.commit()
    return tree


def test_destination_defaults_crud_and_repository_boundaries(database) -> None:
    tree = tree_record(database)
    service = DestinationService(database)

    defaults = service.list(tree.id)
    assert {item.destination_type.value for item in defaults} == {"store_in_studio", "api_response"}
    created = service.create(tree.id, DestinationWrite.model_validate({
        "name": "Ops Webhook", "destination_type": "webhook",
        "configuration": {"url": "https://example.test/results", "timeout_seconds": 8},
    }))
    updated = service.update(tree.id, created.id, DestinationWrite.model_validate({
        "name": "Updated Ops Webhook", "destination_type": "webhook", "enabled": False,
        "configuration": {"url": "https://example.test/results", "timeout_seconds": 12},
    }))
    assert updated.enabled is False
    assert SQLAlchemyDestinationRepository(database).get(created.id).name == "Updated Ops Webhook"
    assert SQLAlchemyTreeRepository(database).get(tree.id).id == tree.id
    service.delete(tree.id, created.id)
    assert SQLAlchemyDestinationRepository(database).get(created.id) is None
    with pytest.raises(ResourceConflictError):
        service.delete(tree.id, defaults[0].id)


def test_webhook_configuration_rejects_raw_credential_headers() -> None:
    with pytest.raises(ValidationError, match="Secret reference"):
        DestinationWrite.model_validate({
            "name": "Unsafe", "destination_type": "webhook",
            "configuration": {
                "url": "https://example.test/results",
                "headers": {"Authorization": "Bearer plaintext"},
            },
        })


def test_database_url_is_configurable_and_sqlite_factory_remains_testable(monkeypatch, tmp_path) -> None:
    url = f"sqlite:///{tmp_path / 'configured.db'}"
    monkeypatch.setenv("AGENTTREE_STUDIO_DATABASE_URL", url)
    assert Settings().database_url == url
    engine = create_database_engine(url)
    with engine.connect() as connection:
        assert connection.dialect.name == "sqlite"
    engine.dispose()


def test_alembic_upgrades_an_existing_unversioned_sqlite_schema(tmp_path: Path) -> None:
    database_path = tmp_path / "legacy.db"
    with sqlite3.connect(database_path) as connection:
        connection.execute("CREATE TABLE runs (id VARCHAR(36) PRIMARY KEY, input_json JSON NOT NULL)")
        connection.execute("CREATE TABLE tool_connections (id VARCHAR(36) PRIMARY KEY, name VARCHAR(160) NOT NULL, tool_type VARCHAR(40) NOT NULL, status VARCHAR(30) NOT NULL, description TEXT NOT NULL, configuration_json JSON NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL)")
        connection.commit()
    config = Config(str(PROJECT_ROOT / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{database_path}")

    command.upgrade(config, "head")

    with sqlite3.connect(database_path) as connection:
        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        columns = {row[1] for row in connection.execute("PRAGMA table_info(runs)")}
        tool_columns = {row[1] for row in connection.execute("PRAGMA table_info(tool_connections)")}
        model_columns = {row[1] for row in connection.execute("PRAGMA table_info(provider_models)")}
        token_columns = {row[1] for row in connection.execute("PRAGMA table_info(api_tokens)")}
        trace_columns = {row[1] for row in connection.execute("PRAGMA table_info(trace_events)")}
        revision = connection.execute("SELECT version_num FROM alembic_version").fetchone()[0]
    assert {"result_destinations", "result_deliveries"}.issubset(tables)
    assert {"metadata_json", "invocation_source"}.issubset(columns)
    assert {"enabled", "secret_id", "transport_type", "discovered_tools_json"}.issubset(tool_columns)
    assert {"generation_candidate", "qualification_status", "qualification_checked_at"}.issubset(model_columns)
    assert {"users", "user_permissions", "user_tree_access", "user_sessions", "api_tokens"}.issubset(tables)
    assert "last_used_at" in token_columns
    assert {"core_execution_id", "final_status", "usage_json", "metrics_json"}.issubset(columns)
    assert "core_sequence" in trace_columns
    assert "run_artifacts" in tables
    assert {"submitted_by_user_id", "submitted_by_token_id",
            "cancellation_requested_at"}.issubset(columns)
    assert "run_idempotency" in tables
    assert revision == "0009_public_api_v2"


def test_existing_tree_grants_migrate_to_selected_mode(tmp_path: Path) -> None:
    database_path = tmp_path / "existing-grants.db"
    config = Config(str(PROJECT_ROOT / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{database_path}")
    command.upgrade(config, "0005_primary_admin")
    with sqlite3.connect(database_path) as connection:
        connection.execute("INSERT INTO users (id, username, username_key, password_hash, is_admin, is_primary_admin, is_active, must_change_password, created_at, updated_at) VALUES ('user-1', 'member', 'member', 'hash', 0, 0, 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
        connection.execute("INSERT INTO trees (id, name, description, template, status, created_at, updated_at) VALUES ('tree-1', 'Tree', '', 'blank', 'draft', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
        connection.execute("INSERT INTO user_tree_access (user_id, tree_id) VALUES ('user-1', 'tree-1')")
    command.upgrade(config, "head")
    with sqlite3.connect(database_path) as connection:
        assert connection.execute("SELECT tree_access_mode FROM users WHERE id='user-1'").fetchone()[0] == "selected"
        assert connection.execute("SELECT tree_id FROM user_tree_access WHERE user_id='user-1'").fetchone()[0] == "tree-1"
