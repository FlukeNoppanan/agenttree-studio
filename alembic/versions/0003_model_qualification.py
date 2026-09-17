"""Persist real generation qualification for discovered provider models."""

from alembic import op
import sqlalchemy as sa

revision = "0003_model_qualification"
down_revision = "0002_destinations_and_invocation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {item["name"] for item in inspector.get_columns("provider_models")}
    indexes = {item["name"] for item in inspector.get_indexes("provider_models")}
    additions = {
        "generation_candidate": sa.Column(
            "generation_candidate", sa.Boolean(), nullable=False, server_default=sa.true(),
        ),
        "qualification_status": sa.Column(
            "qualification_status", sa.String(length=30), nullable=False, server_default="unknown",
        ),
        "qualification_checked_at": sa.Column(
            "qualification_checked_at", sa.DateTime(timezone=True), nullable=True,
        ),
        "qualification_error_code": sa.Column(
            "qualification_error_code", sa.String(length=80), nullable=True,
        ),
        "qualification_message": sa.Column(
            "qualification_message", sa.Text(), nullable=True,
        ),
    }
    with op.batch_alter_table("provider_models") as batch:
        for name, column in additions.items():
            if name not in columns:
                batch.add_column(column)
        if "ix_provider_models_qualification_status" not in indexes:
            batch.create_index(
                "ix_provider_models_qualification_status", ["qualification_status"], unique=False,
            )


def downgrade() -> None:
    with op.batch_alter_table("provider_models") as batch:
        batch.drop_index("ix_provider_models_qualification_status")
        batch.drop_column("qualification_message")
        batch.drop_column("qualification_error_code")
        batch.drop_column("qualification_checked_at")
        batch.drop_column("qualification_status")
        batch.drop_column("generation_candidate")
