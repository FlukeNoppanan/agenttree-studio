"""Stable, intentionally small external API v1 contracts."""

from agenttree.models import ExecutionMode

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class PublicErrorBody(BaseModel):
    code: str
    message: str
    request_id: str


class PublicError(BaseModel):
    error: PublicErrorBody


class PublicHealth(BaseModel):
    status: Literal["ok"] = "ok"
    api_version: Literal["v1"] = "v1"


class TreeAccess(BaseModel):
    mode: Literal["all", "selected"]
    count: int


class PublicMe(BaseModel):
    id: str
    username: str
    is_admin: bool
    tree_access: TreeAccess


class PublicTree(BaseModel):
    id: str
    name: str
    description: str
    status: Literal["ready"]
    version: int
    agent_count: int


class PublicTreeList(BaseModel):
    data: list[PublicTree]


class AgentCounts(BaseModel):
    total: int
    root: int
    managers: int
    specialists: int


class PublicTreeDetail(PublicTree):
    agents: AgentCounts


class PublicMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")
    client_request_id: str | None = Field(default=None, min_length=1, max_length=128, pattern=r"^[A-Za-z0-9._:-]+$")


class PublicInvokeRequest(BaseModel):
    execution_mode: ExecutionMode = ExecutionMode.FAST
    model_config = ConfigDict(extra="forbid")
    input: str = Field(min_length=1, max_length=65536)
    metadata: PublicMetadata = Field(default_factory=PublicMetadata)


class PublicText(BaseModel):
    type: Literal["text"] = "text"
    content: str


class PublicExecution(BaseModel):
    started_at: datetime
    completed_at: datetime | None
    duration_ms: int | None


class PublicInvocation(BaseModel):
    execution_mode: ExecutionMode = ExecutionMode.FAST
    run_id: str
    tree_id: str
    tree_version: int
    status: str
    output: PublicText | None
    execution: PublicExecution
    error: PublicErrorBody | None = None


class PublicRun(BaseModel):
    execution_mode: ExecutionMode = ExecutionMode.FAST
    id: str
    tree_id: str
    tree_version: int
    status: str
    input: PublicText
    output: PublicText | None
    execution: PublicExecution
    error: PublicErrorBody | None = None
