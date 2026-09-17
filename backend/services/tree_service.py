"""Version-one tree draft persistence and readiness validation."""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
from typing import Iterable

from agenttree import ManagerAgent, RootAgent, SpecialistAgent
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.models.provider import ProviderConnection, ProviderModel
from backend.models.tool import ToolAssignment, ToolConnection
from backend.models.tree import AgentConfig, OutputConfig, Tree, TreeVersion, TriggerConfig
from backend.models.destination import ResultDestination
from backend.repositories.protocols import TreeRepository
from backend.repositories.sqlalchemy import SQLAlchemyTreeRepository
from backend.schemas.tree import (
    AgentDraft,
    AgentRead,
    OutputDraft,
    ToolAssignmentDraft,
    TreeDetailRead,
    TreeDraftPayload,
    TreeListRead,
    TreeUpdate,
    TreeValidationRead,
    TreeVersionRead,
    TriggerDraft,
    ValidationIssue,
)
from backend.schemas.tool_loop import ToolLoopSettings
from backend.services.errors import (
    ResourceConflictError,
    ResourceNotFoundError,
    ServiceError,
)


class TreeService:
    def __init__(self, database: Session, tree_repository: TreeRepository | None = None) -> None:
        self._database = database
        self._trees = tree_repository or SQLAlchemyTreeRepository(database)

    @staticmethod
    def _tree_options():
        version = selectinload(Tree.current_version)
        return (
            version.selectinload(TreeVersion.agents).selectinload(AgentConfig.provider_connection),
            version.selectinload(TreeVersion.trigger),
            version.selectinload(TreeVersion.output),
            version.selectinload(TreeVersion.tool_assignments),
        )

    def _get_model(self, tree_id: str) -> Tree:
        tree = self._trees.get(tree_id)
        if tree is None:
            raise ResourceNotFoundError("Tree not found")
        if tree.current_version is None:
            raise ResourceConflictError("Tree has no active version")
        return tree

    @staticmethod
    def _ensure_draft(version: TreeVersion) -> None:
        if version.status != "draft":
            raise ResourceConflictError(
                "Only the active draft version can be edited directly",
            )

    def _validate_draft_references(self, payload: TreeDraftPayload) -> None:
        agent_ids = [agent.id for agent in payload.agents]
        duplicates = [agent_id for agent_id, count in Counter(agent_ids).items() if count > 1]
        if duplicates:
            raise ServiceError("Agent IDs must be unique within a tree draft")
        agents = {agent.id: agent for agent in payload.agents}
        for agent in payload.agents:
            if (
                agent.provider_connection_id
                and self._database.get(ProviderConnection, agent.provider_connection_id) is None
            ):
                raise ServiceError(
                    f"Agent '{agent.name or agent.id}' references a missing provider",
                )
            if agent.parent_agent_id is None:
                continue
            parent = agents.get(agent.parent_agent_id)
            if parent is None:
                raise ServiceError(f"Agent '{agent.name or agent.id}' has a missing parent")
            if agent.agent_type == "specialist" and parent.agent_type != "manager":
                raise ServiceError("Specialists must belong to a Manager")
            if agent.agent_type == "manager" and parent.agent_type != "root":
                raise ServiceError("Managers may only belong to the Root Agent")
            if agent.agent_type == "root":
                raise ServiceError("The Root Agent cannot have a parent")

        assignment_pairs: set[tuple[str, str]] = set()
        for assignment in payload.tool_assignments:
            if assignment.agent_config_id not in agents:
                raise ServiceError("Tool assignment references a missing Agent")
            if self._database.get(ToolConnection, assignment.tool_connection_id) is None:
                raise ServiceError("Tool assignment references a missing Tool connection")
            pair = (assignment.agent_config_id, assignment.tool_connection_id)
            if pair in assignment_pairs:
                raise ServiceError("Duplicate Tool assignment")
            assignment_pairs.add(pair)
        assigned_agent_ids = {agent_id for agent_id, _ in assignment_pairs}
        for agent in payload.agents:
            if (
                agent.agent_type.value == "specialist"
                and ToolLoopSettings.from_mapping(agent.settings).enabled
                and agent.id not in assigned_agent_ids
            ):
                raise ServiceError(
                    "Autonomous Tool use requires at least one Tool assignment",
                )

    def _write_version(
        self,
        tree: Tree,
        version: TreeVersion,
        payload: TreeDraftPayload,
    ) -> None:
        self._ensure_draft(version)
        self._validate_draft_references(payload)
        tree.name = payload.name
        tree.description = payload.description
        tree.template = payload.template

        version.tool_assignments.clear()
        version.agents.clear()
        version.trigger = None
        version.output = None
        self._database.flush()

        models: dict[str, AgentConfig] = {}
        for draft in payload.agents:
            model = AgentConfig(
                id=draft.id,
                tree_version=version,
                agent_type=draft.agent_type.value,
                name=draft.name,
                description=draft.description,
                provider_connection_id=draft.provider_connection_id,
                model_id=draft.model_id,
                system_instruction=draft.system_instruction,
                capabilities_json=draft.capabilities,
                settings_json=draft.settings,
            )
            models[draft.id] = model
        for draft in payload.agents:
            if draft.parent_agent_id:
                models[draft.id].parent = models[draft.parent_agent_id]
        version.agents.extend(models.values())

        if payload.trigger is not None:
            config = dict(payload.trigger.config)
            if payload.trigger.trigger_type == "webhook":
                config["route"] = f"/api/trees/{tree.id}/webhook"
            version.trigger = TriggerConfig(
                trigger_type=payload.trigger.trigger_type,
                config_json=config,
            )
        if payload.output is not None:
            version.output = OutputConfig(
                output_type=payload.output.output_type,
                delivery_type=payload.output.delivery_type,
                config_json=payload.output.config,
            )
        for assignment in payload.tool_assignments:
            version.tool_assignments.append(ToolAssignment(
                agent_config=models[assignment.agent_config_id],
                tool_connection_id=assignment.tool_connection_id,
            ))

    def create(self, payload: TreeDraftPayload) -> TreeDetailRead:
        tree = Tree(
            name=payload.name,
            description=payload.description,
            template=payload.template,
            status="draft",
        )
        self._trees.add(tree)
        self._database.flush()
        version = TreeVersion(tree=tree, version_number=1, status="draft")
        self._database.add(version)
        self._database.flush()
        tree.current_version = version
        self._write_version(tree, version, payload)
        tree.destinations.extend([
            ResultDestination(name="Store in Studio", destination_type="store_in_studio", enabled=True, configuration_json={}),
            ResultDestination(name="Return API Response", destination_type="api_response", enabled=True, configuration_json={}),
        ])
        self._database.commit()
        self._database.expire_all()
        return self.get(tree.id)

    def save_draft(self, tree_id: str, payload: TreeDraftPayload) -> TreeDetailRead:
        tree = self._get_model(tree_id)
        self._write_version(tree, tree.current_version, payload)
        self._database.commit()
        self._database.expire_all()
        return self.get(tree_id)

    @staticmethod
    def _agent_read(agent: AgentConfig) -> AgentRead:
        return AgentRead(
            id=agent.id,
            agent_type=agent.agent_type,
            name=agent.name,
            description=agent.description,
            parent_agent_id=agent.parent_agent_id,
            provider_connection_id=agent.provider_connection_id,
            model_id=agent.model_id,
            system_instruction=agent.system_instruction,
            capabilities=agent.capabilities_json or [],
            settings=agent.settings_json,
            created_at=agent.created_at,
            updated_at=agent.updated_at,
        )

    def _version_read(self, version: TreeVersion) -> TreeVersionRead:
        agents = sorted(
            version.agents,
            key=lambda agent: (
                {"root": 0, "manager": 1, "specialist": 2}.get(agent.agent_type, 3),
                agent.created_at,
                agent.id,
            ),
        )
        return TreeVersionRead(
            id=version.id,
            tree_id=version.tree_id,
            version_number=version.version_number,
            status=version.status,
            agents=[self._agent_read(agent) for agent in agents],
            tool_assignments=[
                ToolAssignmentDraft(
                    agent_config_id=assignment.agent_config_id,
                    tool_connection_id=assignment.tool_connection_id,
                )
                for assignment in version.tool_assignments
            ],
            trigger=TriggerDraft(
                trigger_type=version.trigger.trigger_type,
                config=version.trigger.config_json or {},
            ) if version.trigger else None,
            output=OutputDraft(
                output_type=version.output.output_type,
                delivery_type=version.output.delivery_type,
                config=version.output.config_json or {},
            ) if version.output else None,
            created_at=version.created_at,
            updated_at=version.updated_at,
        )

    def _list_read(self, tree: Tree) -> TreeListRead:
        version = tree.current_version
        agents = version.agents if version else []
        return TreeListRead(
            id=tree.id,
            name=tree.name,
            description=tree.description,
            status=tree.status,
            version_number=version.version_number if version else 0,
            managers_count=sum(agent.agent_type == "manager" for agent in agents),
            specialists_count=sum(agent.agent_type == "specialist" for agent in agents),
            updated_at=tree.updated_at,
        )

    def list(self) -> list[TreeListRead]:
        trees = self._trees.list()
        return [self._list_read(tree) for tree in trees]

    def get(self, tree_id: str) -> TreeDetailRead:
        tree = self._get_model(tree_id)
        version = tree.current_version
        summary = self._list_read(tree)
        root = next((agent for agent in version.agents if agent.agent_type == "root"), None)
        provider_names = sorted({
            agent.provider_connection.name
            for agent in version.agents
            if agent.provider_connection is not None
        }, key=str.casefold)
        return TreeDetailRead(
            **summary.model_dump(),
            template=tree.template,
            current_version_id=version.id,
            root=self._agent_read(root) if root else None,
            provider_usage=provider_names,
            trigger_type=version.trigger.trigger_type if version.trigger else None,
            output_type=version.output.output_type if version.output else None,
            version=self._version_read(version),
            created_at=tree.created_at,
        )

    def get_version(self, tree_id: str) -> TreeVersionRead:
        return self._version_read(self._get_model(tree_id).current_version)

    def update(self, tree_id: str, payload: TreeUpdate) -> TreeDetailRead:
        tree = self._get_model(tree_id)
        changes = payload.model_dump(exclude_unset=True)
        if "name" in changes:
            tree.name = changes["name"].strip()
        if "description" in changes:
            tree.description = changes["description"].strip()
        if "status" in changes:
            requested = changes["status"]
            requested = requested.value if hasattr(requested, "value") else requested
            if requested == "published":
                raise ServiceError("Publishing is not implemented in this phase")
            if requested == "ready":
                validation = self.validate(tree_id, mark_ready=True)
                if not validation.valid:
                    raise ServiceError("Tree cannot become ready until validation passes")
                return self.get(tree_id)
            tree.status = requested
        self._database.commit()
        self._database.expire_all()
        return self.get(tree_id)

    def delete(self, tree_id: str) -> None:
        tree = self._get_model(tree_id)
        tree.current_version = None
        self._database.flush()
        self._database.delete(tree)
        self._database.commit()

    @staticmethod
    def _issue(
        errors: list[ValidationIssue],
        step: str,
        code: str,
        message: str,
        agent_id: str | None = None,
    ) -> None:
        errors.append(ValidationIssue(
            step=step, code=code, message=message, agent_id=agent_id,
        ))

    def _validate_provider(
        self,
        agent: AgentConfig,
        errors: list[ValidationIssue],
        step: str,
    ) -> None:
        if not agent.provider_connection_id:
            self._issue(errors, step, "provider_required", f"{agent.name or 'Agent'} needs a provider", agent.id)
            return
        provider = self._database.get(ProviderConnection, agent.provider_connection_id)
        if provider is None:
            self._issue(errors, step, "provider_missing", f"{agent.name or 'Agent'} references a missing provider", agent.id)
            return
        if provider.status != "connected":
            self._issue(errors, step, "provider_not_connected", f"Provider for {agent.name or 'Agent'} is not connected", agent.id)
        if not agent.model_id:
            self._issue(errors, step, "model_required", f"{agent.name or 'Agent'} needs a model", agent.id)
            return
        model = self._database.scalar(select(ProviderModel).where(
            ProviderModel.provider_connection_id == provider.id,
            ProviderModel.model_id == agent.model_id,
        ))
        if model is None:
            self._issue(errors, step, "model_missing", f"Model for {agent.name or 'Agent'} is not in the provider catalog", agent.id)
        elif (
            not model.is_available
            or not model.generation_candidate
            or model.qualification_status != "qualified"
        ):
            self._issue(
                errors, step, "model_unavailable",
                f"Model for {agent.name or 'Agent'} is not verified for AgentTree generation",
                agent.id,
            )

    def _validate_core_hierarchy(self, agents: Iterable[AgentConfig]) -> None:
        roots = [agent for agent in agents if agent.agent_type == "root"]
        if len(roots) != 1:
            return
        RootAgent(
            id=roots[0].id, name=roots[0].name,
            description=roots[0].description,
            capabilities=tuple(roots[0].capabilities_json or []),
        )
        managers: dict[str, ManagerAgent] = {}
        for agent in agents:
            if agent.agent_type == "manager":
                managers[agent.id] = ManagerAgent(
                    id=agent.id, name=agent.name, description=agent.description,
                    capabilities=tuple(agent.capabilities_json or []),
                )
        for agent in agents:
            if agent.agent_type == "specialist" and agent.parent_agent_id in managers:
                managers[agent.parent_agent_id].register_specialist(SpecialistAgent(
                    id=agent.id, name=agent.name, description=agent.description,
                    capabilities=tuple(agent.capabilities_json or []),
                ))

    def validate(self, tree_id: str, *, mark_ready: bool = False) -> TreeValidationRead:
        tree = self._get_model(tree_id)
        version = tree.current_version
        agents = list(version.agents)
        errors: list[ValidationIssue] = []
        roots = [agent for agent in agents if agent.agent_type == "root"]
        managers = [agent for agent in agents if agent.agent_type == "manager"]
        specialists = [agent for agent in agents if agent.agent_type == "specialist"]

        if len(roots) != 1:
            self._issue(errors, "root", "root_count", "Tree must have exactly one Root Agent")
        if not managers:
            self._issue(errors, "managers", "manager_required", "Tree must have at least one Manager")

        root_id = roots[0].id if len(roots) == 1 else None
        for agent in agents:
            step = "root" if agent.agent_type == "root" else "managers" if agent.agent_type == "manager" else "specialists"
            if not agent.name.strip():
                self._issue(errors, step, "name_required", "Every Agent needs a name", agent.id)
            if not agent.capabilities_json:
                self._issue(errors, step, "capability_required", f"{agent.name or 'Agent'} needs at least one capability", agent.id)
            self._validate_provider(agent, errors, step)
            if agent.agent_type == "root" and agent.parent_agent_id is not None:
                self._issue(errors, "root", "root_parent", "Root Agent cannot have a parent", agent.id)
            if agent.agent_type == "manager" and agent.parent_agent_id != root_id:
                self._issue(errors, "managers", "manager_parent", f"{agent.name or 'Manager'} must belong to the Root Agent", agent.id)

        manager_ids = {manager.id for manager in managers}
        specialists_by_manager = Counter(
            specialist.parent_agent_id for specialist in specialists
            if specialist.parent_agent_id in manager_ids
        )
        for manager in managers:
            if specialists_by_manager[manager.id] == 0:
                self._issue(errors, "specialists", "specialist_required", f"{manager.name or 'Manager'} needs at least one Specialist", manager.id)
        for specialist in specialists:
            if specialist.parent_agent_id not in manager_ids:
                self._issue(errors, "specialists", "specialist_parent", f"{specialist.name or 'Specialist'} must belong to a Manager", specialist.id)
            try:
                settings = ToolLoopSettings.from_mapping(specialist.settings_json)
            except ValueError as error:
                self._issue(errors, "specialists", "tool_loop_settings", str(error), specialist.id)
                continue
            if settings.enabled and not any(
                assignment.agent_config_id == specialist.id
                for assignment in version.tool_assignments
            ):
                self._issue(
                    errors, "tools", "tool_assignment_required",
                    f"{specialist.name or 'Specialist'} needs an assigned Tool for autonomous use",
                    specialist.id,
                )

        try:
            self._validate_core_hierarchy(agents)
        except (TypeError, ValueError) as exc:
            self._issue(errors, "review", "core_compatibility", f"AgentTree Core rejected the hierarchy: {exc}")

        valid = not errors
        if mark_ready and valid:
            self._ensure_draft(version)
            tree.status = "ready"
            version.status = "ready"
            self._database.commit()
        return TreeValidationRead(
            valid=valid,
            errors=errors,
            validated_at=datetime.now(timezone.utc),
        )


class ToolCatalogService:
    def __init__(self, database: Session) -> None:
        self._database = database

    def list(self) -> list[ToolConnection]:
        return list(self._database.scalars(
            select(ToolConnection).order_by(ToolConnection.name),
        ).all())
