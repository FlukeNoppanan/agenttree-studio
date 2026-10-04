"""Non-secret identities retained by versioned bindings after resource removal."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models.provider import ProviderConnection
from backend.models.tool import ToolAssignment, ToolConnection
from backend.models.tree import AgentConfig


def identity(resource) -> dict:
    return {"id": resource.id, "name": resource.name,
            "resource_type": resource.provider_type if isinstance(resource, ProviderConnection) else resource.tool_type}


def remember_provider(database: Session, provider_id: str) -> None:
    resource = database.get(ProviderConnection, provider_id)
    for agent in database.scalars(select(AgentConfig).where(AgentConfig.provider_connection_id == provider_id)):
        if not agent.provider_identity_json:
            agent.provider_identity_json = identity(resource)


def remember_tool(database: Session, tool_id: str) -> None:
    resource = database.get(ToolConnection, tool_id)
    for assignment in database.scalars(select(ToolAssignment).where(ToolAssignment.tool_connection_id == tool_id)):
        if not assignment.tool_identity_json:
            assignment.tool_identity_json = identity(resource)
