"""Persist Core execution correlation, event sequence, and artifact metadata."""

from alembic import op
import sqlalchemy as sa

revision = "0008_core_runtime_integration"
down_revision = "0007_api_token_last_used"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    run_columns = {item["name"] for item in inspector.get_columns("runs")}
    with op.batch_alter_table("runs") as batch:
        if "core_execution_id" not in run_columns:
            batch.add_column(sa.Column("core_execution_id", sa.String(36), nullable=True))
            batch.create_unique_constraint("uq_runs_core_execution_id", ["core_execution_id"])
        if "final_status" not in run_columns:
            batch.add_column(sa.Column("final_status", sa.String(40), nullable=True))
        if "usage_json" not in run_columns:
            batch.add_column(sa.Column("usage_json", sa.JSON(), nullable=True))
        if "metrics_json" not in run_columns:
            batch.add_column(sa.Column("metrics_json", sa.JSON(), nullable=True))
    trace_columns = {item["name"] for item in inspector.get_columns("trace_events")}
    with op.batch_alter_table("trace_events") as batch:
        if "core_sequence" not in trace_columns:
            batch.add_column(sa.Column("core_sequence", sa.Integer(), nullable=True))
            batch.create_unique_constraint("uq_trace_event_core_sequence", ["run_id", "core_sequence"])
    if "run_artifacts" not in inspector.get_table_names():
        op.create_table(
            "run_artifacts",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("run_id", sa.String(36), nullable=False),
            sa.Column("core_artifact_id", sa.String(64), nullable=False),
            sa.Column("artifact_type", sa.String(30), nullable=False),
            sa.Column("name", sa.String(160), nullable=False),
            sa.Column("logical_path", sa.String(512), nullable=True),
            sa.Column("operation", sa.String(30), nullable=False),
            sa.Column("media_type", sa.String(160), nullable=False),
            sa.Column("size_bytes", sa.Integer(), nullable=False),
            sa.Column("sha256", sa.String(64), nullable=False),
            sa.Column("producer_role", sa.String(30), nullable=False),
            sa.Column("producer_agent_id", sa.String(80), nullable=True),
            sa.Column("metadata_json", sa.JSON(), nullable=False),
            sa.Column("is_final", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["run_id"], ["runs.id"], ondelete="CASCADE"),
            sa.UniqueConstraint("run_id", "core_artifact_id", name="uq_run_core_artifact"),
        )
        op.create_index("ix_run_artifacts_run_id", "run_artifacts", ["run_id"])


def downgrade() -> None:
    op.drop_table("run_artifacts")
    inspector = sa.inspect(op.get_bind())
    trace_constraints = {
        item.get("name") for item in inspector.get_unique_constraints("trace_events")
    }
    with op.batch_alter_table("trace_events") as batch:
        if "uq_trace_event_core_sequence" in trace_constraints:
            batch.drop_constraint("uq_trace_event_core_sequence", type_="unique")
        batch.drop_column("core_sequence")
    inspector = sa.inspect(op.get_bind())
    run_constraints = {
        item.get("name") for item in inspector.get_unique_constraints("runs")
    }
    with op.batch_alter_table("runs") as batch:
        batch.drop_column("metrics_json")
        batch.drop_column("usage_json")
        batch.drop_column("final_status")
        if "uq_runs_core_execution_id" in run_constraints:
            batch.drop_constraint("uq_runs_core_execution_id", type_="unique")
        batch.drop_column("core_execution_id")
