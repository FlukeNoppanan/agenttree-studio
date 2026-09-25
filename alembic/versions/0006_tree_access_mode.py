"""Default all existing users to explicit, grant-only Tree access."""

from alembic import op
import sqlalchemy as sa

revision = "0006_tree_access_mode"
down_revision = "0005_primary_admin"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if "tree_access_mode" not in {column["name"] for column in sa.inspect(op.get_bind()).get_columns("users")}:
        op.add_column("users", sa.Column("tree_access_mode", sa.String(16), nullable=False, server_default="selected"))


def downgrade() -> None:
    op.drop_column("users", "tree_access_mode")
