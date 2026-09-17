"""Result destination configuration and delivery outcome API contracts."""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator


class DestinationType(str, Enum):
    STORE_IN_STUDIO = "store_in_studio"
    API_RESPONSE = "api_response"
    WEBHOOK = "webhook"


class DestinationStatus(str, Enum):
    PENDING = "pending"
    SUCCESS = "success"
    FAILED = "failed"


class DestinationWrite(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    destination_type: DestinationType
    enabled: bool = True
    configuration: dict[str, Any] = Field(default_factory=dict)
    secret_id: str | None = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return value.strip()

    @model_validator(mode="after")
    def validate_configuration(self) -> "DestinationWrite":
        if self.destination_type != DestinationType.WEBHOOK:
            if self.configuration:
                raise ValueError("Built-in destinations do not accept configuration")
            if self.secret_id:
                raise ValueError("Built-in destinations do not use secrets")
            return self
        url = self.configuration.get("url")
        if not isinstance(url, str) or not url.startswith(("http://", "https://")):
            raise ValueError("Webhook URL must use http or https")
        if "@" in url.split("//", 1)[-1].split("/", 1)[0]:
            raise ValueError("Webhook URL must not contain credentials")
        method = str(self.configuration.get("method", "POST")).upper()
        if method != "POST":
            raise ValueError("Webhook destinations currently support POST only")
        timeout = self.configuration.get("timeout_seconds", 10)
        if isinstance(timeout, bool) or not isinstance(timeout, (int, float)) or not 1 <= timeout <= 60:
            raise ValueError("Webhook timeout must be between 1 and 60 seconds")
        headers = self.configuration.get("headers", {})
        if not isinstance(headers, dict) or not all(isinstance(key, str) and isinstance(value, str) for key, value in headers.items()):
            raise ValueError("Webhook headers must be a string map")
        sensitive = {"authorization", "cookie", "proxy-authorization", "x-api-key"}
        if any(key.casefold() in sensitive for key in headers):
            raise ValueError("Credential headers must use a Secret reference")
        return self


class DestinationRead(DestinationWrite):
    id: str
    tree_id: str
    created_at: datetime
    updated_at: datetime


class DeliveryResultRead(BaseModel):
    id: str
    run_id: str
    destination_id: str | None
    destination_name: str
    destination_type: DestinationType
    status: DestinationStatus
    attempted_at: datetime
    completed_at: datetime | None
    sanitized_error: str | None


class DestinationTestRead(BaseModel):
    success: bool
    message: str
