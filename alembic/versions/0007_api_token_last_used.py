"""Track coarse successful use of personal API keys."""

from alembic import op
import sqlalchemy as sa

revision = "0007_api_token_last_used"
down_revision = "0006_tree_access_mode"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if "last_used_at" not in {column["name"] for column in sa.inspect(op.get_bind()).get_columns("api_tokens")}:
        op.add_column("api_tokens", sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("api_tokens", "last_used_at")
