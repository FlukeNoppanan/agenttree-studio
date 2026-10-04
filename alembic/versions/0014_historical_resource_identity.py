"""Retain safe binding identity while allowing historical-only resource deletion.

Revision ID: 0014_resource_history
Revises: 0013_run_cancellation_status
"""
from alembic import op
import sqlalchemy as sa

revision = "0014_resource_history"
down_revision = "0013_run_cancellation_status"
branch_labels = None
depends_on = None

_BINDINGS = (
    ("agent_configs", "provider_connection_id", "provider_connections", "provider_identity_json", "provider_type"),
    ("tool_assignments", "tool_connection_id", "tool_connections", "tool_identity_json", "tool_type"),
)
_CONVENTION = {"fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s"}


def upgrade():
    bind = op.get_bind()
    for table, column, resource, snapshot, kind in _BINDINGS:
        inspector = sa.inspect(bind)
        if table not in inspector.get_table_names():
            continue
        columns = {c["name"] for c in inspector.get_columns(table)}
        if snapshot not in columns:
            op.add_column(table, sa.Column(snapshot, sa.JSON(), nullable=True))
        # Explicit allow-list, including no Secret IDs, URLs or configuration.
        refs = sa.table(resource, sa.column("id"), sa.column("name"), sa.column(kind))
        target = sa.table(table, sa.column(column), sa.column(snapshot, sa.JSON()))
        for row in bind.execute(sa.select(refs)).mappings():
            bind.execute(target.update().where(target.c[column] == row["id"], target.c[snapshot].is_(None)).values(
                {snapshot: {"id": row["id"], "name": row["name"], "resource_type": row[kind]}}))
        fks = sa.inspect(bind).get_foreign_keys(table)
        with op.batch_alter_table(table, naming_convention=_CONVENTION) as batch:
            for fk in fks:
                if fk["constrained_columns"] == [column]:
                    batch.drop_constraint(fk["name"] or f"fk_{table}_{column}_{resource}", type_="foreignkey")
            batch.alter_column(column, existing_type=sa.String(36), nullable=True)
            batch.create_foreign_key(f"fk_{table}_{column}_{resource}", resource, [column], ["id"], ondelete="SET NULL")


def downgrade():
    bind = op.get_bind()
    # Never discard tombstones or history in a downgrade. Restore a backup to
    # downgrade after resources have been removed, rather than silently lose it.
    for table, column, _, snapshot, _ in _BINDINGS:
        if bind.execute(sa.text(f"SELECT count(*) FROM {table} WHERE {column} IS NULL AND {snapshot} IS NOT NULL")).scalar():
            raise RuntimeError("Historical deleted-resource identities exist; downgrade would lose history")
    for table, column, resource, snapshot, _ in _BINDINGS:
        with op.batch_alter_table(table, naming_convention=_CONVENTION) as batch:
            batch.drop_constraint(f"fk_{table}_{column}_{resource}", type_="foreignkey")
            batch.create_foreign_key(f"fk_{table}_{column}_{resource}", resource, [column], ["id"], ondelete="RESTRICT")
            if table == "tool_assignments":
                batch.alter_column(column, existing_type=sa.String(36), nullable=False)
            batch.drop_column(snapshot)
