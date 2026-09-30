"""Persist portable user Tree Templates."""

from alembic import op
import sqlalchemy as sa


revision = "0010_tree_templates"
down_revision = "0009_public_api_v2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if "tree_templates" in sa.inspect(bind).get_table_names():
        return
    op.create_table(
        "tree_templates",
        sa.Column("id", sa.String(80), primary_key=True),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("category", sa.String(80), nullable=False),
        sa.Column("template_type", sa.String(24), nullable=False),
        sa.Column("definition_json", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_tree_templates_created_by", "tree_templates", ["created_by"])


def downgrade() -> None:
    bind = op.get_bind()
    if "tree_templates" not in sa.inspect(bind).get_table_names():
        return
    op.drop_index("ix_tree_templates_created_by", table_name="tree_templates")
    op.drop_table("tree_templates")
