"""Portable Tree Template API contracts."""

from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from backend.schemas.tree import OutputDraft, TriggerDraft
from backend.schemas.provider import ProviderModelRead, ProviderType
from backend.schemas.tree import AgentRead, TreeDetailRead, ValidationIssue


class TemplateType(str, Enum):
    BUILTIN = "builtin"
    USER = "user"
    LEARNED = "learned"  # Reserved for a future feature; never emitted in this phase.


class TemplateAgentDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str = Field(min_length=1, max_length=80, pattern=r"^[A-Za-z0-9_-]+$")
    agent_type: str = Field(pattern=r"^(root|manager|specialist)$")
    name: str = Field(min_length=1, max_length=160)
    role: str = Field(default="", max_length=160)
    description: str = Field(default="", max_length=4_000)
    parent_key: str | None = Field(default=None, max_length=80)
    system_instruction: str | None = Field(default=None, max_length=20_000)
    capabilities: list[str] = Field(default_factory=list, max_length=40)
    settings: dict[str, Any] = Field(default_factory=dict)

    @field_validator("name", "role", "description")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        return value.strip()


class SuggestedToolDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=1_000)
    tool_type: str = Field(default="http_api", pattern=r"^(http_api|mcp|artifact)$")


class TemplateToolRequirement(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")
    catalog_key: str = Field(min_length=1, max_length=100)
    requirement: Literal["required", "recommended"] = "recommended"
    agent_ref: str | None = Field(default=None, max_length=80)
    reason: str = Field(default="", max_length=1_000)

    @field_validator("catalog_key", "reason")
    @classmethod
    def normalize_requirement_text(cls, value: str) -> str:
        return value.strip()


class TemplateDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: int = Field(ge=1)
    agents: list[TemplateAgentDefinition] = Field(min_length=1, max_length=60)
    # `suggested_tools` is read only as a compatibility input for schema v1.
    suggested_tools: list[SuggestedToolDefinition] = Field(default_factory=list, max_length=40)
    tool_requirements: list[TemplateToolRequirement] = Field(default_factory=list, max_length=80)
    trigger: TriggerDraft | None = None
    output: OutputDraft | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_structure(self) -> "TemplateDefinition":
        if self.schema_version not in {1, 2}:
            raise ValueError("Unsupported Template schema version")
        by_key = {agent.key: agent for agent in self.agents}
        if len(by_key) != len(self.agents):
            raise ValueError("Template Agent keys must be unique")
        requirement_ids = [item.id for item in self.tool_requirements]
        if len(set(requirement_ids)) != len(requirement_ids):
            raise ValueError("Template Tool requirement IDs must be unique")
        if any(item.agent_ref is not None and item.agent_ref not in by_key for item in self.tool_requirements):
            raise ValueError("Template Tool requirement references an unknown Agent")
        roots = [agent for agent in self.agents if agent.agent_type == "root"]
        if len(roots) != 1 or roots[0].parent_key is not None:
            raise ValueError("Template must contain exactly one unparented Root Agent")
        for agent in self.agents:
            if agent.agent_type == "root":
                continue
            parent = by_key.get(agent.parent_key or "")
            if parent is None:
                raise ValueError("Template Agent parent does not exist")
            expected_parent = "root" if agent.agent_type == "manager" else "manager"
            if parent.agent_type != expected_parent:
                raise ValueError("Template Agent hierarchy is invalid")
        return self


_LEGACY_TOOL_KEY_MAP = (
    (("github",), "github-account-api"),
    (("database",), "database-access"),
    (("document", "workspace", "filesystem", "file"), "filesystem-workspace"),
    (("monitor", "incident"), "monitoring-observability"),
    (("web", "api", "http"), "web-api-request"),
)


def upgrade_template_definition(value: TemplateDefinition | dict[str, Any]) -> TemplateDefinition:
    """Normalize persisted v1 definitions to the additive v2 contract."""
    source = value.model_dump(mode="json") if isinstance(value, TemplateDefinition) else dict(value)
    version = source.get("schema_version", 1)
    if version == 2:
        return TemplateDefinition.model_validate(source)
    if version != 1:
        raise ValueError("Unsupported Template schema version")

    agents = list(source.get("agents") or [])
    for agent in agents:
        if not agent.get("role"):
            agent["role"] = {
                "root": "Coordinator", "manager": "Workstream Manager",
                "specialist": "Domain Specialist",
            }.get(agent.get("agent_type"), "")

    requirements = list(source.get("tool_requirements") or [])
    metadata = dict(source.get("metadata") or {})
    if not requirements:
        for index, suggestion in enumerate(source.get("suggested_tools") or [], start=1):
            name = str(suggestion.get("name", "Tool"))
            normalized_name = name.casefold()
            catalog_key = next((key for tokens, key in _LEGACY_TOOL_KEY_MAP
                                if any(token in normalized_name for token in tokens)), None)
            if catalog_key is None:
                warnings = metadata.get("portable_tool_warnings")
                if not isinstance(warnings, list):
                    warnings = []
                warnings.append(
                    f"{name}: this legacy suggestion has no safely matching Catalog package and was omitted."
                )
                metadata["portable_tool_warnings"] = warnings
                continue
            requirements.append({
                "id": f"legacy-{index}",
                "catalog_key": catalog_key,
                "requirement": "recommended",
                "agent_ref": None,
                "reason": str(suggestion.get("description", "")),
            })

    normalized = {
        **source,
        "schema_version": 2,
        "agents": agents,
        "suggested_tools": [],
        "tool_requirements": requirements,
        "metadata": metadata,
    }
    return TemplateDefinition.model_validate(normalized)


class TemplateMetadataCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=4_000)
    category: str = Field(default="general", min_length=1, max_length=80)

    @field_validator("name", "description", "category")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        return value.strip()


class TemplateUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=4_000)
    category: str | None = Field(default=None, min_length=1, max_length=80)
    definition: TemplateDefinition | None = None

    @field_validator("name", "description", "category")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


class TemplateInstantiateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=160)


class TemplateRead(BaseModel):
    id: str
    name: str
    description: str
    category: str
    template_type: TemplateType
    definition: TemplateDefinition
    agent_count: int
    manager_count: int
    specialist_count: int
    created_by: str | None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ToolPackageStatus(str, Enum):
    READY = "ready"
    EXPERIMENTAL = "experimental"
    COMING_SOON = "coming_soon"


class ToolPackageField(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str
    kind: str
    required: bool = False
    options: list[str] = Field(default_factory=list)


class ToolPackageRead(BaseModel):
    id: str
    name: str
    description: str
    category: str
    version: str
    icon: str
    status: ToolPackageStatus
    tool_type: str | None
    transport_type: str | None
    config_fields: list[ToolPackageField]
    required_secrets: list[str]
    operations: list[str]
    setup_instructions: list[str]


class ToolPackageSetupRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, max_length=160)
    description: str | None = Field(default=None, max_length=4_000)
    secret_id: str | None = None
    url: str | None = Field(default=None, max_length=2_000)
    method: str = Field(default="GET", pattern=r"^(GET|POST|PUT|PATCH|DELETE|HEAD)$")
    auth_mode: str = Field(default="none", pattern=r"^(none|bearer|api_key)$")
    request_schema: dict[str, Any] = Field(default_factory=lambda: {"type": "object", "properties": {}})
    test_arguments: dict[str, Any] = Field(default_factory=dict)
    timeout: float = Field(default=30, gt=0, le=120)


class ToolCatalogTestResponse(BaseModel):
    success: bool
    message: str


class TemplateRequirementState(str, Enum):
    READY = "ready"
    AVAILABLE_TO_ADD = "available_to_add"
    NEEDS_CONFIGURATION = "needs_configuration"
    MISSING = "missing"
    COMING_SOON = "coming_soon"


class TemplateSetupProvider(BaseModel):
    id: str
    name: str
    provider_type: ProviderType
    models: list[ProviderModelRead]


class TemplateAgentSetup(BaseModel):
    agent_ref: str | None
    role: str
    agent: AgentRead
    requirement_ids: list[str] = Field(default_factory=list)


class TemplateRequirementDiscoveredTool(BaseModel):
    name: str
    description: str = ""
    input_schema: dict[str, Any] = Field(default_factory=dict)
    selected: bool = False


class TemplateToolRequirementStatus(BaseModel):
    id: str
    catalog_key: str
    requirement: Literal["required", "recommended"]
    agent_ref: str | None
    agent_id: str | None
    reason: str
    package_name: str | None
    package_status: ToolPackageStatus | None
    state: TemplateRequirementState
    tool_id: str | None = None
    action: Literal["none", "assign", "add", "configure"] = "none"
    discovered_tools: list[TemplateRequirementDiscoveredTool] = Field(default_factory=list)


class TemplateReadiness(BaseModel):
    ready: bool
    ready_agent_count: int
    total_agent_count: int
    agents_missing_models: list[str] = Field(default_factory=list)
    agents_missing_instructions: list[str] = Field(default_factory=list)
    required_tools_ready: int
    required_tools_total: int
    required_tools_unresolved: list[str] = Field(default_factory=list)
    validation_issues: list[ValidationIssue] = Field(default_factory=list)


class TemplateSetupRead(BaseModel):
    tree: TreeDetailRead
    definition: TemplateDefinition
    agents: list[TemplateAgentSetup]
    providers: list[TemplateSetupProvider]
    tool_requirements: list[TemplateToolRequirementStatus]
    readiness: TemplateReadiness
    warnings: list[str] = Field(default_factory=list)


class AgentModelBindingUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider_connection_id: str | None
    model_id: str | None

    @model_validator(mode="after")
    def validate_pair(self) -> "AgentModelBindingUpdate":
        if bool(self.provider_connection_id) != bool(self.model_id):
            raise ValueError("Provider and Model must be selected together")
        return self


class TemplateToolRequirementResolveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tree_id: str = Field(min_length=1, max_length=80)
    requirement_id: str = Field(min_length=1, max_length=100)
    agent_id: str | None = Field(default=None, min_length=1, max_length=80)
    setup: ToolPackageSetupRequest | None = None
    selected_tools: list[str] | None = None


class TemplateToolRequirementsResolveAllRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tree_id: str = Field(min_length=1, max_length=80)
