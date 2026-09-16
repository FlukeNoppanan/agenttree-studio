"""Provider connection and model API contracts."""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ProviderType(str, Enum):
    OPENAI = "openai"
    GEMINI = "gemini"
    OLLAMA = "ollama"


class ProviderStatus(str, Enum):
    NOT_CONFIGURED = "not_configured"
    TESTING = "testing"
    CONNECTED = "connected"
    ERROR = "error"


class ProviderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    provider_type: ProviderType
    secret_id: str | None = None
    base_url: str | None = Field(default=None, max_length=500)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return value.strip()


class ProviderUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    provider_type: ProviderType | None = None
    secret_id: str | None = None
    base_url: str | None = Field(default=None, max_length=500)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else value


class ProviderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    provider_type: ProviderType
    secret_id: str | None
    base_url: str | None
    status: ProviderStatus
    last_checked_at: datetime | None
    last_error: str | None
    models_count: int
    created_at: datetime
    updated_at: datetime


class ProviderModelRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    provider_connection_id: str
    model_id: str
    display_name: str | None
    metadata: dict[str, Any] | None
    is_available: bool
    discovered_at: datetime


class ModelDiscoveryResponse(BaseModel):
    provider: ProviderRead
    models: list[ProviderModelRead]
