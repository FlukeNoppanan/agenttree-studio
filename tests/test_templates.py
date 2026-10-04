"""Portable, owner-scoped Tree Template catalog and instantiation coverage."""

import json
from uuid import uuid4

import pytest
from pydantic import ValidationError

from backend.models.auth import User
from backend.models.provider import ProviderConnection
from backend.models.secret import Secret
from backend.models.tool import ToolConnection
from backend.schemas.template import TemplateDefinition, TemplateMetadataCreate, TemplateUpdate
from backend.schemas.tree import ToolAssignmentDraft, TreeDraftPayload, TriggerDraft
from backend.services.errors import ResourceConflictError, ResourceNotFoundError
from backend.services.template_service import TemplateService
from backend.services.tree_service import TreeService
from tests.test_trees import valid_payload


def user(database, *, admin=False, name="owner"):
    record = User(username=name, username_key=name.casefold(), password_hash="unused", is_admin=admin)
    database.add(record)
    database.commit()
    return record


def test_builtin_catalog_preview_and_instantiation_create_independent_draft(database):
    owner = user(database)
    service = TemplateService(database)
    listed = service.list(owner)
    assert {item.id for item in listed} >= {
        "builtin-blank", "builtin-general-analysis", "builtin-document-analysis",
        "builtin-it-troubleshooting", "builtin-api-data-analysis",
    }
    preview = service.get("builtin-general-analysis", owner)
    assert preview.agent_count > 1 and preview.manager_count > 0 and preview.specialist_count > 0

    tree = service.instantiate(preview.id, owner, name="My analysis copy")
    assert tree.id != preview.id
    assert tree.name == "My analysis copy" and tree.status == "draft"
    assert all(agent.provider_connection_id is None and agent.model_id is None for agent in tree.version.agents)
    assert tree.version.tool_assignments == []
    original = service.get(preview.id, owner)
    assert original.name == preview.name
    tree.version.agents[0].name = "Changed only in the Tree"
    assert service.get(preview.id, owner).definition.agents[0].name != "Changed only in the Tree"


def test_save_tree_as_template_strips_provider_tool_and_secret_material(database):
    owner = user(database)
    provider = ProviderConnection(name="Local model", provider_type="ollama", status="connected", base_url="http://localhost:11434")
    tool_secret = Secret(name="private api", secret_type="api_key", encrypted_value="encrypted-value")
    database.add_all([provider, tool_secret])
    database.flush()
    tool = ToolConnection(
        name="Authenticated API", tool_type="http_api", description="Fetch api_key=should-not-appear",
        enabled=True, secret_id=tool_secret.id, status="connected",
        config_json={"url": "https://api.example.test", "headers": {"Authorization": "Bearer {{secret}}"}},
    )
    database.add(tool)
    database.commit()
    payload = valid_payload(provider)
    payload.agents[0].system_instruction = "Never copy api_key=should-not-appear"
    payload.agents[2].settings = {"access_token": "should-not-appear", "autonomous_tool_use": True}
    payload.output.config = {"destination_id": "environment-specific-id", "shape": "summary"}
    payload.trigger = TriggerDraft(trigger_type="webhook", config={"route": "/private-route", "url": "https://private.example.test"})
    payload.tool_assignments = [ToolAssignmentDraft(agent_config_id=payload.agents[2].id, tool_connection_id=tool.id)]
    source = TreeService(database).create(payload)

    saved = TemplateService(database).create_from_tree(
        source.id, TemplateMetadataCreate(name="Portable Ops", category="ops"), owner,
    )
    serialized = json.dumps(saved.model_dump(mode="json"))
    assert saved.template_type.value == "user"
    assert saved.definition.suggested_tools == []
    assert saved.definition.tool_requirements[0].catalog_key == "web-api-request"
    assert saved.definition.tool_requirements[0].agent_ref == "agent_3"
    assert "provider_connection_id" not in serialized and "model_id" not in serialized
    assert "access_token" not in serialized and "should-not-appear" not in serialized
    assert "secret_id" not in serialized and "encrypted-value" not in serialized
    assert "destination_id" not in serialized and "environment-specific-id" not in serialized
    assert "private-route" not in serialized and saved.definition.trigger is None
    assert saved.definition.metadata == {"portable_tool_warnings": []}
    specialist = next(agent for agent in saved.definition.agents if agent.agent_type == "specialist")
    assert specialist.settings["autonomous_tool_use"] is False


def test_user_template_owner_edit_delete_and_builtin_immutability(database):
    owner = user(database, name="template-owner")
    other = user(database, name="other-user")
    service = TemplateService(database)
    created = service.create_from_tree(
        TreeService(database).create(
            # A Root-only draft is valid as a draft starter.
            TreeDraftPayload(
                name="Source", agents=[{"agent_type": "root", "name": "Root", "capabilities": ["review"]}],
            ),
        ).id,
        TemplateMetadataCreate(name="My template"), owner,
    )
    edited = service.update(created.id, TemplateUpdate(name="Renamed", category="review"), owner)
    assert edited.name == "Renamed" and edited.category == "review"
    portable = service.get("builtin-general-analysis", owner).definition
    edited_definition = service.update(created.id, TemplateUpdate(definition=portable), owner)
    assert edited_definition.definition.schema_version == 2
    with pytest.raises(ResourceNotFoundError):
        service.get(created.id, other)
    with pytest.raises(ResourceNotFoundError):
        service.delete(created.id, other)
    with pytest.raises(ResourceConflictError, match="read-only"):
        service.update("builtin-blank", TemplateUpdate(name="Change"), owner)
    with pytest.raises(ResourceConflictError, match="cannot be deleted"):
        service.delete("builtin-blank", owner)
    service.delete(created.id, owner)
    with pytest.raises(ResourceNotFoundError):
        service.get(created.id, owner)


