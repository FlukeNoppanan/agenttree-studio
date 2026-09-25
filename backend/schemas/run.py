"""Test Run, history, and persisted trace API contracts."""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from backend.schemas.destination import DeliveryResultRead


class RunStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class RunErrorCode(str, Enum):
    TREE_INVALID = "TREE_INVALID"
    INPUT_INVALID = "INPUT_INVALID"
    PROVIDER_NOT_FOUND = "PROVIDER_NOT_FOUND"
    PROVIDER_UNAVAILABLE = "PROVIDER_UNAVAILABLE"
    MODEL_NOT_AVAILABLE = "MODEL_NOT_AVAILABLE"
    PROVIDER_AUTH_ERROR = "PROVIDER_AUTH_ERROR"
    RUNTIME_BUILD_ERROR = "RUNTIME_BUILD_ERROR"
    EXECUTION_ERROR = "EXECUTION_ERROR"
    TOOL_BINDING_ERROR = "TOOL_BINDING_ERROR"


class TestRunRequest(BaseModel):
    input: dict[str, Any] = Field(default_factory=dict)


class InvocationRequest(BaseModel):
    input: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


class TraceEventRead(BaseModel):
    id: str
    run_id: str
    sequence: int
    event_type: str
    agent_id: str | None
    agent_name: str | None
    payload: dict[str, Any]
    created_at: datetime


class RunRead(BaseModel):
    id: str
    tree_id: str
    tree_name: str
    tree_version_id: str
    tree_version_number: int
    status: RunStatus
    input: dict[str, Any]
    metadata: dict[str, Any]
    invocation_source: str
    output: dict[str, Any] | None
    error_code: RunErrorCode | None
    error_message: str | None
    started_at: datetime
    finished_at: datetime | None
    duration_ms: int | None
    created_at: datetime


class RunDetailRead(RunRead):
    state: dict[str, Any] | None
    trace: list[TraceEventRead]
    delivery_results: list[DeliveryResultRead] = Field(default_factory=list)


class LiveExecutionRead(BaseModel):
    run: RunRead
    current_agent: str | None = None
    current_stage: str | None = None
    current_tool: str | None = None


class TreeLiveRead(BaseModel):
    tree_id: str
    tree_name: str
    runtime_status: str = "unavailable"
    runtime_started_at: datetime | None = None
    active_count: int
    queued_count: int
    completed_count: int
    failed_count: int
    executions: list[LiveExecutionRead]
    recent_activity: list[TraceEventRead]
