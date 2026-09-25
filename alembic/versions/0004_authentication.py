"""Add identities, per-user permissions, Tree grants, sessions, tokens and audit events."""

from alembic import op
import sqlalchemy as sa

revision = "0004_authentication"
down_revision = "0003_model_qualification"
branch_labels = None
depends_on = None


def upgrade() -> None:
    def create(name: str, *columns: sa.Column) -> None:
        if name not in sa.inspect(op.get_bind()).get_table_names():
            op.create_table(name, *columns)

    def index(name: str, table: str, columns: list[str], unique: bool = False) -> None:
        if name not in {item["name"] for item in sa.inspect(op.get_bind()).get_indexes(table)}:
            op.create_index(name, table, columns, unique=unique)

    create("users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("username", sa.String(160), nullable=False),
        sa.Column("username_key", sa.String(160), nullable=False),
        sa.Column("password_hash", sa.String(300), nullable=False),
        sa.Column("is_admin", sa.Boolean(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("must_change_password", sa.Boolean(), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    index("ix_users_username_key", "users", ["username_key"], unique=True)
    create("user_permissions",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("permission", sa.String(80), primary_key=True),
    )
    create("user_tree_access",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("tree_id", sa.String(36), sa.ForeignKey("trees.id", ondelete="CASCADE"), primary_key=True),
    )
    create("user_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    index("ix_user_sessions_user_id", "user_sessions", ["user_id"])
    create("api_tokens",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
    )
    index("ix_api_tokens_user_id", "api_tokens", ["user_id"])
    create("security_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("actor_user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("event_type", sa.String(80), nullable=False),
        sa.Column("subject_user_id", sa.String(36)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("security_events")
    op.drop_index("ix_api_tokens_user_id", table_name="api_tokens")
    op.drop_table("api_tokens")
    op.drop_index("ix_user_sessions_user_id", table_name="user_sessions")
    op.drop_table("user_sessions")
    op.drop_table("user_tree_access")
    op.drop_table("user_permissions")
    op.drop_index("ix_users_username_key", table_name="users")
    op.drop_table("users")
