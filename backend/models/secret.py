"""Encrypted Studio secret persistence."""

from uuid import uuid4

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base
from backend.models.common import TimestampMixin


class Secret(TimestampMixin, Base):
    __tablename__ = "secrets"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4()),
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    secret_type: Mapped[str] = mapped_column(String(50), nullable=False)
    encrypted_value: Mapped[str] = mapped_column(Text, nullable=False)

    provider_connections = relationship(
        "ProviderConnection", back_populates="secret", passive_deletes=True,
    )
    tool_connections = relationship(
        "ToolConnection", back_populates="secret", passive_deletes=True,
    )
    result_destinations = relationship(
        "ResultDestination", back_populates="secret", passive_deletes=True,
    )
