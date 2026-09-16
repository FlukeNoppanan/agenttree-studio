"""Minimal persisted tool catalog and draft assignment integration point."""

from uuid import uuid4

from sqlalchemy import ForeignKey, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base
from backend.models.common import TimestampMixin


class ToolConnection(TimestampMixin, Base):
    __tablename__ = "tool_connections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    tool_type: Mapped[str] = mapped_column(String(40), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="available")
    config_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    assignments = relationship(
        "ToolAssignment", back_populates="tool_connection", passive_deletes=True,
    )


class ToolAssignment(Base):
    __tablename__ = "tool_assignments"
    __table_args__ = (
        UniqueConstraint("agent_config_id", "tool_connection_id", name="uq_agent_tool"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tree_version_id: Mapped[str] = mapped_column(
        ForeignKey("tree_versions.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    agent_config_id: Mapped[str] = mapped_column(
        ForeignKey("agent_configs.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    tool_connection_id: Mapped[str] = mapped_column(
        ForeignKey("tool_connections.id", ondelete="RESTRICT"), nullable=False,
    )

    tree_version = relationship("TreeVersion", back_populates="tool_assignments")
    agent_config = relationship("AgentConfig", back_populates="tool_assignments")
    tool_connection = relationship("ToolConnection", back_populates="assignments")
