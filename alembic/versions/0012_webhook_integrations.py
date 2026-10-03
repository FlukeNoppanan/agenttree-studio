"""Add independent incoming webhook integrations without changing legacy Trees."""

from alembic import op
import sqlalchemy as sa

revision = "0012_webhook_integrations"
down_revision = "0011_template_instances"
branch_labels = None
depends_on = None


def upgrade():
    if "webhook_integrations" in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table(
        "webhook_integrations",
        sa.Column("id", sa.String(35), primary_key=True),
        sa.Column("tree_id", sa.String(36), nullable=False),
        sa.Column("owner_user_id", sa.String(36), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("secret_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_received_at", sa.DateTime(timezone=True)),
        sa.ForeignKeyConstraint(["tree_id"], ["trees.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_webhook_integrations_tree_id", "webhook_integrations", ["tree_id"])
    op.create_index("ix_webhook_integrations_owner_user_id", "webhook_integrations", ["owner_user_id"])


def downgrade():
    op.drop_table("webhook_integrations")
