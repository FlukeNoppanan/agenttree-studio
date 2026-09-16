"""Capability catalog and AI suggestion contracts."""

from pydantic import BaseModel, Field, field_validator

from backend.core.capabilities import capability_label, normalize_capability
from backend.schemas.tree import AgentType


class CapabilityCatalogItem(BaseModel):
    id: str
    label: str
    usage_count: int


class CapabilitySuggestionRequest(BaseModel):
    agent_type: AgentType
    name: str = Field(default="", max_length=160)
    description: str = Field(min_length=1, max_length=4_000)
    system_instruction: str | None = Field(default=None, max_length=20_000)
    provider_connection_id: str
    model_id: str = Field(min_length=1, max_length=300)

    @field_validator("name", "system_instruction")
    @classmethod
    def normalize_context(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip()

    @field_validator("description")
    @classmethod
    def require_description(cls, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise ValueError("Description is required for capability suggestions")
        return clean


class CapabilitySuggestion(BaseModel):
    id: str
    label: str
    reason: str


class CapabilitySuggestionResponse(BaseModel):
    suggestions: list[CapabilitySuggestion]


class RawCapabilitySuggestion(BaseModel):
    id: str = Field(min_length=1, max_length=200)
    label: str | None = Field(default=None, max_length=120)
    reason: str = Field(min_length=1, max_length=500)

    def sanitized(self) -> CapabilitySuggestion:
        normalized = normalize_capability(self.id)
        label = self.label.strip() if self.label and self.label.strip() else capability_label(normalized)
        reason = self.reason.strip()
        if not reason:
            raise ValueError("Suggestion reason cannot be empty")
        return CapabilitySuggestion(id=normalized, label=label, reason=reason)


class RawCapabilityEnvelope(BaseModel):
    suggestions: list[RawCapabilitySuggestion] = Field(min_length=1, max_length=12)
