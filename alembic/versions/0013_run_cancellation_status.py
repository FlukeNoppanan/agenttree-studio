"""Allow the existing cancellation_requested Run status on PostgreSQL.

Revision ID: 0013_run_cancellation_status
Revises: 0012_webhook_integrations
"""

from alembic import op
import sqlalchemy as sa

revision = "0013_run_cancellation_status"
down_revision = "0012_webhook_integrations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Older unversioned development schemas may contain only a partial runs table.
    if "status" not in {column["name"] for column in sa.inspect(op.get_bind()).get_columns("runs")}:
        return
    with op.batch_alter_table("runs") as batch:
        batch.alter_column("status", existing_type=sa.String(20), type_=sa.String(32), existing_nullable=False)


def downgrade() -> None:
    if "status" not in {column["name"] for column in sa.inspect(op.get_bind()).get_columns("runs")}:
        return
    # Preserve active cancellation rows rather than truncate their status.
    connection = op.get_bind()
    if connection.execute(sa.text("SELECT COUNT(*) FROM runs WHERE length(status) > 20")).scalar():
        raise RuntimeError("Cannot narrow Run status while long statuses remain; finish active cancellation first")
    with op.batch_alter_table("runs") as batch:
        batch.alter_column("status", existing_type=sa.String(32), type_=sa.String(20), existing_nullable=False)
