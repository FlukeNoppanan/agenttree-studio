"""Startup migration ownership and ordered post-schema initialization."""

import asyncio
import os
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from cryptography.fernet import Fernet
from sqlalchemy import create_engine

import backend.main as main
import backend.db.session as database_session
import backend.services.async_runs as async_runs
import backend.services.core_runtime as core_runtime


def _exercise_lifespan(monkeypatch, *, railway: bool) -> list[str]:
    calls: list[str] = []
    if railway:
        monkeypatch.setenv("AGENTTREE_STUDIO_DEPLOYMENT", "railway")
        monkeypatch.setenv("DATABASE_URL", "postgresql://user@database/studio")
        monkeypatch.setenv("AGENTTREE_STUDIO_ENCRYPTION_KEY", Fernet.generate_key().decode())
        monkeypatch.setenv("AGENTTREE_STUDIO_ADMIN_USERNAME", "testadmin")
        monkeypatch.setenv("AGENTTREE_STUDIO_ADMIN_PASSWORD", "a-strong-test-password")
        monkeypatch.setenv("AGENTTREE_STUDIO_ARTIFACT_ROOT", "/data/artifacts")
        monkeypatch.setenv("AGENTTREE_STUDIO_PUBLIC_ORIGIN", "https://studio.example.test")
        monkeypatch.setenv("AGENTTREE_STUDIO_SECURE_COOKIES", "true")
        monkeypatch.setattr(main, "settings", SimpleNamespace(
            database_url="postgresql+psycopg://user@database/studio",
            encryption_key=os.environ["AGENTTREE_STUDIO_ENCRYPTION_KEY"],
            public_origin="https://studio.example.test",
        ))
    else:
        monkeypatch.delenv("AGENTTREE_STUDIO_DEPLOYMENT", raising=False)

    monkeypatch.setattr(main, "initialize_database", lambda: calls.append("migration"))

    @contextmanager
    def fake_session():
        calls.append("session")
        yield object()

    class FakeAuthService:
        def __init__(self, database):
            pass

        def bootstrap(self, username, password):
            calls.append("bootstrap")

    monkeypatch.setattr(main, "SessionLocal", fake_session)
    monkeypatch.setattr(main, "AuthService", FakeAuthService)
    monkeypatch.setattr(async_runs, "reconcile_interrupted_runs",
                        lambda database: calls.append("reconcile"))
    monkeypatch.setattr(async_runs, "shutdown_async_run_coordinator", lambda: None)
    monkeypatch.setattr(core_runtime, "shutdown_studio_runtime", lambda: None)

    async def start() -> None:
        async with main.lifespan(main.app):
            calls.append("ready")

    asyncio.run(start())
    return calls


def test_railway_startup_uses_entrypoint_migration_then_bootstrap(monkeypatch):
    assert _exercise_lifespan(monkeypatch, railway=True) == [
        "session", "bootstrap", "reconcile", "ready",
    ]


def test_local_startup_migrates_before_bootstrap_and_reconcile(monkeypatch):
    assert _exercise_lifespan(monkeypatch, railway=False) == [
        "migration", "session", "bootstrap", "reconcile", "ready",
    ]


def test_direct_local_schema_initialization_reaches_head(tmp_path: Path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'local.db'}"
    monkeypatch.setattr(database_session, "settings", SimpleNamespace(database_url=url))
    database_session.initialize_database()
    engine = create_engine(url)
    with engine.connect() as connection:
        current = MigrationContext.configure(connection).get_current_revision()
    head = ScriptDirectory.from_config(
        Config(str(database_session.PROJECT_ROOT / "alembic.ini"))).get_current_head()
    assert current == head
    engine.dispose()
