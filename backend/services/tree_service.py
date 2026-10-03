"""Version-one tree draft persistence and readiness validation."""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
from typing import Iterable
from uuid import uuid4

from agenttree import ManagerAgent, RootAgent, SpecialistAgent
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.models.provider import ProviderConnection, ProviderModel
from backend.models.tool import ToolAssignment, ToolConnection
from backend.models.auth import User
from backend.services.auth_service import AuthService
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
from backend.schemas.template import upgrade_template_definition
from backend.services.template_requirements import resolve_requirements
from backend.services.tree_contracts import invalid_manager_peers


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

    def get_model(self, tree_id: str) -> Tree:
        """Return the current Tree ORM graph for cooperating Studio services."""
        return self._get_model(tree_id)

    @staticmethod
    def _ensure_draft(version: TreeVersion) -> None:
        if version.status != "draft":
            raise ResourceConflictError(
                "Only the active draft version can be edited directly",
            )

    def _validate_draft_references(self, payload: TreeDraftPayload, *, check_tool_loop: bool = True) -> None:
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
                check_tool_loop and agent.agent_type.value == "specialist"
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
        # Known Agent IDs from another Tree/version cannot be inserted here.
        foreign = self._database.scalar(select(AgentConfig.id).where(
            AgentConfig.id.in_([agent.id for agent in payload.agents]),
            AgentConfig.tree_version_id != version.id,
        ).limit(1))
        if foreign is not None:
            raise ResourceNotFoundError("Agent not found in this Tree")
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

    def create(
        self, payload: TreeDraftPayload, *, template_instance: dict | None = None, user: User | None = None,
    ) -> TreeDetailRead:
        tree = Tree(
            name=payload.name,
            description=payload.description,
            template=payload.template,
            status="draft",
        )
        self._trees.add(tree)
        self._database.flush()
        version = TreeVersion(
            tree=tree, version_number=1, status="draft",
            template_instance_json=template_instance,
        )
        self._database.add(version)
        self._database.flush()
        tree.current_version = version
        self._write_version(tree, version, payload)
        tree.destinations.extend([
            ResultDestination(name="Store in Studio", destination_type="store_in_studio", enabled=True, configuration_json={}),
            ResultDestination(name="Return API Response", destination_type="api_response", enabled=True, configuration_json={}),
        ])
        if user is not None:
            AuthService(self._database).grant_created_tree(user, tree.id)
        self._database.commit()
        self._database.expire_all()
        return self.get(tree.id)

    def save_draft(self, tree_id: str, payload: TreeDraftPayload) -> TreeDetailRead:
        tree = self._get_model(tree_id)
        self._write_version(tree, tree.current_version, payload)
        self._database.commit()
        self._database.expire_all()
        return self.get(tree_id)

    def replace_ready_configuration(self, tree_id: str, payload: TreeDraftPayload) -> TreeDetailRead:
        """Atomically replace a Ready configuration while retaining its prior version.

        Agent IDs are global primary keys, so the new version receives fresh IDs and
        all parent/Tool references are remapped. Failed validation rolls back the
        new version and leaves the current Ready Tree untouched.
        """
        tree = self._get_model(tree_id)
        if tree.status != "ready" or tree.current_version.status != "ready":
            raise ResourceConflictError("Only a Ready Tree can use configuration replacement")
        old_version = tree.current_version
        id_map = {agent.id: str(uuid4()) for agent in payload.agents}
        if len(id_map) != len(payload.agents):
            raise ServiceError("Agent IDs must be unique within a Tree")
        remapped = payload.model_copy(update={
            "agents": [agent.model_copy(update={
                "id": id_map[agent.id],
                "parent_agent_id": id_map.get(agent.parent_agent_id, agent.parent_agent_id),
                "settings": self._remap_agent_settings(agent.settings, id_map),
            }) for agent in payload.agents],
            "tool_assignments": [assignment.model_copy(update={
                "agent_config_id": id_map.get(assignment.agent_config_id, assignment.agent_config_id),
            }) for assignment in payload.tool_assignments],
        })
        try:
            version = TreeVersion(tree=tree, version_number=old_version.version_number + 1, status="draft")
            version.template_instance_json = self._remap_template_instance(
                old_version.template_instance_json, id_map,
            )
            self._database.add(version)
            self._database.flush()
            tree.current_version = version
            self._write_version(tree, version, remapped)
            self._database.flush()
            result = self._validate_version(version)
            if not result.valid:
                raise ServiceError("Edited Tree is invalid: " + "; ".join(issue.message for issue in result.errors))
            version.status = "ready"
            tree.status = "ready"
            self._database.commit()
        except Exception:
            self._database.rollback()
            raise
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

    def get_version(self, tree_id: str, version_id: str | None = None) -> TreeVersionRead:
        tree = self._get_model(tree_id)
        version = tree.current_version if version_id is None else self._database.get(TreeVersion, version_id)
        if version is None or version.tree_id != tree.id:
            raise ResourceNotFoundError("Tree version not found")
        return self._version_read(version)

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
        if provider.provider_type != "ollama" and not provider.secret_id:
            self._issue(errors, step, "provider_credential_required", "Agent provider credential is missing", agent.id)
        if provider.provider_type == "openai_compatible" and not provider.base_url:
            self._issue(errors, step, "provider_url_required", "Custom provider base URL is missing", agent.id)
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
        result = self._validate_version(version)
        if mark_ready and result.valid:
            self._ensure_draft(version)
            tree.status = "ready"
            version.status = "ready"
            self._database.commit()
        return result

    def preview_draft(self, payload: TreeDraftPayload, tree_id: str | None = None, *, template_instance: dict | None = None) -> TreeValidationRead:
        """Validate an unsaved canvas using the normal rules, without writing rows."""
        self._validate_draft_references(payload, check_tool_loop=False)
        existing = self._get_model(tree_id).current_version if tree_id else None
        version = TreeVersion(id=str(uuid4()), status="draft", template_instance_json=(
            existing.template_instance_json if existing else template_instance
        ))
        version.agents = [AgentConfig(
            id=item.id, tree_version_id=version.id, agent_type=item.agent_type,
            name=item.name, description=item.description, parent_agent_id=item.parent_agent_id,
            provider_connection_id=item.provider_connection_id, model_id=item.model_id,
            system_instruction=item.system_instruction, capabilities_json=item.capabilities,
            settings_json=item.settings,
        ) for item in payload.agents]
        version.tool_assignments = [ToolAssignment(
            tree_version_id=version.id, agent_config_id=item.agent_config_id,
            tool_connection_id=item.tool_connection_id,
        ) for item in payload.tool_assignments]
        with self._database.no_autoflush:
            return self._validate_version(version)

    def _validate_version(self, version: TreeVersion) -> TreeValidationRead:
        # Relationship assignment and explicit insertion may temporarily show
        # the same pending Agent twice before a commit expires the collection.
        agents = list({agent.id: agent for agent in version.agents}.values())
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
        for manager_id in invalid_manager_peers(agents):
            self._issue(errors, "managers", "manager_peers_invalid",
                        "Manager collaboration peers must reference other Managers in this Tree version",
                        manager_id)
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

        for assignment in version.tool_assignments:
            tool = self._database.get(ToolConnection, assignment.tool_connection_id)
            if tool is None or not tool.enabled or tool.status != "connected":
                self._issue(errors, "tools", "tool_not_ready", "Assigned Tool must be enabled and connected", assignment.agent_config_id)
            elif tool.tool_type == "mcp" and not any(
                isinstance(item, dict) and item.get("selected") for item in tool.discovered_tools_json or []
            ):
                self._issue(errors, "tools", "mcp_tool_not_selected", "Assigned MCP connection needs a selected Tool", assignment.agent_config_id)

        instance = version.template_instance_json
        if isinstance(instance, dict) and isinstance(instance.get("definition"), dict):
            try:
                definition = upgrade_template_definition(instance["definition"])
                agent_ids = instance.get("agent_ids") if isinstance(instance.get("agent_ids"), dict) else {}
                agents_by_id = {agent.id: agent for agent in agents}
                for item in definition.agents:
                    agent_id = agent_ids.get(item.key)
                    agent = agents_by_id.get(agent_id)
                    if agent is None:
                        self._issue(errors, "template", "template_agent_missing",
                                    f"Template Agent '{item.name}' is missing from this Tree", agent_id)
                    elif not (agent.system_instruction or "").strip():
                        self._issue(errors, "template", "instruction_required",
                                    f"{agent.name or 'Agent'} needs a system instruction", agent.id)
                for item in resolve_requirements(self._database, version, definition, agent_ids):
                    if item.requirement == "required" and item.state.value != "ready":
                        self._issue(errors, "tools", "template_tool_requirement_unresolved",
                                    f"Required Tool '{item.package_name or item.catalog_key}' is not assigned and ready",
                                    item.agent_id)
            except (TypeError, ValueError, KeyError) as exc:
                self._issue(errors, "template", "template_snapshot_invalid",
                            f"Stored Template setup data is invalid: {exc}")

        try:
            self._validate_core_hierarchy(agents)
        except (TypeError, ValueError) as exc:
            self._issue(errors, "review", "core_compatibility", f"AgentTree Core rejected the hierarchy: {exc}")

        valid = not errors
        return TreeValidationRead(
            valid=valid,
            errors=errors,
            validated_at=datetime.now(timezone.utc),
        )

    @staticmethod
    def _remap_agent_settings(settings: dict | None, id_map: dict[str, str]) -> dict:
        copied = dict(settings or {})
        peers = copied.get("allowed_manager_peer_ids")
        if isinstance(peers, list):
            # Keep unknown/malformed references for validation to reject; never
            # silently discard an invalid requested permission.
            copied["allowed_manager_peer_ids"] = [
                id_map.get(peer, peer) if isinstance(peer, str) else peer for peer in peers
            ]
        return copied

    @staticmethod
    def _remap_template_instance(instance: dict | None, id_map: dict[str, str]) -> dict | None:
        if not isinstance(instance, dict):
            return None
        copied = dict(instance)
        previous = copied.get("agent_ids")
        if isinstance(previous, dict):
            reverse = {old_id: key for key, old_id in previous.items()}
            copied["agent_ids"] = {
                key: id_map.get(old_id, old_id)
                for key, old_id in previous.items()
            }
            # Agent IDs not represented by the original Template stay unmapped;
            # stale refs are retained so required requirements remain visible.
            copied["agent_ids"].update({
                key: id_map[old_id] for old_id, key in reverse.items() if old_id in id_map
            })
        return copied
