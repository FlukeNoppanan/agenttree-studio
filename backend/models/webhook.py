"""Incoming event integrations; independent of personal API tokens and destinations."""

from datetime import datetime
from secrets import token_hex

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from backend.db.base import Base
from backend.models.common import utc_now


class WebhookIntegration(Base):
    __tablename__ = "webhook_integrations"

    id: Mapped[str] = mapped_column(String(35), primary_key=True, default=lambda: "wh_" + token_hex(16))
    tree_id: Mapped[str] = mapped_column(ForeignKey("trees.id", ondelete="CASCADE"), nullable=False, index=True)
    owner_user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    secret_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    last_received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
