"""Add reusable invocation metadata, result destinations, and delivery logs."""

from alembic import op
import sqlalchemy as sa

revision = "0002_destinations_and_invocation"
down_revision = "0001_current_schema_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    run_columns = {item["name"] for item in inspector.get_columns("runs")}
    with op.batch_alter_table("runs") as batch:
        if "metadata_json" not in run_columns:
            batch.add_column(sa.Column("metadata_json", sa.JSON(), nullable=False, server_default=sa.text("'{}'")))
        if "invocation_source" not in run_columns:
            batch.add_column(sa.Column("invocation_source", sa.String(length=40), nullable=False, server_default="studio_test"))
    if "result_destinations" not in tables:
        op.create_table(
            "result_destinations",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("tree_id", sa.String(length=36), nullable=False),
            sa.Column("name", sa.String(length=160), nullable=False),
            sa.Column("destination_type", sa.String(length=40), nullable=False),
            sa.Column("enabled", sa.Boolean(), nullable=False),
            sa.Column("configuration_json", sa.JSON(), nullable=False),
            sa.Column("secret_id", sa.String(length=36), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["secret_id"], ["secrets.id"], ondelete="RESTRICT"),
            sa.ForeignKeyConstraint(["tree_id"], ["trees.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_result_destinations_tree_id", "result_destinations", ["tree_id"])
        op.create_index("ix_result_destinations_destination_type", "result_destinations", ["destination_type"])
    if "result_deliveries" not in tables:
        op.create_table(
            "result_deliveries",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("run_id", sa.String(length=36), nullable=False),
            sa.Column("destination_id", sa.String(length=36), nullable=True),
            sa.Column("destination_name", sa.String(length=160), nullable=False),
            sa.Column("destination_type", sa.String(length=40), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False),
            sa.Column("attempted_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("sanitized_error", sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(["destination_id"], ["result_destinations.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["run_id"], ["runs.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("run_id", "destination_id", name="uq_run_destination_delivery"),
        )
        op.create_index("ix_result_deliveries_run_id", "result_deliveries", ["run_id"])
        op.create_index("ix_result_deliveries_destination_id", "result_deliveries", ["destination_id"])
        op.create_index("ix_result_deliveries_status", "result_deliveries", ["status"])


def downgrade() -> None:
    op.drop_table("result_deliveries")
    op.drop_table("result_destinations")
    with op.batch_alter_table("runs") as batch:
        batch.drop_column("invocation_source")
        batch.drop_column("metadata_json")
