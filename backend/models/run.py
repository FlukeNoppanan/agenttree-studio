"""Persisted synchronous AgentTree executions and their real trace events."""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base
from backend.models.common import utc_now


class Run(Base):
    __tablename__ = "runs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4()),
    )
    tree_id: Mapped[str] = mapped_column(
        ForeignKey("trees.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    tree_version_id: Mapped[str] = mapped_column(
        ForeignKey("tree_versions.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    input_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    output_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    state_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False, index=True,
    )

    tree = relationship("Tree", back_populates="runs")
    tree_version = relationship("TreeVersion", back_populates="runs")
    trace_events = relationship(
        "TraceEvent", back_populates="run", cascade="all, delete-orphan",
        passive_deletes=True, order_by="TraceEvent.sequence",
    )


class TraceEvent(Base):
    __tablename__ = "trace_events"
    __table_args__ = (
        UniqueConstraint("run_id", "sequence", name="uq_trace_event_sequence"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4()),
    )
    run_id: Mapped[str] = mapped_column(
        ForeignKey("runs.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    event_type: Mapped[str] = mapped_column(String(160), nullable=False)
    agent_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    agent_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    payload_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False,
    )

    run = relationship("Run", back_populates="trace_events")