@pytest.mark.parametrize("definition", [
    {"schema_version": 3, "agents": [{"key": "root", "agent_type": "root", "name": "Root"}]},
    {"schema_version": 1, "agents": [
        {"key": "root", "agent_type": "root", "name": "Root"},
        {"key": "manager", "agent_type": "manager", "name": "Manager", "parent_key": "missing"},
    ]},
    {"schema_version": 1, "agents": [
        {"key": "root", "agent_type": "root", "name": "Root"},
        {"key": "root", "agent_type": "root", "name": "Duplicate"},
    ]},
])
def test_invalid_template_definitions_and_schema_versions_are_rejected(definition):
    with pytest.raises(ValidationError):
        TemplateDefinition.model_validate(definition)


def test_template_access_policy_reuses_existing_permissions():
    from backend.core.authz import required_access
    assert required_access("/api/templates", "GET") == ("manage_trees_agents", None)
    assert required_access("/api/tool-catalog", "GET") == ("manage_tools_mcp", None)
    assert required_access("/api/templates/source/draft", "GET") == ("manage_trees_agents", None)
    assert required_access("/api/templates/source/validate-draft", "POST") == ("manage_trees_agents", None)


def test_unsaved_template_draft_and_readiness_do_not_write_trees(database):
    from sqlalchemy import select, func
    from backend.models.tree import Tree
    owner = user(database)
    service = TemplateService(database)
    before = database.scalar(select(func.count()).select_from(Tree))
    draft = service.prepare_draft('builtin-general-analysis', owner)
    assert len(draft.configuration.agents) == 5
    assert set(draft.agent_ids.values()) == {a.id for a in draft.configuration.agents}
    assert all(a.provider_connection_id is None and a.model_id is None for a in draft.configuration.agents)
    assert draft.configuration.tool_assignments == []
    validation = service.preview_configuration('builtin-general-analysis', owner, draft.configuration, draft.agent_ids)
    assert not validation.valid
    assert database.scalar(select(func.count()).select_from(Tree)) == before


def test_save_edited_template_draft_preserves_identity_and_requirements(database):
    from backend.models.tree import TreeVersion
    owner = user(database)
    service = TemplateService(database)
    draft = service.prepare_draft('builtin-general-analysis', owner)
    draft.configuration.name = 'Edited before first Save'
    draft.configuration.agents[0].name = 'Edited Root'
    tree = service.instantiate('builtin-general-analysis', owner, configuration=draft.configuration, agent_ids=draft.agent_ids)
    assert tree.name == 'Edited before first Save'
    assert {a.id for a in tree.version.agents} == set(draft.agent_ids.values())
    version = database.get(TreeVersion, tree.current_version_id)
    assert version.template_instance_json['agent_ids'] == draft.agent_ids
    assert version.template_instance_json['definition']['tool_requirements']
    assert version.template_instance_json['source_template_id'] == 'builtin-general-analysis'


@pytest.mark.parametrize('invalid', ['missing', 'duplicate', 'wrong_role'])
def test_template_identity_mapping_rejects_invalid_inputs_without_writes(database, invalid):
    from sqlalchemy import select, func
    from backend.models.tree import Tree
    from backend.services.errors import ServiceError
    owner = user(database)
    service = TemplateService(database)
    draft = service.prepare_draft('builtin-general-analysis', owner)
    ids = draft.agent_ids.copy()
    keys = list(ids)
    if invalid == 'missing': ids.pop(keys[0])
    elif invalid == 'duplicate': ids[keys[1]] = ids[keys[0]]
    else: draft.configuration.agents[0].agent_type = 'specialist'
    with pytest.raises(ServiceError):
        service.instantiate('builtin-general-analysis', owner, configuration=draft.configuration, agent_ids=ids)
    assert database.scalar(select(func.count()).select_from(Tree)) == 0


@pytest.mark.parametrize('template_id', [item['id'] for item in __import__('backend.templates.builtin',fromlist=['BUILTIN_TEMPLATES']).BUILTIN_TEMPLATES])
def test_every_builtin_is_portable_and_prepares_the_existing_tree_model(database,template_id):
    from backend.tools.catalog import TOOL_PACKAGES
    owner=user(database)
    service=TemplateService(database)
    template=service.get(template_id,owner)
    definition=TemplateDefinition.model_validate_json(template.definition.model_dump_json())
    assert definition==template.definition
    assert definition.metadata['difficulty'] in {'beginner','intermediate','advanced'}
    assert len({a.key for a in definition.agents})==len(definition.agents)
    assert len([a for a in definition.agents if a.agent_type=='root'])==1
    assert all(a.capabilities for a in definition.agents if template_id!='builtin-blank')
    assert all(r.catalog_key in {p['id'] for p in TOOL_PACKAGES} for r in definition.tool_requirements)
    assert all(a.system_instruction for a in definition.agents)
    draft=service.prepare_draft(template_id,owner)
    assert all(a.provider_connection_id is None and a.model_id is None for a in draft.configuration.agents)
    assert draft.configuration.tool_assignments==[]
    tree=service.instantiate(template_id,owner,configuration=draft.configuration,agent_ids=draft.agent_ids)
    assert len(tree.version.agents)==template.agent_count
    assert tree.template==template_id
    assert {a.id for a in tree.version.agents}==set(draft.agent_ids.values())
    result=TreeService(database).validate(tree.id)
    assert not result.valid  # Provider/Model binding is explicit for every starter.
    assert not any(i.code in {'root_count','manager_parent','specialist_parent','core_compatibility'} for i in result.errors)
