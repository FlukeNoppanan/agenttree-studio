"""Build a real AgentTree Core runtime from one stored Studio Tree version."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from hashlib import sha256

from agenttree import AgentTree, ManagerAgent, RootAgent, SpecialistAgent
from agenttree.config import AgentTreeConfig
from agenttree.core import (
    BaseManagerReviewer,
    BaseTaskDecomposer,
    ProviderFinalReviewer,
    ProviderManagerReviewer,
    ProviderRootSynthesizer,
    ProviderTaskDecomposer,
    ProviderTaskTriage,
)
from agenttree.models import ReviewResult, Subtask, Task, TriageResult
from agenttree.orchestration import SpecialistExecution
from agenttree.providers import BaseProvider
from agenttree.tools import ToolBindingRegistry, ToolExecutor, ToolRegistry
from agenttree.tools.mcp import BaseMCPClient
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.models.provider import ProviderConnection, ProviderModel
from backend.models.tool import ToolConnection
from backend.models.tree import AgentConfig, Tree, TreeVersion
from backend.repositories.protocols import TreeRepository
from backend.repositories.sqlalchemy import SQLAlchemyTreeRepository
from backend.providers.generation import create_generation_provider
from backend.services.errors import ResourceNotFoundError, RunRequestError
from backend.services.secret_service import SecretService
from backend.services.tree_contracts import invalid_manager_peers
from backend.tools.factory import BuiltTools, ToolAdapterFactory


ProviderFactory = Callable[[ProviderConnection, str, str | None, str], BaseProvider]


@dataclass(frozen=True)
class RuntimeValidationIssue:
    code: str
    message: str
    agent_id: str | None = None


@dataclass(frozen=True)
class RuntimeValidationResult:
    valid: bool
    errors: tuple[RuntimeValidationIssue, ...]


@dataclass(frozen=True)
class RuntimeBundle:
    runtime: AgentTree
    tree: Tree
    version: TreeVersion
    agents_by_id: dict[str, RootAgent | ManagerAgent | SpecialistAgent]
    sensitive_values: tuple[str, ...]
    tool_registry: ToolRegistry
    tool_bindings: ToolBindingRegistry
    tool_executor: ToolExecutor
    mcp_clients: tuple[BaseMCPClient, ...] = ()


class _ManagerDecomposer(BaseTaskDecomposer):
    def __init__(self, strategies: dict[str, ProviderTaskDecomposer]) -> None:
        self._strategies = strategies

    def decompose(
        self, task: Task, manager: ManagerAgent, triage: TriageResult,
    ) -> tuple[Subtask, ...]:
        return self._strategies[manager.id].decompose(task, manager, triage)

    def decompose_with_capabilities(
        self, task: Task, manager: ManagerAgent, triage: TriageResult,
        available_capabilities,
    ) -> tuple[Subtask, ...]:
        return self._strategies[manager.id].decompose_with_capabilities(
            task, manager, triage, available_capabilities,
        )


class _ManagerReviewer(BaseManagerReviewer):
    def __init__(self, strategies: dict[str, ProviderManagerReviewer]) -> None:
        self._strategies = strategies

    def review(
        self,
        task: Task,
        subtask: Subtask,
        manager: ManagerAgent,
        specialist_executions: tuple[SpecialistExecution, ...],
    ) -> ReviewResult:
        return self._strategies[manager.id].review(
            task, subtask, manager, specialist_executions,
        )


class RuntimeBuilder:
    """Resolve Studio persistence into public AgentTree objects and strategies."""

    def __init__(
        self,
        database: Session,
        provider_factory: ProviderFactory | None = None,
        tool_factory: ToolAdapterFactory | None = None,
        tree_repository: TreeRepository | None = None,
    ) -> None:
        self._database = database
        self._provider_factory = provider_factory or (
            lambda connection, model, credential, name: create_generation_provider(
                connection, model, credential, provider_name=name,
            )
        )
        self._tool_factory = tool_factory or ToolAdapterFactory(database)
        self._trees = tree_repository or SQLAlchemyTreeRepository(database)

    @staticmethod
    def _tree_options():
        version = selectinload(Tree.current_version)
        return (
            version.selectinload(TreeVersion.agents),
            version.selectinload(TreeVersion.trigger),
            version.selectinload(TreeVersion.output),
            version.selectinload(TreeVersion.tool_assignments),
        )

    def get_tree(self, tree_id: str) -> Tree:
        tree = self._trees.get(tree_id)
        if tree is None:
            raise ResourceNotFoundError("Tree not found")
        if tree.current_version is None:
            raise RunRequestError("TREE_INVALID", "Tree has no active version")
        return tree

    def validate(self, tree_id: str) -> RuntimeValidationResult:
        return self.validate_tree(self.get_tree(tree_id))

    def validate_tree(self, tree: Tree) -> RuntimeValidationResult:
        version = tree.current_version
        assert version is not None
        return self._validate_version(version)

    def _validate_version(self, version: TreeVersion) -> RuntimeValidationResult:
        agents = tuple(version.agents)
        roots = [item for item in agents if item.agent_type == "root"]
        managers = [item for item in agents if item.agent_type == "manager"]
        specialists = [item for item in agents if item.agent_type == "specialist"]
        errors: list[RuntimeValidationIssue] = []

        def issue(code: str, message: str, agent_id: str | None = None) -> None:
            errors.append(RuntimeValidationIssue(code, message, agent_id))

        if len(roots) != 1:
            issue("TREE_INVALID", "Tree must have exactly one Root Agent")
        if not managers:
            issue("TREE_INVALID", "Tree must have at least one Manager")
        root_id = roots[0].id if len(roots) == 1 else None
        manager_ids = {item.id for item in managers}
        for agent in agents:
            if not agent.name.strip() or not agent.capabilities_json:
                issue("TREE_INVALID", "Every Agent needs a name and at least one capability", agent.id)
            if agent.agent_type == "root" and agent.parent_agent_id is not None:
                issue("TREE_INVALID", "Root Agent cannot have a parent", agent.id)
            elif agent.agent_type == "manager" and agent.parent_agent_id != root_id:
                issue("TREE_INVALID", "Every Manager must belong to the Root Agent", agent.id)
            elif agent.agent_type == "specialist" and agent.parent_agent_id not in manager_ids:
                issue("TREE_INVALID", "Every Specialist must belong to a Manager", agent.id)
            self._validate_provider(agent, issue)
        for manager in managers:
            if not any(item.parent_agent_id == manager.id for item in specialists):
                issue("TREE_INVALID", "Every Manager needs at least one Specialist", manager.id)
        configs = {item.id: item for item in agents}
        for assignment in version.tool_assignments:
            agent = configs.get(assignment.agent_config_id)
            if agent is None:
                issue("TOOL_BINDING_ERROR", "Tool assignment references a missing Agent", assignment.agent_config_id)
                continue
            tool = self._database.get(ToolConnection, assignment.tool_connection_id)
            if tool is None:
                issue("TOOL_BINDING_ERROR", "Tool assignment references a missing Tool", agent.id)
            elif not tool.enabled or tool.status != "connected":
                issue("TOOL_BINDING_ERROR", "Assigned Tool must be enabled and connected", agent.id)
            elif tool.tool_type == "mcp" and not any(
                item.get("selected") is True for item in (tool.discovered_tools_json or [])
            ):
                issue("TOOL_BINDING_ERROR", "Assigned MCP connection has no selected Tools", agent.id)
        for manager_id in invalid_manager_peers(agents):
            issue("TREE_INVALID", "Manager collaboration peers must reference other Managers in this Tree version", manager_id)
        return RuntimeValidationResult(valid=not errors, errors=tuple(errors))

    def _validate_provider(self, agent: AgentConfig, issue) -> None:
        if not agent.provider_connection_id:
            issue("PROVIDER_NOT_FOUND", "Agent provider connection is missing", agent.id)
            return
        connection = self._database.get(ProviderConnection, agent.provider_connection_id)
        if connection is None:
            issue("PROVIDER_NOT_FOUND", "Agent provider connection was not found", agent.id)
            return
        if connection.status != "connected":
            issue("PROVIDER_UNAVAILABLE", "Agent provider is not connected", agent.id)
        if connection.provider_type != "ollama" and not connection.secret_id:
            issue("PROVIDER_UNAVAILABLE", "Agent provider credential is missing", agent.id)
        if connection.provider_type == "openai_compatible" and not connection.base_url:
            issue("PROVIDER_UNAVAILABLE", "Custom provider base URL is missing", agent.id)
        if not agent.model_id:
            issue("MODEL_NOT_AVAILABLE", "Agent model is missing", agent.id)
            return
        model = self._database.scalar(select(ProviderModel.id).where(
            ProviderModel.provider_connection_id == connection.id,
            ProviderModel.model_id == agent.model_id,
            ProviderModel.is_available.is_(True),
            ProviderModel.generation_candidate.is_(True),
            ProviderModel.qualification_status == "qualified",
        ))
        if model is None:
            issue("MODEL_NOT_AVAILABLE", "Agent model is not available", agent.id)

    def build(self, tree_id: str, tree_version_id: str | None = None) -> RuntimeBundle:
        tree = self.get_tree(tree_id)
        if tree_version_id is not None:
            version = self._database.scalar(select(TreeVersion).options(
                selectinload(TreeVersion.agents), selectinload(TreeVersion.trigger),
                selectinload(TreeVersion.output), selectinload(TreeVersion.tool_assignments),
            ).where(TreeVersion.id == tree_version_id, TreeVersion.tree_id == tree_id))
            if version is None:
                raise ResourceNotFoundError("Tree version not found")
        version = version if tree_version_id is not None else tree.current_version
        assert version is not None
        validation = self._validate_version(version)
        if not validation.valid:
            first = validation.errors[0]
            raise RunRequestError(first.code, first.message)
        configs = {item.id: item for item in version.agents}
        root_config = next(item for item in configs.values() if item.agent_type == "root")
        manager_configs = [item for item in configs.values() if item.agent_type == "manager"]
        specialist_configs = [item for item in configs.values() if item.agent_type == "specialist"]

        root = RootAgent(**self._agent_kwargs(root_config))
        managers = {
            item.id: ManagerAgent(**self._agent_kwargs(item)) for item in manager_configs
        }
        specialists = {
            item.id: SpecialistAgent(**self._agent_kwargs(item))
            for item in specialist_configs
        }
        for config in specialist_configs:
            managers[config.parent_agent_id].register_specialist(specialists[config.id])

        secrets: list[str] = []
        provider_cache: dict[tuple[str, str], BaseProvider] = {}

        def resolve(config: AgentConfig) -> BaseProvider:
            assert config.provider_connection_id and config.model_id
            key = (config.provider_connection_id, config.model_id)
            if key in provider_cache:
                return provider_cache[key]
            connection = self._database.get(ProviderConnection, config.provider_connection_id)
            assert connection is not None
            credential = None
            if connection.secret_id:
                credential = SecretService(self._database).reveal(connection.secret_id)
                secrets.append(credential)
            digest = sha256(config.model_id.encode("utf-8")).hexdigest()[:12]
            runtime_name = f"studio-{connection.id}-{digest}"
            try:
                provider = self._provider_factory(connection, config.model_id, credential, runtime_name)
            except RunRequestError:
                raise
            except Exception as exc:
                raise RunRequestError(
                    "RUNTIME_BUILD_ERROR", "Provider runtime could not be created",
                ) from exc
            if not isinstance(provider, BaseProvider):
                raise RunRequestError(
                    "RUNTIME_BUILD_ERROR", "Provider factory returned an invalid adapter",
                )
            provider_cache[key] = provider
            return provider

        root_provider = resolve(root_config)
        manager_decomposers: dict[str, ProviderTaskDecomposer] = {}
        manager_reviewers: dict[str, ProviderManagerReviewer] = {}
        for config in manager_configs:
            configured = resolve(config)
            manager_decomposers[config.id] = ProviderTaskDecomposer(configured)
            manager_reviewers[config.id] = ProviderManagerReviewer(configured)
        resolved_providers = {
            config.id: resolve(config)
            for config in (root_config, *manager_configs, *specialist_configs)
        }

        tool_registry = ToolRegistry()
        tool_bindings = ToolBindingRegistry()
        tool_executor = ToolExecutor(registry=tool_registry, bindings=tool_bindings)
        runtime = AgentTree(
            root_agent=root,
            triage=ProviderTaskTriage(root_provider),
            decomposer=_ManagerDecomposer(manager_decomposers),
            manager_reviewer=_ManagerReviewer(manager_reviewers),
            final_reviewer=ProviderFinalReviewer(root_provider),
            tool_registry=tool_registry,
            tool_bindings=tool_bindings,
            root_synthesizer=ProviderRootSynthesizer(root_provider),
            config=self._core_config(root_config),
        )
        for manager in managers.values():
            runtime.register_manager(manager)
        for provider in provider_cache.values():
            runtime.register_provider(provider)
        for config in (root_config, *manager_configs, *specialist_configs):
            runtime.bind_provider(
                {root_config.id: root, **managers, **specialists}[config.id],
                resolved_providers[config.id], model=config.model_id,
            )
        for manager_config in manager_configs:
            for peer_id in (manager_config.settings_json or {}).get("allowed_manager_peer_ids", []):
                runtime.allow_manager_communication(managers[manager_config.id], managers[peer_id])

        built_connections: dict[str, BuiltTools] = {}
        mcp_clients: list[BaseMCPClient] = []
        try:
            for assignment in version.tool_assignments:
                connection = self._database.get(ToolConnection, assignment.tool_connection_id)
                assert connection is not None
                built = built_connections.get(connection.id)
                if built is None:
                    built = self._tool_factory.build_runtime_tools(connection)
                    if not built.tools:
                        raise ValueError("Assigned Tool produced no executable Tools")
                    for client in built.mcp_clients:
                        client.connect()
                    built_connections[connection.id] = built
                    secrets.extend(built.sensitive_values)
                    mcp_clients.extend(built.mcp_clients)
                    for executable in built.tools:
                        runtime.register_tool(executable)
                assigned_agent = {root.id: root, **managers, **specialists}[assignment.agent_config_id]
                for executable in built.tools:
                    runtime.bind_tool(assigned_agent, executable)
        except Exception as error:
            for client in mcp_clients:
                try:
                    client.close()
                except Exception:
                    pass
            if isinstance(error, RunRequestError):
                raise
            raise RunRequestError(
                "TOOL_BINDING_ERROR", "Executable Tool runtime could not be created",
            ) from error

        all_agents: dict[str, RootAgent | ManagerAgent | SpecialistAgent] = {root.id: root}
        all_agents.update(managers)
        all_agents.update(specialists)
        return RuntimeBundle(
            runtime=runtime,
            tree=tree,
            version=version,
            agents_by_id=all_agents,
            sensitive_values=tuple(dict.fromkeys(value for value in secrets if value)),
            tool_registry=tool_registry,
            tool_bindings=tool_bindings,
            tool_executor=tool_executor,
            mcp_clients=tuple(mcp_clients),
        )

    @staticmethod
    def _agent_kwargs(config: AgentConfig) -> dict:
        instruction = (config.system_instruction or "").strip()
        description = instruction or config.description
        return {
            "id": config.id,
            "name": config.name,
            "description": description,
            "capabilities": tuple(config.capabilities_json or ()),
            "metadata": {
                "studio_description": config.description,
                "system_instruction": config.system_instruction,
                "settings": config.settings_json or {},
            },
        }

    @staticmethod
    def _core_config(root: AgentConfig) -> AgentTreeConfig:
        settings = root.settings_json or {}
        return AgentTreeConfig(
            manager_match_all=bool(settings.get("manager_match_all", False)),
            specialist_match_all=bool(settings.get("specialist_match_all", False)),
            max_manager_revisions=RuntimeBuilder._nonnegative_int(
                settings.get("max_manager_revisions"), 2,
            ),
            max_final_revisions=RuntimeBuilder._nonnegative_int(
                settings.get("max_final_revisions"), 1,
            ),
            max_tool_rounds=RuntimeBuilder._positive_int(settings.get("max_tool_rounds"), 3),
            max_tool_calls=RuntimeBuilder._positive_int(settings.get("max_tool_calls"), 8),
            max_collaboration_messages_per_manager=RuntimeBuilder._positive_int(
                settings.get("max_collaboration_messages_per_manager"), 4,
            ),
            max_collaboration_messages_total=RuntimeBuilder._positive_int(
                settings.get("max_collaboration_messages_total"), 12,
            ),
            provider_streaming=bool(settings.get("provider_streaming", True)),
        )

    @staticmethod
    def _nonnegative_int(value, default: int) -> int:
        return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else default

    @staticmethod
    def _positive_int(value, default: int) -> int:
        return value if isinstance(value, int) and not isinstance(value, bool) and value > 0 else default
