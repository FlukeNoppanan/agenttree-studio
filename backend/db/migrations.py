"""Small idempotent SQLite migrations for the local Studio database."""

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


TOOL_COLUMNS = {
    "enabled": "BOOLEAN NOT NULL DEFAULT 1",
    "secret_id": "VARCHAR(36) REFERENCES secrets(id) ON DELETE RESTRICT",
    "transport_type": "VARCHAR(40)",
    "discovered_tools_json": "JSON",
    "last_checked_at": "DATETIME",
    "last_error": "TEXT",
}


def apply_local_migrations(engine: Engine) -> None:
    """Add known nullable/defaulted columns without rebuilding user tables."""
    if engine.dialect.name != "sqlite":
        return
    inspector = inspect(engine)
    if "tool_connections" not in inspector.get_table_names():
        return
    existing = {column["name"] for column in inspector.get_columns("tool_connections")}
    with engine.begin() as connection:
        for name, declaration in TOOL_COLUMNS.items():
            if name not in existing:
                connection.execute(text(
                    f"ALTER TABLE tool_connections ADD COLUMN {name} {declaration}",
                ))
        connection.execute(text(
            "UPDATE tool_connections SET status = 'not_configured' "
            "WHERE status = 'available'",
        ))
