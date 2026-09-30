"""Built-in and user-owned portable Tree Template operations."""

from __future__ import annotations

import re
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models.auth import User
from backend.models.template import TreeTemplate
from backend.models.tool import ToolConnection
from backend.schemas.template import (
    TemplateDefinition,
    TemplateMetadataCreate,
    TemplateRead,
    TemplateType,
    TemplateUpdate,
    upgrade_template_definition,
)
from backend.schemas.tree import AgentDraft, OutputDraft, TreeDraftPayload, TriggerDraft
from backend.services.errors import ResourceConflictError, ResourceNotFoundError
from backend.services.template_requirements import catalog_key_for_tool
from backend.services.tree_service import TreeService
from backend.templates.builtin import BUILTIN_TEMPLATES
from backend.tools.catalog import TOOL_PACKAGES

_SENSITIVE_KEY = re.compile(r"authorization|api.?key|access.?token|refresh.?token|password|secret|credential|bearer", re.I)
_ENVIRONMENT_KEY = re.compile(
    r"^(provider(?:_connection)?_id|model_id|tool(?:_connection)?_id|destination_id|"
    r"result_destination_id|tree_id|source_tree_id|route|webhook_(?:url|route|path)|"
    r"endpoint(?:_url)?|base_url|url|uri|host)$", re.I,
)
_SENSITIVE_TEXT = re.compile(
    r"(?i)(bearer\s+)[A-Za-z0-9._~+/-]{8,}|((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|credential)\s*[:=]\s*)[^\s&,;]+",
)


def _safe_value(value: Any, *, key: str = "") -> Any:
    """Drop credential-shaped fields and redact common credentials in text."""
    if _SENSITIVE_KEY.search(key) or _ENVIRONMENT_KEY.fullmatch(key):
        return None
    if isinstance(value, dict):
        return {
            str(child_key): _safe_value(child_value, key=str(child_key))
            for child_key, child_value in value.items()
            if not _SENSITIVE_KEY.search(str(child_key))
            and not _ENVIRONMENT_KEY.fullmatch(str(child_key))
        }
    if isinstance(value, list):
        return [_safe_value(item) for item in value]
    if isinstance(value, str):
        return _SENSITIVE_TEXT.sub(lambda match: (match.group(1) or match.group(2) or "") + "[redacted]", value)
    return value


def sanitize_definition(definition: TemplateDefinition) -> TemplateDefinition:
    # Apply recursively to the entire portable definition. User-authored Agent
    # labels, tool recommendations, and nested input/output metadata can all
    # contain credential-shaped text too.
    safe = _safe_value(definition.model_dump(mode="json"))
    return TemplateDefinition.model_validate(safe)


