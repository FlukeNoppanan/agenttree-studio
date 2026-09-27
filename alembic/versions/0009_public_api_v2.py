"""Add Public API V2 ownership, cancellation, artifact, and idempotency state."""

from alembic import op
import sqlalchemy as sa

revision = "0009_public_api_v2"
down_revision = "0008_core_runtime_integration"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    run_columns = {item["name"] for item in inspector.get_columns("runs")}
    if "submitted_by_user_id" not in run_columns:
        op.add_column("runs", sa.Column("submitted_by_user_id", sa.String(36), nullable=True))
    if "submitted_by_token_id" not in run_columns:
        op.add_column("runs", sa.Column("submitted_by_token_id", sa.String(36), nullable=True))
    if "cancellation_requested_at" not in run_columns:
        op.add_column("runs", sa.Column("cancellation_requested_at", sa.DateTime(timezone=True), nullable=True))
    run_indexes = {item["name"] for item in inspector.get_indexes("runs")}
    if "ix_runs_submitted_by_user_id" not in run_indexes:
        op.create_index("ix_runs_submitted_by_user_id", "runs", ["submitted_by_user_id"])
    if "ix_runs_submitted_by_token_id" not in run_indexes:
        op.create_index("ix_runs_submitted_by_token_id", "runs", ["submitted_by_token_id"])
    constraints = {item.get("name") for item in inspector.get_foreign_keys("runs")}
    if bind.dialect.name != "sqlite" and "fk_runs_submitted_user" not in constraints:
        op.create_foreign_key("fk_runs_submitted_user", "runs", "users",
                              ["submitted_by_user_id"], ["id"], ondelete="SET NULL")
    if bind.dialect.name != "sqlite" and "fk_runs_submitted_token" not in constraints:
        op.create_foreign_key("fk_runs_submitted_token", "runs", "api_tokens",
                              ["submitted_by_token_id"], ["id"], ondelete="SET NULL")
    artifact_columns = {item["name"] for item in inspector.get_columns("run_artifacts")}
    if "body_available" not in artifact_columns:
        op.add_column("run_artifacts", sa.Column(
            "body_available", sa.Boolean(), nullable=False, server_default=sa.false(),
        ))
    if "run_idempotency" in inspector.get_table_names():
        return
    op.create_table(
        "run_idempotency",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("api_token_id", sa.String(36), nullable=False),
        sa.Column("run_id", sa.String(36), nullable=False),
        sa.Column("action", sa.String(40), nullable=False),
        sa.Column("key_hash", sa.String(64), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["api_token_id"], ["api_tokens.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["run_id"], ["runs.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("api_token_id", "action", "key_hash", name="uq_run_idempotency_scope"),
        sa.UniqueConstraint("run_id"),
    )
    op.create_index("ix_run_idempotency_api_token_id", "run_idempotency", ["api_token_id"])
    op.create_index("ix_run_idempotency_expires_at", "run_idempotency", ["expires_at"])


def downgrade() -> None:
    op.drop_table("run_idempotency")
    op.drop_column("run_artifacts", "body_available")
    op.drop_index("ix_runs_submitted_by_token_id", table_name="runs")
    op.drop_index("ix_runs_submitted_by_user_id", table_name="runs")
    if op.get_bind().dialect.name != "sqlite":
        op.drop_constraint("fk_runs_submitted_token", "runs", type_="foreignkey")
        op.drop_constraint("fk_runs_submitted_user", "runs", type_="foreignkey")
        op.drop_column("runs", "cancellation_requested_at")
        op.drop_column("runs", "submitted_by_token_id")
        op.drop_column("runs", "submitted_by_user_id")
    else:
        convention = {"fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s"}
        with op.batch_alter_table("runs", naming_convention=convention) as batch:
            foreign_keys = {tuple(item["constrained_columns"]): item.get("name")
                            for item in sa.inspect(op.get_bind()).get_foreign_keys("runs")}
            if ("submitted_by_token_id",) in foreign_keys:
                batch.drop_constraint(
                    foreign_keys[("submitted_by_token_id",)] or
                    "fk_runs_submitted_by_token_id_api_tokens", type_="foreignkey",
                )
            if ("submitted_by_user_id",) in foreign_keys:
                batch.drop_constraint(
                    foreign_keys[("submitted_by_user_id",)] or
                    "fk_runs_submitted_by_user_id_users", type_="foreignkey",
                )
            batch.drop_column("cancellation_requested_at")
            batch.drop_column("submitted_by_token_id")
            batch.drop_column("submitted_by_user_id")
