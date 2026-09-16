"""SQLite engine and session factory for local Studio persistence."""

from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from backend.core.config import settings
from backend.db.base import Base

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@event.listens_for(Engine, "connect")
def enable_sqlite_foreign_keys(dbapi_connection, _) -> None:
    """Make SQLite enforce the same foreign-key rules as production databases."""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def get_db() -> Generator[Session, None, None]:
    """Yield one transaction-capable database session per API request."""
    database = SessionLocal()
    try:
        yield database
    finally:
        database.close()


def initialize_database() -> None:
    """Create tables registered by Studio models.

    The first milestone intentionally defines no product entities yet. Keeping
    initialization here gives later Tree, Run, and Trace models one boundary.
    """
    # Import model modules before create_all so SQLAlchemy sees their metadata.
    import backend.models  # noqa: F401

    Base.metadata.create_all(bind=engine)
