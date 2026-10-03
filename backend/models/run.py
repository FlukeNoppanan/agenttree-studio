"""Persisted synchronous AgentTree executions and their real trace events."""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
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
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending", index=True)
    core_execution_id: Mapped[str | None] = mapped_column(String(36), nullable=True, unique=True)
    final_status: Mapped[str | None] = mapped_column(String(40), nullable=True)
    input_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    metadata_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    invocation_source: Mapped[str] = mapped_column(String(40), nullable=False, default="studio_test")
    submitted_by_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    submitted_by_token_id: Mapped[str | None] = mapped_column(
        ForeignKey("api_tokens.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    cancellation_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    output_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    state_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    usage_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    metrics_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
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
    delivery_results = relationship(
        "ResultDelivery", back_populates="run", cascade="all, delete-orphan",
        passive_deletes=True, order_by="ResultDelivery.attempted_at",
    )
    artifacts = relationship(
        "RunArtifact", back_populates="run", cascade="all, delete-orphan",
        passive_deletes=True, order_by="RunArtifact.created_at",
    )


class TraceEvent(Base):
    __tablename__ = "trace_events"
    __table_args__ = (
        UniqueConstraint("run_id", "sequence", name="uq_trace_event_sequence"),
        UniqueConstraint("run_id", "core_sequence", name="uq_trace_event_core_sequence"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4()),
    )
    run_id: Mapped[str] = mapped_column(
        ForeignKey("runs.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    core_sequence: Mapped[int | None] = mapped_column(Integer, nullable=True)
    event_type: Mapped[str] = mapped_column(String(160), nullable=False)
    agent_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    agent_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    payload_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False,
    )

    run = relationship("Run", back_populates="trace_events")


class RunArtifact(Base):
    __tablename__ = "run_artifacts"
    __table_args__ = (
        UniqueConstraint("run_id", "core_artifact_id", name="uq_run_core_artifact"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    run_id: Mapped[str] = mapped_column(
        ForeignKey("runs.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    core_artifact_id: Mapped[str] = mapped_column(String(64), nullable=False)
    artifact_type: Mapped[str] = mapped_column(String(30), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    logical_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    operation: Mapped[str] = mapped_column(String(30), nullable=False)
    media_type: Mapped[str] = mapped_column(String(160), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    producer_role: Mapped[str] = mapped_column(String(30), nullable=False)
    producer_agent_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    metadata_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    is_final: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    body_available: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    run = relationship("Run", back_populates="artifacts")


class RunIdempotency(Base):
    """A bounded-lifetime, token-scoped mapping for retry-safe V2 submission."""

    __tablename__ = "run_idempotency"
    __table_args__ = (
        UniqueConstraint("api_token_id", "action", "key_hash", name="uq_run_idempotency_scope"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    api_token_id: Mapped[str] = mapped_column(
        ForeignKey("api_tokens.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    run_id: Mapped[str] = mapped_column(
        ForeignKey("runs.id", ondelete="CASCADE"), nullable=False, unique=True,
    )
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    key_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
