"""Provider connection and discovered-model persistence."""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base
from backend.models.common import TimestampMixin, utc_now


class ProviderConnection(TimestampMixin, Base):
    __tablename__ = "provider_connections"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4()),
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    provider_type: Mapped[str] = mapped_column(String(30), nullable=False)
    secret_id: Mapped[str | None] = mapped_column(
        ForeignKey("secrets.id", ondelete="RESTRICT"), nullable=True,
    )
    base_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="not_configured",
    )
    last_checked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    secret = relationship("Secret", back_populates="provider_connections")
    models = relationship(
        "ProviderModel",
        back_populates="provider_connection",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class ProviderModel(Base):
    __tablename__ = "provider_models"
    __table_args__ = (
        UniqueConstraint("provider_connection_id", "model_id", name="uq_provider_model"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4()),
    )
    provider_connection_id: Mapped[str] = mapped_column(
        ForeignKey("provider_connections.id", ondelete="CASCADE"), nullable=False,
        index=True,
    )
    model_id: Mapped[str] = mapped_column(String(300), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(300), nullable=True)
    metadata_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_available: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    generation_candidate: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    qualification_status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="unknown", index=True,
    )
    qualification_checked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    qualification_error_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    qualification_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    discovered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False,
    )

    provider_connection = relationship("ProviderConnection", back_populates="models")
