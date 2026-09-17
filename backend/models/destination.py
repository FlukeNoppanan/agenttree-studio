"""Extensible post-run result destinations and independent delivery outcomes."""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base
from backend.models.common import TimestampMixin, utc_now


class ResultDestination(TimestampMixin, Base):
    __tablename__ = "result_destinations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tree_id: Mapped[str] = mapped_column(
        ForeignKey("trees.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    destination_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    enabled: Mapped[bool] = mapped_column(nullable=False, default=True)
    configuration_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    secret_id: Mapped[str | None] = mapped_column(
        ForeignKey("secrets.id", ondelete="RESTRICT"), nullable=True,
    )

    tree = relationship("Tree", back_populates="destinations")
    secret = relationship("Secret", back_populates="result_destinations")
    delivery_results = relationship("ResultDelivery", back_populates="destination")


class ResultDelivery(Base):
    __tablename__ = "result_deliveries"
    __table_args__ = (
        UniqueConstraint("run_id", "destination_id", name="uq_run_destination_delivery"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    run_id: Mapped[str] = mapped_column(
        ForeignKey("runs.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    destination_id: Mapped[str | None] = mapped_column(
        ForeignKey("result_destinations.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    destination_name: Mapped[str] = mapped_column(String(160), nullable=False)
    destination_type: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    attempted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sanitized_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    run = relationship("Run", back_populates="delivery_results")
    destination = relationship("ResultDestination", back_populates="delivery_results")
