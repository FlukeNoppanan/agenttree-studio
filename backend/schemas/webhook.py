"""Metadata-only management responses and bounded, generic event input."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class WebhookCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=160)

    @field_validator("name")
    @classmethod
    def nonempty_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Name is required")
        return value.strip()


class WebhookUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool


class WebhookRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    tree_id: str
    name: str
    enabled: bool
    created_at: datetime
    last_received_at: datetime | None


class WebhookCreated(WebhookRead):
    secret: str


class WebhookEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    event: dict[str, Any]
    metadata: dict[str, Any] = Field(default_factory=dict)
