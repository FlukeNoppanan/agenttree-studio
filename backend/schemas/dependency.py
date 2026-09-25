"""Safe, navigable references that prevent resource deletion."""

from typing import Literal

from pydantic import BaseModel, Field


class ResourceIdentity(BaseModel):
    type: Literal["secret", "provider", "tool"]
    id: str
    name: str


class ResourceDependency(BaseModel):
    type: Literal["provider", "tool", "destination", "agent"]
    id: str
    name: str
    relation: str
    tree_id: str | None = None
    tree_name: str | None = None
    tree_version: int | None = None
    agent_id: str | None = None
    agent_name: str | None = None
    agent_type: str | None = None
    model_id: str | None = None
    capabilities: list[str] = Field(default_factory=list)


class ResourceDependencies(BaseModel):
    can_delete: bool
    resource: ResourceIdentity
    dependencies: list[ResourceDependency]
