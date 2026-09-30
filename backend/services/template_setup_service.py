"""Template onboarding, Agent bindings, and Tree-scoped Tool resolution."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models.auth import User
from backend.models.provider import ProviderConnection, ProviderModel
from backend.models.template import TreeTemplate
from backend.models.tool import ToolAssignment, ToolConnection
from backend.models.tree import AgentConfig, TreeVersion
from backend.schemas.template import (
    AgentModelBindingUpdate,
    TemplateAgentCreate,
    TemplateAgentUpdate,
    TemplateAgentToolsUpdate,
    TemplateAgentSetup,
    TemplateDefinition,
    TemplateReadiness,
    TemplateRequirementState,
    TemplateSetupProvider,
    TemplateSetupRead,
    TemplateToolRequirementResolveRequest,
    TemplateToolRequirementStatus,
    ToolPackageSetupRequest,
    upgrade_template_definition,
)
from backend.schemas.tree import TreeDetailRead, ValidationIssue
from backend.schemas.tool import ToolUpdate
from backend.services.errors import ResourceConflictError, ResourceNotFoundError, ServiceError
from backend.services.provider_service import ProviderService
from backend.services.template_requirements import resolve_requirements
from backend.services.template_service import TemplateService
from backend.services.tool_catalog_service import ToolCatalogService
from backend.services.tree_service import TreeService
from backend.tools.catalog import TOOL_PACKAGES


_PACKAGE_BY_ID = {item["id"]: item for item in TOOL_PACKAGES}


class TemplateSetupService:
    def __init__(self, database: Session) -> None:
        self._database = database
        self._trees = TreeService(database)

    @staticmethod
    def _snapshot(version: TreeVersion) -> tuple[TemplateDefinition, dict[str, str], list[str]] | None:
        instance = version.template_instance_json
        if not isinstance(instance, dict) or not isinstance(instance.get("definition"), dict):
            return None
        try:
            definition = upgrade_template_definition(instance["definition"])
        except (TypeError, ValueError):
            return None
        ids = instance.get("agent_ids")
        agent_ids = {str(key): str(value) for key, value in ids.items()} if isinstance(ids, dict) else {}
        warnings = instance.get("warnings")
        return definition, agent_ids, [str(item) for item in warnings] if isinstance(warnings, list) else []

    def _ensure_snapshot(self, tree_id: str, user: User) -> tuple[TemplateDefinition, dict[str, str], list[str]]:
        tree = self._trees.get_model(tree_id)
        version = tree.current_version
        saved = self._snapshot(version)
        if saved:
            return saved

        warnings: list[str] = []
        template_read = None
        try:
            template_read = TemplateService(self._database).get(tree.template, user)
        except ResourceNotFoundError:
            pass

        agent_ids: dict[str, str] = {}
        if template_read is not None:
            definition = upgrade_template_definition(template_read.definition)
            remaining = list(version.agents)
            for item in definition.agents:
                matches = [agent for agent in remaining if agent.agent_type == item.agent_type and agent.name == item.name]
                if len(matches) == 1:
                    agent = matches[0]
                    agent_ids[item.key] = agent.id
                    remaining.remove(agent)
            # Legacy Trees did not persist stable Template refs. If a user
            # renamed an Agent before upgrading, only bind it when its role
            # and already-matched parent identify one unique candidate.
            progress = True
            while progress:
                progress = False
                for item in definition.agents:
                    if item.key in agent_ids:
                        continue
                    parent_id = agent_ids.get(item.parent_key) if item.parent_key else None
                    matches = [agent for agent in remaining if
                               agent.agent_type == item.agent_type and agent.parent_agent_id == parent_id]
                    if len(matches) == 1:
                        agent_ids[item.key] = matches[0].id
                        remaining.remove(matches[0])
                        progress = True
            if len(agent_ids) != len(definition.agents):
                warnings.append("Some original Template Agents could not be matched by exact role and name; unresolved requirements need review.")
        else:
            # An old Tree can outlive the user Template that created it. Keep
            # the current Tree usable, and surface that its original template
            # definition is unavailable rather than guessing from names.
            _, _, definition = TemplateService._definition_from_tree(tree_id, self._database)
            warnings.append("The source Template is unavailable; this setup view was reconstructed from the current Tree.")
            by_name = {agent.name: agent.id for agent in version.agents}
            agent_ids = {item.key: by_name[item.name] for item in definition.agents if item.name in by_name}

        instance = {
            "schema_version": 1,
            "source_template_id": tree.template,
            "definition": definition.model_dump(mode="json"),
            "agent_ids": agent_ids,
            "warnings": warnings,
        }
        # New onboarding happens on drafts. Persisting this one-time upgrade
        # makes future validation independent from edits/deletion of a source
        # Template while leaving already-ready historical versions untouched.
        if version.status == "draft":
            version.template_instance_json = instance
            self._database.commit()
        return definition, agent_ids, warnings

    @staticmethod
    def _qualified_models(database: Session, provider_id: str) -> list[ProviderModel]:
        return list(database.scalars(select(ProviderModel).where(
            ProviderModel.provider_connection_id == provider_id,
            ProviderModel.is_available.is_(True),
            ProviderModel.generation_candidate.is_(True),
            ProviderModel.qualification_status == "qualified",
        ).order_by(ProviderModel.model_id)).all())

    def _validate_binding(self, provider_id: str | None, model_id: str | None) -> None:
        if provider_id is None and model_id is None:
            return
        provider = self._database.get(ProviderConnection, provider_id)
        if provider is None:
            raise ResourceNotFoundError("Provider connection not found")
        if provider.status != "connected":
            raise ServiceError("Choose a connected Provider")
        model = self._database.scalar(select(ProviderModel).where(
            ProviderModel.provider_connection_id == provider_id,
            ProviderModel.model_id == model_id,
            ProviderModel.is_available.is_(True),
            ProviderModel.generation_candidate.is_(True),
            ProviderModel.qualification_status == "qualified",
        ))
        if model is None:
            raise ServiceError("Choose a discovered, verified model that supports generation")

    def bind_agent(
        self, tree_id: str, agent_id: str, payload: AgentModelBindingUpdate, user: User,
    ) -> TemplateSetupRead:
        tree = self._trees.get_model(tree_id)
        self._trees._ensure_draft(tree.current_version)
        agent = next((item for item in tree.current_version.agents if item.id == agent_id), None)
        if agent is None:
            raise ResourceNotFoundError("Agent not found in this Tree")
        self._validate_binding(payload.provider_connection_id, payload.model_id)
        agent.provider_connection_id = payload.provider_connection_id
        agent.model_id = payload.model_id
        self._database.commit()
        return self.get(tree_id, user)

    def apply_default(
        self, tree_id: str, payload: AgentModelBindingUpdate, user: User,
    ) -> TemplateSetupRead:
        tree = self._trees.get_model(tree_id)
        self._trees._ensure_draft(tree.current_version)
        self._validate_binding(payload.provider_connection_id, payload.model_id)
        for agent in tree.current_version.agents:
            agent.provider_connection_id = payload.provider_connection_id
            agent.model_id = payload.model_id
        self._database.commit()
        return self.get(tree_id, user)

    def create_agent(self, tree_id: str, payload: TemplateAgentCreate, user: User) -> TemplateSetupRead:
        tree = self._trees.get_model(tree_id)
        version = tree.current_version
        self._trees._ensure_draft(version)
        parent = next((item for item in version.agents if item.id == payload.parent_agent_id), None)
        expected = "root" if payload.agent_type == "manager" else "manager"
        if parent is None or parent.agent_type != expected:
            raise ServiceError(f"A {payload.agent_type} must belong to a {expected} in this Tree")
        agent = AgentConfig(
            tree_version=version, agent_type=payload.agent_type,
            parent_agent_id=parent.id, name=payload.name, description="",
            capabilities_json=[], system_instruction=None,
        )
        self._database.add(agent)
        self._database.commit()
        return self.get(tree_id, user)

    def update_agent(
        self, tree_id: str, agent_id: str, payload: TemplateAgentUpdate, user: User,
    ) -> TemplateSetupRead:
        tree = self._trees.get_model(tree_id)
        self._trees._ensure_draft(tree.current_version)
        agent = next((item for item in tree.current_version.agents if item.id == agent_id), None)
        if agent is None:
            raise ResourceNotFoundError("Agent not found in this Tree")
        self._validate_binding(payload.provider_connection_id, payload.model_id)
        agent.name = payload.name
        agent.description = payload.description
        agent.capabilities_json = payload.capabilities
        agent.system_instruction = payload.system_instruction
        agent.provider_connection_id = payload.provider_connection_id
        agent.model_id = payload.model_id
        self._database.commit()
        return self.get(tree_id, user)

    def update_agent_tools(
        self, tree_id: str, agent_id: str, payload: TemplateAgentToolsUpdate, user: User,
    ) -> TemplateSetupRead:
        tree = self._trees.get_model(tree_id)
        version = tree.current_version
        self._trees._ensure_draft(version)
        if not any(item.id == agent_id for item in version.agents):
            raise ResourceNotFoundError("Agent not found in this Tree")
        tool_ids = list(dict.fromkeys(payload.tool_ids))
        for tool_id in tool_ids:
            tool = self._database.get(ToolConnection, tool_id)
            if tool is None or not tool.enabled or tool.status != "connected":
                raise ServiceError("Only tested, enabled Tool connections can be assigned")
            if tool.tool_type == "mcp" and not any(
                isinstance(item, dict) and item.get("selected") is True
                for item in tool.discovered_tools_json or []
            ):
                raise ServiceError("Select at least one discovered MCP Tool before assigning it")
        for assignment in list(version.tool_assignments):
            if assignment.agent_config_id == agent_id and assignment.tool_connection_id not in tool_ids:
                version.tool_assignments.remove(assignment)
        for tool_id in tool_ids:
            if not any(item.agent_config_id == agent_id and item.tool_connection_id == tool_id
                       for item in version.tool_assignments):
                version.tool_assignments.append(ToolAssignment(
                    tree_version_id=version.id, agent_config_id=agent_id,
                    tool_connection_id=tool_id,
                ))
        self._database.commit()
        return self.get(tree_id, user)

    def _readiness(
        self, tree: TreeDetailRead, definition: TemplateDefinition,
        agent_ids: dict[str, str], requirements: list[TemplateToolRequirementStatus],
        validation: list[ValidationIssue],
    ) -> TemplateReadiness:
        agents_by_id = {item.id: item for item in tree.version.agents}
        provider_models: dict[tuple[str, str], bool] = {}
        connected_provider_ids: set[str] = set()
        for provider in self._database.scalars(select(ProviderConnection)).all():
            if provider.status == "connected":
                connected_provider_ids.add(provider.id)
                for model in self._qualified_models(self._database, provider.id):
                    provider_models[(provider.id, model.model_id)] = True
        missing_models: list[str] = []
        missing_instructions: list[str] = []
        ready_agent_count = 0
        original_ids = set(agent_ids.values())
        for agent in tree.version.agents:
            if not (
                agent.provider_connection_id in connected_provider_ids
                and (agent.provider_connection_id, agent.model_id or "") in provider_models
            ):
                missing_models.append(agent.name)
            original_missing_instruction = agent.id in original_ids and not (agent.system_instruction or "").strip()
            if original_missing_instruction:
                missing_instructions.append(agent.name)
            if (
                agent.name.strip() and agent.capabilities
                and (agent.provider_connection_id, agent.model_id or "") in provider_models
                and not original_missing_instruction
                and not any(issue.agent_id == agent.id for issue in validation)
            ):
                ready_agent_count += 1
        required = [item for item in requirements if item.requirement == "required"]
        unresolved = [item.package_name or item.catalog_key for item in required if item.state != TemplateRequirementState.READY]
        return TemplateReadiness(
            ready=not validation,
            ready_agent_count=ready_agent_count,
            total_agent_count=len(agents_by_id),
            agents_missing_models=missing_models,
            agents_missing_instructions=missing_instructions,
            required_tools_ready=len(required) - len(unresolved),
            required_tools_total=len(required),
            required_tools_unresolved=unresolved,
            validation_issues=validation,
        )

    def get(self, tree_id: str, user: User) -> TemplateSetupRead:
        tree_model = self._trees.get_model(tree_id)
        definition, agent_ids, warnings = self._ensure_snapshot(tree_id, user)
        # Re-fetch after a legacy snapshot was persisted.
        tree_model = self._trees.get_model(tree_id)
        tree = self._trees.get(tree_id)
        requirements = resolve_requirements(
            self._database, tree_model.current_version, definition, agent_ids,
        )
        providers = []
        for provider in self._database.scalars(select(ProviderConnection).order_by(ProviderConnection.name)).all():
            if provider.status != "connected":
                continue
            providers.append(TemplateSetupProvider(
                id=provider.id,
                name=provider.name,
                provider_type=provider.provider_type,
                models=[ProviderService.serialize_model(item) for item in self._qualified_models(self._database, provider.id)],
            ))
        agents = []
        by_id = {item.id: item for item in tree_model.current_version.agents}
        for item in definition.agents:
            agent_id = agent_ids.get(item.key)
            agent = by_id.get(agent_id or "")
            if agent is None:
                continue
            agents.append(TemplateAgentSetup(
                agent_ref=item.key,
                role=item.role,
                agent=self._trees._agent_read(agent),
                requirement_ids=[requirement.id for requirement in definition.tool_requirements if requirement.agent_ref == item.key],
            ))
        original_ids = {item.agent.id for item in agents}
        for agent in tree.version.agents:
            if agent.id not in original_ids:
                agents.append(TemplateAgentSetup(
                    agent_ref=None, role=agent.agent_type.title(), agent=agent,
                    requirement_ids=[],
                ))
        for warning in definition.metadata.get("portable_tool_warnings", []):
            if isinstance(warning, str):
                warnings.append(warning)
        validation = self._trees.validate(tree_id).errors
        return TemplateSetupRead(
            tree=tree,
            definition=definition,
            agents=agents,
            providers=providers,
            tool_requirements=requirements,
            readiness=self._readiness(tree, definition, agent_ids, requirements, validation),
            warnings=sorted(set(warnings)),
        )

    @staticmethod
    def _assign(database: Session, version: TreeVersion, agent_id: str, tool_id: str) -> None:
        agent = next((item for item in version.agents if item.id == agent_id), None)
        tool = database.get(ToolConnection, tool_id)
        if agent is None:
            raise ResourceNotFoundError("Select an Agent in this Tree")
        if tool is None:
            raise ResourceNotFoundError("Tool connection not found")
        if not tool.enabled or tool.status != "connected":
            raise ServiceError("Only a tested, enabled Tool connection can be assigned")
        if tool.tool_type == "mcp" and not any(
            isinstance(item, dict) and item.get("selected") is True
            for item in tool.discovered_tools_json or []
        ):
            raise ServiceError("Discover and select at least one MCP Tool before assigning it")
        if not any(item.agent_config_id == agent_id and item.tool_connection_id == tool_id for item in version.tool_assignments):
            version.tool_assignments.append(ToolAssignment(
                tree_version_id=version.id, agent_config_id=agent_id,
                tool_connection_id=tool_id,
            ))

    def resolve_requirement(
        self,
        tree_id: str,
        requirement_id: str,
        *,
        setup: ToolPackageSetupRequest | None,
        agent_id: str | None,
        selected_tools: list[str] | None,
        user: User,
    ) -> TemplateSetupRead:
        tree = self._trees.get_model(tree_id)
        version = tree.current_version
        self._trees._ensure_draft(version)
        definition, agent_ids, _ = self._ensure_snapshot(tree_id, user)
        requirement = next((item for item in definition.tool_requirements if item.id == requirement_id), None)
        if requirement is None:
            raise ResourceNotFoundError("Template Tool requirement not found")
        if setup is None and requirement.catalog_key not in _PACKAGE_BY_ID:
            raise ResourceNotFoundError("Tool Catalog package not found")
        target_agent_id = agent_ids.get(requirement.agent_ref) if requirement.agent_ref else agent_id
        if not target_agent_id:
            raise ServiceError("Choose which Agent should receive this shared Tool")
        if not any(item.id == target_agent_id for item in version.agents):
            raise ResourceNotFoundError("Agent not found in this Tree")
        status_item = next((item for item in resolve_requirements(
            self._database, version, definition, agent_ids,
        ) if item.id == requirement_id), None)
        if status_item is None or status_item.state in {TemplateRequirementState.MISSING, TemplateRequirementState.COMING_SOON}:
            raise ServiceError("This Catalog requirement cannot be resolved yet")

        if status_item.action == "assign":
            self._assign(self._database, version, target_agent_id, status_item.tool_id or "")
        elif status_item.action == "configure" and status_item.tool_id and requirement.catalog_key == "generic-mcp-http":
            tool = self._database.get(ToolConnection, status_item.tool_id)
            if tool is None or tool.tool_type != "mcp":
                raise ResourceNotFoundError("MCP Tool connection not found")
            if selected_tools is None:
                if not tool.discovered_tools_json:
                    from backend.services.tool_service import ToolService
                    ToolService(self._database).discover(tool.id)
                return self.get(tree_id, user)
            from backend.services.tool_service import ToolService
            ToolService(self._database).update(tool.id, ToolUpdate(selected_tools=selected_tools))
            refreshed_status = next(item for item in resolve_requirements(
                self._database, version, definition, agent_ids,
            ) if item.id == requirement_id)
            if refreshed_status.action != "assign":
                raise ServiceError("Select at least one discovered MCP Tool")
            self._assign(self._database, version, target_agent_id, tool.id)
        elif status_item.action in {"add", "configure"}:
            if setup is None:
                raise ServiceError("Complete the Catalog Tool setup before adding it")
            created = ToolCatalogService(self._database).create(requirement.catalog_key, setup)
            if requirement.catalog_key == "generic-mcp-http":
                from backend.services.tool_service import ToolService
                ToolService(self._database).discover(created.tool.id)
                return self.get(tree_id, user)
            self._assign(self._database, version, target_agent_id, created.tool.id)
        else:
            raise ResourceConflictError("This requirement is already ready")
        self._database.commit()
        return self.get(tree_id, user)

    def resolve_all_required(self, tree_id: str, user: User) -> TemplateSetupRead:
        tree = self._trees.get_model(tree_id)
        version = tree.current_version
        self._trees._ensure_draft(version)
        definition, agent_ids, _ = self._ensure_snapshot(tree_id, user)
        statuses = resolve_requirements(self._database, version, definition, agent_ids)
        for status in statuses:
            package = _PACKAGE_BY_ID.get(status.catalog_key)
            if status.requirement != "required" or status.state != TemplateRequirementState.AVAILABLE_TO_ADD:
                continue
            if package is None or package["status"].value != "ready":
                continue
            target = status.agent_id
            if not target:
                continue
            if status.action == "assign" and status.tool_id:
                self._assign(self._database, version, target, status.tool_id)
            elif status.action == "add" and not any(field["required"] for field in package["config_fields"]):
                created = ToolCatalogService(self._database).create(
                    status.catalog_key, ToolPackageSetupRequest(),
                )
                self._assign(self._database, version, target, created.tool.id)
        self._database.commit()
        return self.get(tree_id, user)
