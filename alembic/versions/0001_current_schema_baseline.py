"""Baseline the pre-destination Studio schema without destroying existing data."""

from alembic import op
import sqlalchemy as sa

import backend.models  # noqa: F401
from backend.db.base import Base

revision = "0001_current_schema_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    excluded = {"result_destinations", "result_deliveries"}
    for table in Base.metadata.sorted_tables:
        if table.name not in excluded:
            table.create(bind, checkfirst=True)
    # Adopt databases from the pre-Alembic executable-Tool phase as well as the
    # latest create_all shape. These additions are nullable/defaulted and keep rows.
    inspector = sa.inspect(bind)
    tool_columns = {item["name"] for item in inspector.get_columns("tool_connections")}
    additions = {
        "enabled": sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        "secret_id": sa.Column("secret_id", sa.String(length=36), nullable=True),
        "transport_type": sa.Column("transport_type", sa.String(length=40), nullable=True),
        "discovered_tools_json": sa.Column("discovered_tools_json", sa.JSON(), nullable=True),
        "last_checked_at": sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=True),
        "last_error": sa.Column("last_error", sa.Text(), nullable=True),
    }
    missing = [column for name, column in additions.items() if name not in tool_columns]
    if missing:
        with op.batch_alter_table("tool_connections") as batch:
            for column in missing:
                batch.add_column(column)
    op.execute(sa.text(
        "UPDATE tool_connections SET status = 'not_configured' WHERE status = 'available'",
    ))


def downgrade() -> None:
    # A baseline downgrade intentionally leaves pre-existing user data intact.
    pass
