"""Test Run, history, and persisted trace API contracts."""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from backend.schemas.destination import DeliveryResultRead


class RunStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    CANCELLATION_REQUESTED = "cancellation_requested"
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
    PROVIDER_RATE_LIMIT = "PROVIDER_RATE_LIMIT"
    PROVIDER_TIMEOUT = "PROVIDER_TIMEOUT"
    PROVIDER_MODEL_NOT_FOUND = "PROVIDER_MODEL_NOT_FOUND"
    PROVIDER_INVALID_REQUEST = "PROVIDER_INVALID_REQUEST"
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
    core_sequence: int | None = None
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
    core_execution_id: str | None = None
    final_status: str | None = None
    input: dict[str, Any]
    metadata: dict[str, Any]
    invocation_source: str
    output: dict[str, Any] | None
    error_code: RunErrorCode | None
    error_message: str | None
    started_at: datetime
    finished_at: datetime | None
    duration_ms: int | None
    usage: dict[str, Any] | None = None
    metrics: dict[str, Any] | None = None
    created_at: datetime


class RunDetailRead(RunRead):
    state: dict[str, Any] | None
    trace: list[TraceEventRead]
    delivery_results: list[DeliveryResultRead] = Field(default_factory=list)
    artifacts: list["RunArtifactRead"] = Field(default_factory=list)


class RunArtifactRead(BaseModel):
    id: str
    core_artifact_id: str
    artifact_type: str
    name: str
    logical_path: str | None
    operation: str
    media_type: str
    size_bytes: int
    sha256: str
    producer_role: str
    producer_agent_id: str | None
    metadata: dict[str, Any]
    is_final: bool
    created_at: datetime


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
