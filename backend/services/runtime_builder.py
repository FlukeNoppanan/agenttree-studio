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
    ProviderTaskDecomposer,
    ProviderTaskTriage,
)
from agenttree.models import ReviewResult, Subtask, Task, TriageResult
from agenttree.orchestration import SpecialistExecution
from agenttree.providers import BaseProvider, ProviderRegistry, ProviderRequest, ProviderResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.models.provider import ProviderConnection, ProviderModel
from backend.models.tree import AgentConfig, Tree, TreeVersion
from backend.providers.generation import create_generation_provider
from backend.services.errors import ResourceNotFoundError, RunRequestError
from backend.services.secret_service import SecretService


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


class _InstructionProvider(BaseProvider):
    """Apply stored agent instructions while retaining the Core provider adapter."""

    def __init__(self, provider: BaseProvider, instruction: str | None) -> None:
        super().__init__(provider.config)
        self._provider = provider
        self._instruction = (instruction or "").strip()

    def generate(self, request: ProviderRequest) -> ProviderResponse:
        system = request.system_prompt
        if self._instruction:
            system = "\n\n".join(filter(None, (system, f"Configured agent instructions:\n{self._instruction}")))
        return self._provider.generate(ProviderRequest(
            prompt=request.prompt,
            system_prompt=system,
            context=request.context,
            metadata=request.metadata,
            model=request.model,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
        ))


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
    ) -> None:
        self._database = database
        self._provider_factory = provider_factory or (
            lambda connection, model, credential, name: create_generation_provider(
                connection, model, credential, provider_name=name,
            )
        )

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
        tree = self._database.scalar(
            select(Tree).options(*self._tree_options()).where(Tree.id == tree_id),
        )
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
        if version.trigger is None or version.trigger.trigger_type not in {"manual_form", "webhook"}:
            issue("TREE_INVALID", "Trigger / Input configuration is missing or unsupported")
        elif version.trigger.trigger_type == "manual_form":
            fields = version.trigger.config_json.get("fields")
            if not isinstance(fields, list):
                issue("TREE_INVALID", "Manual Form requires a fields list")
            else:
                seen_fields: set[str] = set()
                for field in fields:
                    if not isinstance(field, dict):
                        issue("TREE_INVALID", "Manual Form contains an invalid field")
                        continue
                    field_id = str(field.get("id") or field.get("name") or "").strip()
                    if (
                        not field_id
                        or field_id in seen_fields
                        or field.get("type") not in {"text", "textarea", "number", "select", "file"}
                    ):
                        issue("TREE_INVALID", "Manual Form contains an invalid or duplicate field")
                    seen_fields.add(field_id)
        if version.output is None:
            issue("TREE_INVALID", "Output configuration is missing")
        elif (
            version.output.output_type not in {"text", "structured_json"}
            or version.output.delivery_type not in {"show_in_web", "api_response"}
        ):
            issue("TREE_INVALID", "Output configuration is unsupported")
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
        if not agent.model_id:
            issue("MODEL_NOT_AVAILABLE", "Agent model is missing", agent.id)
            return
        model = self._database.scalar(select(ProviderModel.id).where(
            ProviderModel.provider_connection_id == connection.id,
            ProviderModel.model_id == agent.model_id,
            ProviderModel.is_available.is_(True),
        ))
        if model is None:
            issue("MODEL_NOT_AVAILABLE", "Agent model is not available", agent.id)

    def build(self, tree_id: str) -> RuntimeBundle:
        tree = self.get_tree(tree_id)
        validation = self.validate_tree(tree)
        if not validation.valid:
            first = validation.errors[0]
            raise RunRequestError(first.code, first.message)
        version = tree.current_version
        assert version is not None
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

        root_provider = _InstructionProvider(resolve(root_config), root_config.system_instruction)
        manager_decomposers: dict[str, ProviderTaskDecomposer] = {}
        manager_reviewers: dict[str, ProviderManagerReviewer] = {}
        for config in manager_configs:
            configured = _InstructionProvider(resolve(config), config.system_instruction)
            manager_decomposers[config.id] = ProviderTaskDecomposer(configured)
            manager_reviewers[config.id] = ProviderManagerReviewer(configured)

        registry = ProviderRegistry()
        runtime = AgentTree(
            root_agent=root,
            triage=ProviderTaskTriage(root_provider),
            decomposer=_ManagerDecomposer(manager_decomposers),
            manager_reviewer=_ManagerReviewer(manager_reviewers),
            final_reviewer=ProviderFinalReviewer(root_provider),
            provider_registry=registry,
            config=self._core_config(root_config),
        )
        for manager in managers.values():
            runtime.register_manager(manager)
        for config in specialist_configs:
            provider = resolve(config)
            if provider.name.casefold() not in registry.names:
                runtime.register_provider(provider)
            runtime.bind_provider(specialists[config.id], provider)

        all_agents: dict[str, RootAgent | ManagerAgent | SpecialistAgent] = {root.id: root}
        all_agents.update(managers)
        all_agents.update(specialists)
        return RuntimeBundle(
            runtime=runtime,
            tree=tree,
            version=version,
            agents_by_id=all_agents,
            sensitive_values=tuple(dict.fromkeys(value for value in secrets if value)),
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
        )

    @staticmethod
    def _nonnegative_int(value, default: int) -> int:
        return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else default
