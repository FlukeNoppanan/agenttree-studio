"""Versioned tree draft, detail, and validation API contracts."""

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator

from backend.core.capabilities import normalize_capabilities


class TreeStatus(str, Enum):
    DRAFT = "draft"
    READY = "ready"
    PUBLISHED = "published"
    PAUSED = "paused"
    ARCHIVED = "archived"


class AgentType(str, Enum):
    ROOT = "root"
    MANAGER = "manager"
    SPECIALIST = "specialist"


class AgentDraft(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()), min_length=1, max_length=80)
    agent_type: AgentType
    name: str = Field(default="", max_length=160)
    description: str = Field(default="", max_length=4_000)
    parent_agent_id: str | None = None
    provider_connection_id: str | None = None
    model_id: str | None = Field(default=None, max_length=300)
    system_instruction: str | None = Field(default=None, max_length=20_000)
    capabilities: list[str] = Field(default_factory=list)
    settings: dict[str, Any] | None = None

    @field_validator("name", "description")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("capabilities")
    @classmethod
    def normalize_capabilities(cls, values: list[str]) -> list[str]:
        return normalize_capabilities(values)


class TriggerDraft(BaseModel):
    trigger_type: str = Field(max_length=40)
    config: dict[str, Any] = Field(default_factory=dict)


class OutputDraft(BaseModel):
    output_type: str = Field(max_length=40)
    delivery_type: str = Field(max_length=40)
    config: dict[str, Any] = Field(default_factory=dict)


class ToolAssignmentDraft(BaseModel):
    agent_config_id: str
    tool_connection_id: str


class TreeDraftPayload(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=10_000)
    template: str = Field(default="blank", max_length=80)
    agents: list[AgentDraft] = Field(default_factory=list)
    tool_assignments: list[ToolAssignmentDraft] = Field(default_factory=list)
    trigger: TriggerDraft | None = None
    output: OutputDraft | None = None

    @field_validator("name", "description", "template")
    @classmethod
    def normalize_general_text(cls, value: str) -> str:
        return value.strip()


class TreeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=10_000)
    status: TreeStatus | None = None


class AgentRead(AgentDraft):
    created_at: datetime
    updated_at: datetime


class TreeVersionRead(BaseModel):
    id: str
    tree_id: str
    version_number: int
    status: str
    agents: list[AgentRead]
    tool_assignments: list[ToolAssignmentDraft]
    trigger: TriggerDraft | None
    output: OutputDraft | None
    created_at: datetime
    updated_at: datetime


class TreeListRead(BaseModel):
    id: str
    name: str
    description: str
    status: TreeStatus
    version_number: int
    managers_count: int
    specialists_count: int
    updated_at: datetime


class TreeDetailRead(TreeListRead):
    template: str
    current_version_id: str
    root: AgentRead | None
    provider_usage: list[str]
    trigger_type: str | None
    output_type: str | None
    version: TreeVersionRead
    created_at: datetime


class ValidationIssue(BaseModel):
    step: str
    code: str
    message: str
    agent_id: str | None = None


class TreeValidationRead(BaseModel):
    valid: bool
    errors: list[ValidationIssue]
    validated_at: datetime
