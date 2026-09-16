"""Health endpoint response contracts."""

from typing import Literal

from pydantic import BaseModel


class AgentTreeStatus(BaseModel):
    available: bool
    version: str | None = None
    error: str | None = None


class RuntimeInfo(BaseModel):
    python_version: str
    platform: str


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    service: str
    version: str
    agenttree: AgentTreeStatus
    runtime: RuntimeInfo
