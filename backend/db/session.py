"""Configurable SQLAlchemy engine and request-scoped session factory."""

from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from backend.core.config import PROJECT_ROOT, settings

def create_database_engine(database_url: str) -> Engine:
    """Build a portable engine while retaining SQLite development safeguards."""
    options = {"connect_args": {"check_same_thread": False}} if database_url.startswith("sqlite") else {}
    database_engine = create_engine(database_url, **options)
    if database_engine.dialect.name == "sqlite":
        @event.listens_for(database_engine, "connect")
        def enable_sqlite_foreign_keys(dbapi_connection, _) -> None:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()
    return database_engine


engine = create_database_engine(settings.database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    """Yield one transaction-capable database session per API request."""
    database = SessionLocal()
    try:
        yield database
    finally:
        database.close()


def initialize_database() -> None:
    """Upgrade the configured database to the latest versioned schema."""
    from alembic import command
    from alembic.config import Config

    config = Config(str(PROJECT_ROOT / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", settings.database_url.replace("%", "%%"))
    command.upgrade(config, "head")
