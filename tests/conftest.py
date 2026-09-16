"""Isolated database and ASGI fixtures for Studio API tests."""

from collections.abc import Iterator

import pytest
from cryptography.fernet import Fernet
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import backend.models  # noqa: F401
from backend.db.base import Base


@pytest.fixture(autouse=True)
def encryption_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(
        "AGENTTREE_STUDIO_ENCRYPTION_KEY",
        Fernet.generate_key().decode("utf-8"),
    )


@pytest.fixture
def database_factory() -> Iterator[sessionmaker[Session]]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    Base.metadata.create_all(engine)
    yield factory
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def database(database_factory: sessionmaker[Session]) -> Iterator[Session]:
    with database_factory() as session:
        yield session
