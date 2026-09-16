"""Secret API contracts that deliberately exclude stored plaintext."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SecretCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    secret_type: str = Field(default="api_key", min_length=1, max_length=50)
    value: str = Field(min_length=1, max_length=20_000)

    @field_validator("name", "secret_type")
    @classmethod
    def normalize_labels(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be blank")
        return value.strip()

    @field_validator("value")
    @classmethod
    def reject_blank_secret(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be blank")
        return value


class SecretRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    secret_type: str
    masked_value: str
    created_at: datetime
    updated_at: datetime
