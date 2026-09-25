"""Read-only dependency graph for safe resource deletion."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models.destination import ResultDestination
from backend.models.provider import ProviderConnection
from backend.models.secret import Secret
from backend.models.tool import ToolAssignment, ToolConnection
from backend.models.tree import AgentConfig, Tree, TreeVersion
from backend.schemas.dependency import ResourceDependencies, ResourceDependency, ResourceIdentity
from backend.services.errors import ResourceNotFoundError


class DependencyService:
    def __init__(self, database: Session) -> None:
        self._database = database

    @staticmethod
    def _result(kind: str, resource, dependencies: list[ResourceDependency]) -> ResourceDependencies:
        return ResourceDependencies(
            can_delete=not dependencies,
            resource=ResourceIdentity(type=kind, id=resource.id, name=resource.name),
            dependencies=dependencies,
        )

    def secret(self, secret_id: str) -> ResourceDependencies:
        secret = self._database.get(Secret, secret_id)
        if secret is None:
            raise ResourceNotFoundError("Secret not found")
        dependencies = [
            ResourceDependency(type="provider", id=item.id, name=item.name, relation="uses_secret")
            for item in self._database.scalars(
                select(ProviderConnection).where(ProviderConnection.secret_id == secret_id).order_by(ProviderConnection.name)
            )
        ]
        dependencies += [
            ResourceDependency(type="tool", id=item.id, name=item.name, relation="uses_secret")
            for item in self._database.scalars(
                select(ToolConnection).where(ToolConnection.secret_id == secret_id).order_by(ToolConnection.name)
            )
        ]
        dependencies += [
            ResourceDependency(type="destination", id=destination.id, name=destination.name,
                               relation="uses_secret", tree_id=tree.id, tree_name=tree.name)
            for destination, tree in self._database.execute(
                select(ResultDestination, Tree).join(Tree, ResultDestination.tree_id == Tree.id)
                .where(ResultDestination.secret_id == secret_id).order_by(Tree.name, ResultDestination.name)
            )
        ]
        return self._result("secret", secret, dependencies)

    def provider(self, provider_id: str) -> ResourceDependencies:
        provider = self._database.get(ProviderConnection, provider_id)
        if provider is None:
            raise ResourceNotFoundError("Provider connection not found")
        dependencies = [
            ResourceDependency(
                type="agent", id=agent.id, name=agent.name, relation="uses_provider",
                tree_id=tree.id, tree_name=tree.name, tree_version=version.version_number,
                agent_id=agent.id, agent_name=agent.name, agent_type=agent.agent_type,
                model_id=agent.model_id,
            )
            for agent, version, tree in self._database.execute(
                select(AgentConfig, TreeVersion, Tree)
                .join(TreeVersion, AgentConfig.tree_version_id == TreeVersion.id)
                .join(Tree, TreeVersion.tree_id == Tree.id)
                .where(AgentConfig.provider_connection_id == provider_id)
                .order_by(Tree.name, TreeVersion.version_number, AgentConfig.name)
            )
        ]
        return self._result("provider", provider, dependencies)

    def tool(self, tool_id: str) -> ResourceDependencies:
        tool = self._database.get(ToolConnection, tool_id)
        if tool is None:
            raise ResourceNotFoundError("Tool not found")
        dependencies = [
            ResourceDependency(
                type="agent", id=agent.id, name=agent.name, relation="assigned_to_specialist",
                tree_id=tree.id, tree_name=tree.name, tree_version=version.version_number,
                agent_id=agent.id, agent_name=agent.name, agent_type=agent.agent_type,
                capabilities=agent.capabilities_json or [],
            )
            for assignment, agent, version, tree in self._database.execute(
                select(ToolAssignment, AgentConfig, TreeVersion, Tree)
                .join(AgentConfig, ToolAssignment.agent_config_id == AgentConfig.id)
                .join(TreeVersion, ToolAssignment.tree_version_id == TreeVersion.id)
                .join(Tree, TreeVersion.tree_id == Tree.id)
                .where(ToolAssignment.tool_connection_id == tool_id)
                .order_by(Tree.name, TreeVersion.version_number, AgentConfig.name)
            )
        ]
        return self._result("tool", tool, dependencies)
