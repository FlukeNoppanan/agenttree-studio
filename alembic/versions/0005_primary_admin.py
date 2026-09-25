"""Protect one existing administrator as the authoritative primary Admin."""

from alembic import op
import sqlalchemy as sa

revision = "0005_primary_admin"
down_revision = "0004_authentication"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("users")}
    if "is_primary_admin" not in columns:
        op.add_column("users", sa.Column("is_primary_admin", sa.Boolean(), nullable=False, server_default=sa.false()))
    # Existing installations keep every password/hash and all user data. Prefer
    # the built-in admin name, but use a stable oldest Admin when renamed.
    if bind.execute(sa.text("SELECT COUNT(*) FROM users WHERE is_primary_admin = true")).scalar() == 0:
        row = bind.execute(sa.text("""
            SELECT id FROM users WHERE is_admin = true
            ORDER BY CASE WHEN username_key = 'admin' THEN 0 ELSE 1 END, created_at, id LIMIT 1
        """)).first()
        if row:
            bind.execute(sa.text("UPDATE users SET is_primary_admin = true WHERE id = :id"), {"id": row.id})
    indexes = {index["name"] for index in sa.inspect(bind).get_indexes("users")}
    if "uq_users_one_primary_admin" not in indexes:
        op.create_index("uq_users_one_primary_admin", "users", ["is_primary_admin"], unique=True,
                        postgresql_where=sa.text("is_primary_admin = true"),
                        sqlite_where=sa.text("is_primary_admin = 1"))


def downgrade() -> None:
    op.drop_index("uq_users_one_primary_admin", table_name="users")
    op.drop_column("users", "is_primary_admin")