class TemplateService:
    def __init__(self, database: Session) -> None:
        self._database = database

    @staticmethod
    def _builtin_read(item: dict) -> TemplateRead:
        definition = upgrade_template_definition(item["definition"])
        managers = sum(agent.agent_type == "manager" for agent in definition.agents)
        specialists = sum(agent.agent_type == "specialist" for agent in definition.agents)
        return TemplateRead(
            id=item["id"], name=item["name"], description=item["description"],
            category=item["category"], template_type=TemplateType.BUILTIN,
            definition=definition, agent_count=len(definition.agents),
            manager_count=managers, specialist_count=specialists, created_by=None,
        )

    @staticmethod
    def _user_read(item: TreeTemplate) -> TemplateRead:
        definition = upgrade_template_definition(item.definition_json)
        return TemplateRead(
            id=item.id, name=item.name, description=item.description,
            category=item.category, template_type=TemplateType.USER,
            definition=definition, agent_count=len(definition.agents),
            manager_count=sum(agent.agent_type == "manager" for agent in definition.agents),
            specialist_count=sum(agent.agent_type == "specialist" for agent in definition.agents),
            created_by=item.created_by, created_at=item.created_at, updated_at=item.updated_at,
        )

    def list(self, user: User) -> list[TemplateRead]:
        statement = select(TreeTemplate).order_by(TreeTemplate.name)
        if not user.is_admin:
            statement = statement.where(TreeTemplate.created_by == user.id)
        users = [self._user_read(item) for item in self._database.scalars(statement).all()]
        builtins = [self._builtin_read(item) for item in BUILTIN_TEMPLATES]
        return builtins + users

    def get(self, template_id: str, user: User) -> TemplateRead:
        builtin = next((item for item in BUILTIN_TEMPLATES if item["id"] == template_id), None)
        if builtin:
            return self._builtin_read(builtin)
        item = self._database.get(TreeTemplate, template_id)
        if item is None:
            raise ResourceNotFoundError("Template not found")
        if item.template_type != TemplateType.USER.value:
            raise ResourceNotFoundError("Template not found")
        if not user.is_admin and item.created_by != user.id:
            raise ResourceNotFoundError("Template not found")
        return self._user_read(item)

    def _user_model(self, template_id: str, user: User) -> TreeTemplate:
        item = self._database.get(TreeTemplate, template_id)
        if item is None or item.template_type != TemplateType.USER.value:
            raise ResourceNotFoundError("User Template not found")
        if not user.is_admin and item.created_by != user.id:
            raise ResourceNotFoundError("User Template not found")
        return item

    @staticmethod
    def _definition_from_tree(tree_id: str, database: Session) -> tuple[str, str, TemplateDefinition]:
        service = TreeService(database)
        tree_model = service.get_model(tree_id)
        tree = service.get(tree_id)
        agents = tree.version.agents
        instance = tree_model.current_version.template_instance_json or {}
        raw_source = instance.get("definition") if isinstance(instance, dict) else None
        try:
            source = upgrade_template_definition(raw_source) if isinstance(raw_source, dict) else None
        except (TypeError, ValueError):
            source = None
        source_by_key = {item.key: item for item in source.agents} if source else {}
        key_by_id: dict[str, str] = {}
        source_ids = instance.get("agent_ids", {}) if isinstance(instance, dict) else {}
        if isinstance(source_ids, dict):
            for key, agent_id in source_ids.items():
                if key in source_by_key and any(agent.id == agent_id for agent in agents):
                    key_by_id[agent_id] = key
        used_keys = set(key_by_id.values())
        for index, agent in enumerate(agents, start=1):
            if agent.id in key_by_id:
                continue
            base = f"agent_{index}"
            key, suffix = base, 2
            while key in used_keys:
                key, suffix = f"{base}_{suffix}", suffix + 1
            key_by_id[agent.id] = key
            used_keys.add(key)
        records = []
        for agent in agents:
            settings = dict(agent.settings or {})
            if isinstance(settings.get("allowed_manager_peer_ids"), list):
                settings["allowed_manager_peer_ids"] = [
                    key_by_id[item] for item in settings["allowed_manager_peer_ids"]
                    if item in key_by_id
                ]
            # A portable template has no live Tool bindings. Require users to
            # assign a Tool again before enabling autonomous Tool use.
            if agent.agent_type == "specialist":
                settings["autonomous_tool_use"] = False
            key = key_by_id[agent.id]
            source_agent = source_by_key.get(key)
            records.append({
                "key": key,
                "agent_type": agent.agent_type,
                "name": agent.name,
                "role": source_agent.role if source_agent else {
                    "root": "Coordinator", "manager": "Workstream Manager",
                    "specialist": "Domain Specialist",
                }.get(agent.agent_type, ""),
                "description": agent.description,
                "parent_key": key_by_id.get(agent.parent_agent_id),
                "system_instruction": agent.system_instruction,
                "capabilities": agent.capabilities,
                "settings": settings,
            })

        warning_values = source.metadata.get("portable_tool_warnings", []) if source else []
        tool_warnings = list(warning_values) if isinstance(warning_values, list) else []
        known_catalog_keys = {item["id"] for item in TOOL_PACKAGES}
        requirements = {}
        for item in source.tool_requirements if source else []:
            if item.catalog_key not in known_catalog_keys:
                tool_warnings.append(
                    f"{item.catalog_key}: this custom Tool requirement has no portable Catalog package and was omitted."
                )
                continue
            if item.agent_ref is not None and item.agent_ref not in used_keys:
                tool_warnings.append(
                    f"{item.id}: the referenced Agent is absent from this Tree, so the requirement was omitted."
                )
                continue
            requirements[item.id] = item.model_dump(mode="json")
        for assignment in tree.version.tool_assignments:
            tool = database.get(ToolConnection, assignment.tool_connection_id)
            if tool is None:
                continue
            catalog_key = catalog_key_for_tool(tool)
            if catalog_key is None:
                tool_warnings.append(
                    f"{tool.name}: this custom Tool has no safely portable Catalog package and was omitted."
                )
                continue
            agent_ref = key_by_id.get(assignment.agent_config_id)
            requirement_id = f"{catalog_key}-{agent_ref or 'shared'}"[:100]
            requirements.setdefault(requirement_id, {
                "id": requirement_id,
                "catalog_key": catalog_key,
                "requirement": "recommended",
                "agent_ref": agent_ref,
                "reason": f"Optional Tool previously assigned to {tool.name}.",
            })
        trigger = tree.version.trigger
        output = tree.version.output
        definition = TemplateDefinition.model_validate({
            "schema_version": 2,
            "agents": records,
            "tool_requirements": list(requirements.values()),
            # Webhook URLs and routes belong to the source environment and
            # should be recreated when the instantiated Tree is configured.
            "trigger": {"trigger_type": trigger.trigger_type, "config": trigger.config}
            if trigger and trigger.trigger_type != "webhook" else None,
            "output": {"output_type": output.output_type, "delivery_type": output.delivery_type, "config": output.config} if output else None,
            # Do not retain source environment identifiers in portable templates.
            "metadata": {"portable_tool_warnings": sorted(set(tool_warnings))},
        })
        return tree.name, tree.description, sanitize_definition(definition)

    def create_from_tree(
        self,
        tree_id: str,
        payload: TemplateMetadataCreate,
        user: User,
    ) -> TemplateRead:
        _, _, definition = self._definition_from_tree(tree_id, self._database)
        item = TreeTemplate(
            name=str(_safe_value(payload.name)),
            description=str(_safe_value(payload.description)),
            category=str(_safe_value(payload.category)),
            template_type=TemplateType.USER.value,
            definition_json=definition.model_dump(mode="json"),
            created_by=user.id,
        )
        self._database.add(item)
        self._database.commit()
        self._database.refresh(item)
        return self._user_read(item)

    def update(self, template_id: str, payload: TemplateUpdate, user: User) -> TemplateRead:
        if any(item["id"] == template_id for item in BUILTIN_TEMPLATES):
            raise ResourceConflictError("Built-in Templates are read-only")
        item = self._user_model(template_id, user)
        changes = payload.model_dump(exclude_unset=True)
        for field in ("name", "description", "category"):
            if field in changes and changes[field] is not None:
                setattr(item, field, str(_safe_value(changes[field])))
        if "definition" in changes and changes["definition"] is not None:
            definition = sanitize_definition(upgrade_template_definition(changes["definition"]))
            item.definition_json = definition.model_dump(mode="json")
        self._database.commit()
        self._database.refresh(item)
        return self._user_read(item)

    def delete(self, template_id: str, user: User) -> None:
        if any(item["id"] == template_id for item in BUILTIN_TEMPLATES):
            raise ResourceConflictError("Built-in Templates cannot be deleted")
        item = self._user_model(template_id, user)
        self._database.delete(item)
        self._database.commit()

    def instantiate(self, template_id: str, user: User, *, name: str | None = None):
        template = self.get(template_id, user)
        definition = sanitize_definition(template.definition)
        id_by_key = {agent.key: str(uuid4()) for agent in definition.agents}
        draft_agents = []
        for agent in definition.agents:
            settings = dict(agent.settings)
            if isinstance(settings.get("allowed_manager_peer_ids"), list):
                settings["allowed_manager_peer_ids"] = [
                    id_by_key[key] for key in settings["allowed_manager_peer_ids"]
                    if key in id_by_key
                ]
            # No Tool IDs or Provider/model credentials are portable.
            if agent.agent_type == "specialist":
                settings["autonomous_tool_use"] = False
            draft_agents.append(AgentDraft(
                id=id_by_key[agent.key],
                agent_type=agent.agent_type,
                name=agent.name,
                description=agent.description,
                parent_agent_id=id_by_key.get(agent.parent_key),
                provider_connection_id=None,
                model_id=None,
                system_instruction=agent.system_instruction,
                capabilities=agent.capabilities,
                settings=settings,
            ))
        payload = TreeDraftPayload(
            name=(name or template.name).strip(),
            description=template.description,
            template=template.id,
            agents=draft_agents,
            tool_assignments=[],
            trigger=TriggerDraft.model_validate(definition.trigger.model_dump()) if definition.trigger else None,
            output=OutputDraft.model_validate(definition.output.model_dump()) if definition.output else None,
        )
        return TreeService(self._database).create(payload, template_instance={
            "schema_version": 1,
            "source_template_id": template.id,
            "definition": definition.model_dump(mode="json"),
            "agent_ids": dict(id_by_key),
        })
