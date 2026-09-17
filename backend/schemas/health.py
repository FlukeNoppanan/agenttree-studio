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


class ComponentHealth(BaseModel):
    available: bool
    version: str | None = None
    detail: str | None = None


class MigrationHealth(BaseModel):
    current: str | None
    head: str | None
    up_to_date: bool


class SystemHealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    studio_api: ComponentHealth
    agenttree: AgentTreeStatus
    database: ComponentHealth
    migrations: MigrationHealth
    backend_version: str
    frontend_version: str
    runtime: RuntimeInfo
