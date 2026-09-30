"""Reusable, Studio-owned Tree Template metadata and portable definitions."""

from uuid import uuid4

from sqlalchemy import ForeignKey, JSON, String, Text, Index
from sqlalchemy.orm import Mapped, mapped_column

from backend.db.base import Base
from backend.models.common import TimestampMixin


class TreeTemplate(TimestampMixin, Base):
    __tablename__ = "tree_templates"
    __table_args__ = (
        Index("ix_tree_templates_created_by", "created_by"),
    )

    id: Mapped[str] = mapped_column(String(80), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    category: Mapped[str] = mapped_column(String(80), nullable=False, default="general")
    # String rather than a database enum so a later schema can add learned templates.
    template_type: Mapped[str] = mapped_column(String(24), nullable=False, default="user")
    definition_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_by: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True,
    )
