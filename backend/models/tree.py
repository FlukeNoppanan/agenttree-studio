"""Versioned AgentTree Studio configuration persistence."""

from uuid import uuid4

from sqlalchemy import ForeignKey, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base
from backend.models.common import TimestampMixin


class Tree(TimestampMixin, Base):
    __tablename__ = "trees"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    template: Mapped[str] = mapped_column(String(80), nullable=False, default="blank")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="draft")
    current_version_id: Mapped[str | None] = mapped_column(
        ForeignKey("tree_versions.id", ondelete="SET NULL", use_alter=True), nullable=True,
    )

    versions = relationship(
        "TreeVersion",
        back_populates="tree",
        cascade="all, delete-orphan",
        foreign_keys="TreeVersion.tree_id",
    )
    current_version = relationship(
        "TreeVersion",
        foreign_keys=[current_version_id],
        post_update=True,
    )
    runs = relationship(
        "Run", back_populates="tree", cascade="all, delete-orphan",
        passive_deletes=True,
    )
    destinations = relationship(
        "ResultDestination", back_populates="tree", cascade="all, delete-orphan",
        passive_deletes=True,
    )


class TreeVersion(TimestampMixin, Base):
    __tablename__ = "tree_versions"
    __table_args__ = (
        UniqueConstraint("tree_id", "version_number", name="uq_tree_version_number"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tree_id: Mapped[str] = mapped_column(
        ForeignKey("trees.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    version_number: Mapped[int] = mapped_column(nullable=False, default=1)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="draft")

    tree = relationship("Tree", back_populates="versions", foreign_keys=[tree_id])
    agents = relationship(
        "AgentConfig", back_populates="tree_version", cascade="all, delete-orphan",
    )
    trigger = relationship(
        "TriggerConfig", back_populates="tree_version", cascade="all, delete-orphan",
        uselist=False,
    )
    output = relationship(
        "OutputConfig", back_populates="tree_version", cascade="all, delete-orphan",
        uselist=False,
    )
    tool_assignments = relationship(
        "ToolAssignment", back_populates="tree_version", cascade="all, delete-orphan",
    )
    runs = relationship(
        "Run", back_populates="tree_version", cascade="all, delete-orphan",
        passive_deletes=True,
    )


class AgentConfig(TimestampMixin, Base):
    __tablename__ = "agent_configs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tree_version_id: Mapped[str] = mapped_column(
        ForeignKey("tree_versions.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    agent_type: Mapped[str] = mapped_column(String(30), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    parent_agent_id: Mapped[str | None] = mapped_column(
        ForeignKey("agent_configs.id", ondelete="CASCADE"), nullable=True,
    )
    provider_connection_id: Mapped[str | None] = mapped_column(
        ForeignKey("provider_connections.id", ondelete="RESTRICT"), nullable=True,
    )
    model_id: Mapped[str | None] = mapped_column(String(300), nullable=True)
    system_instruction: Mapped[str | None] = mapped_column(Text, nullable=True)
    capabilities_json: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    settings_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    tree_version = relationship("TreeVersion", back_populates="agents")
    parent = relationship(
        "AgentConfig", remote_side=[id], back_populates="children",
        foreign_keys=[parent_agent_id],
    )
    children = relationship("AgentConfig", back_populates="parent", passive_deletes=True)
    provider_connection = relationship("ProviderConnection")
    tool_assignments = relationship(
        "ToolAssignment", back_populates="agent_config", passive_deletes=True,
    )


class TriggerConfig(Base):
    __tablename__ = "trigger_configs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tree_version_id: Mapped[str] = mapped_column(
        ForeignKey("tree_versions.id", ondelete="CASCADE"), nullable=False, unique=True,
    )
    trigger_type: Mapped[str] = mapped_column(String(40), nullable=False)
    config_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    tree_version = relationship("TreeVersion", back_populates="trigger")


class OutputConfig(Base):
    __tablename__ = "output_configs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tree_version_id: Mapped[str] = mapped_column(
        ForeignKey("tree_versions.id", ondelete="CASCADE"), nullable=False, unique=True,
    )
    output_type: Mapped[str] = mapped_column(String(40), nullable=False)
    delivery_type: Mapped[str] = mapped_column(String(40), nullable=False)
    config_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    tree_version = relationship("TreeVersion", back_populates="output")
