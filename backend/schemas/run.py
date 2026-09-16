"""Test Run, history, and persisted trace API contracts."""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class RunStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


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
