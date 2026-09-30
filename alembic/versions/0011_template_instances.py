"""Persist portable Template snapshots on instantiated Tree versions."""

from alembic import op
import sqlalchemy as sa


revision = "0011_template_instances"
down_revision = "0010_tree_templates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {item["name"] for item in sa.inspect(bind).get_columns("tree_versions")}
    if "template_instance_json" not in columns:
        op.add_column(
            "tree_versions",
            sa.Column("template_instance_json", sa.JSON(), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    columns = {item["name"] for item in sa.inspect(bind).get_columns("tree_versions")}
    if "template_instance_json" in columns:
        op.drop_column("tree_versions", "template_instance_json")
