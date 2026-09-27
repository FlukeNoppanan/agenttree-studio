"""Resource-oriented external Public API V2 contracts."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


PublicRunStatus = Literal[
    "queued", "running", "cancellation_requested", "completed", "failed", "cancelled",
]


class V2Metadata(BaseModel):
    model_config = ConfigDict(extra="allow")

    @model_validator(mode="after")
    def bounded_object(self):
        values = self.model_extra or {}
        if len(values) > 16:
            raise ValueError("metadata may contain at most 16 fields")
        for key, value in values.items():
            if len(key) > 128:
                raise ValueError("metadata key is too long")
            if isinstance(value, (str, int, float, bool)) or value is None:
                if isinstance(value, str) and len(value) > 1024:
                    raise ValueError("metadata string is too long")
                continue
            if isinstance(value, list) and len(value) <= 20 and all(
                isinstance(item, (str, int, float, bool)) or item is None for item in value
            ):
                continue
            raise ValueError("metadata values must be bounded JSON scalars or scalar lists")
        return self


class RunSubmitRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tree_id: str = Field(min_length=1, max_length=36)
    input: str = Field(min_length=1, max_length=65_536)
    timeout_seconds: float | None = Field(default=None, ge=1, le=86_400)
    metadata: V2Metadata = Field(default_factory=V2Metadata)


class RunLinks(BaseModel):
    self: str
    events: str
    stream: str
    result: str
    artifacts: str
    cancel: str


class RunAccepted(BaseModel):
    run_id: str
    tree_id: str
    tree_version_id: str
    status: PublicRunStatus
    created_at: datetime
    links: RunLinks


class ArtifactSummary(BaseModel):
    artifact_id: str
    type: str
    name: str
    path: str | None
    operation: str
    media_type: str
    size_bytes: int
    sha256: str
    producer_role: str
    producer_agent_id: str | None
    supersedes_artifact_id: str | None = None
    is_final: bool
    body_available: bool
    created_at: datetime


class RunState(BaseModel):
    run_id: str
    tree_id: str
    tree_version_id: str
    status: PublicRunStatus
    final_status: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    cancellation_requested: bool
    cancellation_requested_at: datetime | None
    usage: dict[str, Any] | None
    metrics: dict[str, Any] | None
    error: dict[str, str] | None
    artifact_count: int
    latest_event_sequence: int
    final_output: Any | None = None
    links: RunLinks


class PublicEvent(BaseModel):
    sequence: int
    type: str
    agent_id: str | None
    agent_name: str | None
    payload: dict[str, Any]
    created_at: datetime


class EventPage(BaseModel):
    events: list[PublicEvent]
    next_after: int
    has_more: bool


class ArtifactList(BaseModel):
    artifacts: list[ArtifactSummary]


class RunResult(BaseModel):
    run_id: str
    status: PublicRunStatus
    final_output: Any | None
    final_status: str | None
    usage: dict[str, Any] | None
    metrics: dict[str, Any] | None
    artifacts: list[ArtifactSummary]


class CancelResponse(BaseModel):
    run_id: str
    status: PublicRunStatus
    cancellation_requested: bool
