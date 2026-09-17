"""Executable HTTP/MCP Tool configuration and operation contracts."""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator


class ToolType(str, Enum):
    HTTP_API = "http_api"
    MCP = "mcp"


class ToolStatus(str, Enum):
    NOT_CONFIGURED = "not_configured"
    CONNECTED = "connected"
    ERROR = "error"
    DISABLED = "disabled"


class MCPTransportType(str, Enum):
    STDIO = "stdio"
    STREAMABLE_HTTP = "streamable_http"


class DiscoveredToolRead(BaseModel):
    name: str
    description: str = ""
    input_schema: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    selected: bool = False


class ToolCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    tool_type: ToolType
    description: str = Field(default="", max_length=4_000)
    enabled: bool = True
    secret_id: str | None = None
    transport_type: MCPTransportType | None = None
    configuration: dict[str, Any] = Field(default_factory=dict)

    @field_validator("name", "description")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        return value.strip()


class ToolUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=4_000)
    enabled: bool | None = None
    secret_id: str | None = None
    transport_type: MCPTransportType | None = None
    configuration: dict[str, Any] | None = None
    selected_tools: list[str] | None = None

    @field_validator("name", "description")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


class ToolConnectionRead(BaseModel):
    id: str
    name: str
    tool_type: ToolType
    description: str
    enabled: bool
    secret_id: str | None
    transport_type: MCPTransportType | None
    status: ToolStatus
    configuration: dict[str, Any]
    discovered_tools: list[DiscoveredToolRead]
    assigned_agents_count: int
    last_checked_at: datetime | None
    last_error: str | None
    created_at: datetime
    updated_at: datetime


class ToolTestResponse(BaseModel):
    tool: ToolConnectionRead
    message: str


class MCPDiscoveryResponse(BaseModel):
    tool: ToolConnectionRead
    tools: list[DiscoveredToolRead]


class ToolExecuteRequest(BaseModel):
    arguments: dict[str, Any] = Field(default_factory=dict)
    tool_name: str | None = None


class ToolTraceEventRead(BaseModel):
    event_type: str
    actor_id: str | None
    message: str
    metadata: dict[str, Any]
    timestamp: datetime


class ToolExecuteResponse(BaseModel):
    tool_id: str
    success: bool
    output: Any = None
    error: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    trace: list[ToolTraceEventRead]


class ToolAssignmentRead(BaseModel):
    agent_id: str
    agent_name: str
    tree_id: str
    tree_name: str


class ToolAssignmentsUpdate(BaseModel):
    agent_ids: list[str] = Field(default_factory=list)


class ToolAssignmentsResponse(BaseModel):
    assignments: list[ToolAssignmentRead]
