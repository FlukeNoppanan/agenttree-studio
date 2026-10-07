"""Tree draft persistence, hierarchy, and readiness validation."""

from uuid import uuid4

from qualification_fixture import QUALIFIED_METADATA

import pytest
from sqlalchemy import func, select

from backend.models.provider import ProviderConnection, ProviderModel
from backend.models.tool import ToolConnection
from backend.models.tree import AgentConfig, Tree, TreeVersion
from backend.schemas.tree import ToolAssignmentDraft, TreeDraftPayload, TreeUpdate
from backend.services.errors import ResourceConflictError, ResourceNotFoundError, ServiceError
from backend.services.tree_service import TreeService


def connected_provider(database, model_id: str = "discovered-model") -> ProviderConnection:
    provider = ProviderConnection(
        name="Test Provider",
        provider_type="ollama",
        base_url="http://localhost:11434",
        status="connected",
    )
    database.add(provider)
    database.flush()
    database.add(ProviderModel(
        provider_connection_id=provider.id,
        model_id=model_id,
        is_available=True,
        qualification_status="qualified", metadata_json=QUALIFIED_METADATA,
    ))
    database.commit()
    return provider


def valid_payload(provider: ProviderConnection) -> TreeDraftPayload:
    root_id = str(uuid4())
    manager_id = str(uuid4())
    specialist_id = str(uuid4())
    return TreeDraftPayload.model_validate({
        "name": "Operations Tree",
        "description": "Routes operational work by capability.",
        "template": "blank",
        "agents": [
            {
                "id": root_id,
                "agent_type": "root",
                "name": "Main Root",
                "capabilities": ["triage"],
                "provider_connection_id": provider.id,
                "model_id": "discovered-model",
                "settings": {"final_review_enabled": True},
            },
            {
                "id": manager_id,
                "agent_type": "manager",
                "name": "Network Manager",
                "parent_agent_id": root_id,
                "capabilities": ["network"],
                "provider_connection_id": provider.id,
                "model_id": "discovered-model",
                "settings": {"review_enabled": True},
            },
            {
                "id": specialist_id,
                "agent_type": "specialist",
                "name": "Log Analyst",
                "parent_agent_id": manager_id,
                "capabilities": ["log-analysis"],
                "provider_connection_id": provider.id,
                "model_id": "discovered-model",
            },
        ],
        "trigger": {
            "trigger_type": "manual_form",
            "config": {"fields": [{"id": "objective", "name": "Objective", "type": "textarea", "required": True}]},
        },
        "output": {
            "output_type": "text",
            "delivery_type": "show_in_web",
            "config": {},
        },
    })


def test_create_tree_starts_as_draft_with_version_one(database) -> None:
    provider = connected_provider(database)

    created = TreeService(database).create(valid_payload(provider))

    assert created.status == "draft"
    assert created.version_number == 1
    assert created.version.status == "draft"
    assert created.current_version_id == created.version.id


def test_exactly_one_root_validation(database) -> None:
    provider = connected_provider(database)
    payload = valid_payload(provider)
    payload.agents = [agent for agent in payload.agents if agent.agent_type != "root"]
    for agent in payload.agents:
        if agent.agent_type == "manager":
            agent.parent_agent_id = None
    tree = TreeService(database).create(payload)

    validation = TreeService(database).validate(tree.id)

    assert any(error.code == "root_count" for error in validation.errors)
    assert validation.valid is False


def test_multiple_managers_are_allowed(database) -> None:
    provider = connected_provider(database)
    payload = valid_payload(provider)
    root_id = next(agent.id for agent in payload.agents if agent.agent_type == "root")
    second_manager = str(uuid4())
    payload.agents.extend([
        payload.agents[1].model_copy(update={"id": second_manager, "name": "Security Manager", "parent_agent_id": root_id}),
        payload.agents[2].model_copy(update={"id": str(uuid4()), "name": "Incident Analyst", "parent_agent_id": second_manager}),
    ])

    tree = TreeService(database).create(payload)
    validation = TreeService(database).validate(tree.id)

    assert validation.valid is True
    assert TreeService(database).get(tree.id).managers_count == 2


def test_ready_tree_configuration_edit_is_versioned_and_atomic(database) -> None:
    first = connected_provider(database)
    from backend.schemas.secret import SecretCreate
    from backend.services.secret_service import SecretService
    secret = SecretService(database).create(SecretCreate(name="Replacement key", secret_type="api_key", value="test-key"))
    second = ProviderConnection(name="Replacement", provider_type="groq", status="connected", secret_id=secret.id)
    database.add(second)
    database.flush()
    database.add(ProviderModel(provider_connection_id=second.id, model_id="ready-model",
                               is_available=True, generation_candidate=True, qualification_status="qualified", metadata_json=QUALIFIED_METADATA))
    database.add(ProviderModel(provider_connection_id=second.id, model_id="discovered-only",
                               is_available=True, generation_candidate=True, qualification_status="unknown"))
    tool = ToolConnection(name="Probe", tool_type="http_api", status="connected", enabled=True)
    database.add(tool)
    database.commit()

    service = TreeService(database)
    original = service.create(valid_payload(first))
    assert service.validate(original.id, mark_ready=True).valid
    payload = valid_payload(first)
    payload.description = "Updated without losing the original version"
    for agent in payload.agents:
        agent.provider_connection_id = second.id
        agent.model_id = "ready-model"
    payload.agents[2].name = "Renamed Specialist"
    payload.tool_assignments = [ToolAssignmentDraft(
        agent_config_id=payload.agents[2].id, tool_connection_id=tool.id,
    )]

    updated = service.replace_ready_configuration(original.id, payload)
    assert updated.status == "ready" and updated.version_number == 2
    assert updated.version.agents[2].name == "Renamed Specialist"
    assert all(agent.provider_connection_id == second.id and agent.model_id == "ready-model"
               for agent in updated.version.agents)
    assert updated.version.tool_assignments[0].agent_config_id == updated.version.agents[2].id
    assert updated.version.agents[2].id != original.version.agents[2].id
    assert updated.description == payload.description
    assert database.get(TreeVersion, original.version.id) is not None

    bad = payload.model_copy(deep=True)
    bad.agents[1].name = "Never committed"
    bad.agents[1].model_id = "unavailable-model"
    with pytest.raises(ServiceError, match="not in the provider catalog"):
        service.replace_ready_configuration(original.id, bad)
    preserved = service.get(original.id)
    assert preserved.version_number == 2
    assert preserved.version.agents[1].name != "Never committed"

    unqualified = payload.model_copy(deep=True)
    unqualified.agents[1].model_id = "discovered-only"
    with pytest.raises(ServiceError, match="not verified for AgentTree generation"):
        service.replace_ready_configuration(original.id, unqualified)
    assert service.get(original.id).version_number == 2

    tool.enabled = False
    database.commit()
    with pytest.raises(ServiceError, match="Tool must be enabled and connected"):
        service.replace_ready_configuration(original.id, payload)
    assert service.get(original.id).version_number == 2
    tool.enabled = True
    database.commit()

    broken = payload.model_copy(deep=True)
    broken.agents = [agent for agent in broken.agents if agent.agent_type != "manager"]
    with pytest.raises(ServiceError, match="missing parent"):
        service.replace_ready_configuration(original.id, broken)
    assert service.get(original.id).version_number == 2


def test_ready_tree_tool_assignment_can_be_added_and_removed(database) -> None:
    provider = connected_provider(database)
    from backend.schemas.secret import SecretCreate
    from backend.services.secret_service import SecretService
    secret = SecretService(database).create(SecretCreate(name="Tool capable key", secret_type="api_key", value="test-key"))
    provider.provider_type = "groq"
    provider.secret_id = secret.id
    database.commit()
    tool = ToolConnection(name="Disposable Tool", tool_type="http_api", status="connected", enabled=True)
    database.add(tool)
    database.commit()
    service = TreeService(database)
    original = service.create(valid_payload(provider))
    assert service.validate(original.id, mark_ready=True).valid
    with_tool = valid_payload(provider)
    with_tool.tool_assignments = [ToolAssignmentDraft(
        agent_config_id=with_tool.agents[2].id, tool_connection_id=tool.id,
    )]
    added = service.replace_ready_configuration(original.id, with_tool)
    assert len(added.version.tool_assignments) == 1
    without_tool = valid_payload(provider)
    removed = service.replace_ready_configuration(original.id, without_tool)
    assert removed.status == "ready" and removed.version_number == 3
    assert removed.version.tool_assignments == []
    assert database.get(TreeVersion, added.version.id) is not None


def test_specialist_must_belong_to_manager(database) -> None:
    provider = connected_provider(database)
    payload = valid_payload(provider)
    root_id = next(agent.id for agent in payload.agents if agent.agent_type == "root")
    specialist = next(agent for agent in payload.agents if agent.agent_type == "specialist")
    specialist.parent_agent_id = root_id

    with pytest.raises(ServiceError, match="Specialists must belong"):
        TreeService(database).create(payload)


def test_manager_removal_safely_removes_its_specialists(database) -> None:
    provider = connected_provider(database)
    service = TreeService(database)
    payload = valid_payload(provider)
    tree = service.create(payload)
    root = next(agent for agent in payload.agents if agent.agent_type == "root")
    payload.agents = [root]

    updated = service.save_draft(tree.id, payload)

    assert updated.managers_count == 0
    assert updated.specialists_count == 0
    stored_agents = database.scalar(select(func.count()).select_from(AgentConfig))
    assert stored_agents == 1


def test_provider_reference_must_exist_and_be_connected(database) -> None:
    provider = connected_provider(database)
    payload = valid_payload(provider)
    payload.agents[0].provider_connection_id = str(uuid4())
    with pytest.raises(ServiceError, match="missing provider"):
        TreeService(database).create(payload)

    payload = valid_payload(provider)
    provider.status = "error"
    database.commit()
    tree = TreeService(database).create(payload)
    disconnected = TreeService(database).validate(tree.id)
    assert any(error.code == "provider_not_connected" for error in disconnected.errors)


def test_model_must_exist_in_selected_provider_catalog(database) -> None:
    provider = connected_provider(database)
    payload = valid_payload(provider)
    payload.agents[0].model_id = "invented-model"
    tree = TreeService(database).create(payload)

    validation = TreeService(database).validate(tree.id)

    assert any(error.code == "model_missing" for error in validation.errors)


def test_existing_tree_with_unavailable_model_remains_readable(database) -> None:
    provider = connected_provider(database)
    service = TreeService(database)
    tree = service.create(valid_payload(provider))
    model = database.scalar(select(ProviderModel).where(
        ProviderModel.provider_connection_id == provider.id,
    ))
    model.qualification_status = "unavailable"
    model.is_available = False
    database.commit()

    detail = service.get(tree.id)
    validation = service.validate(tree.id)

    assert detail.root.model_id == "discovered-model"
    assert detail.root.provider_connection_id == provider.id
    assert any(error.code == "model_unavailable" for error in validation.errors)
    assert "secret" not in detail.model_dump_json().casefold()


def test_every_agent_requires_a_capability(database) -> None:
    provider = connected_provider(database)
    payload = valid_payload(provider)
    payload.agents[2].capabilities = []
    tree = TreeService(database).create(payload)

    validation = TreeService(database).validate(tree.id)

    assert any(error.code == "capability_required" for error in validation.errors)


def test_tree_validation_does_not_require_trigger_or_output(database) -> None:
    provider = connected_provider(database)
    payload = valid_payload(provider)
    payload.trigger = None
    payload.output = None
    tree = TreeService(database).create(payload)

    validation = TreeService(database).validate(tree.id)

    assert validation.valid is True
    assert not any(error.step in {"trigger", "output"} for error in validation.errors)


def test_save_draft_persists_full_configuration(database) -> None:
    provider = connected_provider(database)
    service = TreeService(database)
    payload = valid_payload(provider)
    tree = service.create(payload)
    payload.name = "Updated Operations Tree"
    payload.agents[0].system_instruction = "Coordinate work by capability."
    payload.output.output_type = "structured_json"

    saved = service.save_draft(tree.id, payload)
    reloaded = service.get(tree.id)

    assert saved.name == "Updated Operations Tree"
    assert reloaded.root.system_instruction == "Coordinate work by capability."
    assert reloaded.version.output.output_type == "structured_json"


def test_webhook_route_and_tool_assignments_are_persisted(database) -> None:
    provider = connected_provider(database)
    tool = ToolConnection(name="Search", tool_type="function", status="available")
    database.add(tool)
    database.commit()
    payload = valid_payload(provider)
    payload.trigger.trigger_type = "webhook"
    payload.trigger.config = {}
    manager = next(agent for agent in payload.agents if agent.agent_type == "manager")
    payload.tool_assignments = [ToolAssignmentDraft(
        agent_config_id=manager.id,
        tool_connection_id=tool.id,
    )]

    tree = TreeService(database).create(payload)

    assert tree.version.trigger.config["route"] == f"/api/trees/{tree.id}/webhook"
    assert tree.version.tool_assignments[0].agent_config_id == manager.id
    assert tree.version.tool_assignments[0].tool_connection_id == tool.id


def test_tree_list_and_detail_summaries(database) -> None:
    provider = connected_provider(database)
    service = TreeService(database)
    tree = service.create(valid_payload(provider))

    listing = service.list()
    detail = service.get(tree.id)

    assert [(item.name, item.managers_count, item.specialists_count) for item in listing] == [
        ("Operations Tree", 1, 1),
    ]
    assert detail.root.name == "Main Root"
    assert detail.provider_usage == ["Test Provider"]
    assert detail.trigger_type == "manual_form"
    assert detail.output_type == "text"


def test_valid_tree_can_be_marked_ready_but_invalid_tree_cannot(database) -> None:
    provider = connected_provider(database)
    service = TreeService(database)
    valid_tree = service.create(valid_payload(provider))

    validation = service.validate(valid_tree.id, mark_ready=True)

    assert validation.valid is True
    assert service.get(valid_tree.id).status == "ready"

    invalid_payload = valid_payload(provider)
    invalid_payload.agents[-1].capabilities = []
    invalid_tree = service.create(invalid_payload)
    with pytest.raises(ServiceError, match="cannot become ready"):
        service.update(invalid_tree.id, TreeUpdate(status="ready"))

    with pytest.raises(ResourceConflictError, match="Only the active draft"):
        service.save_draft(valid_tree.id, valid_payload(provider))


def test_delete_tree_cascades_versions_and_agents(database) -> None:
    provider = connected_provider(database)
    service = TreeService(database)
    tree = service.create(valid_payload(provider))

    service.delete(tree.id)

    assert database.scalar(select(func.count()).select_from(Tree)) == 0
    assert database.scalar(select(func.count()).select_from(TreeVersion)) == 0
    assert database.scalar(select(func.count()).select_from(AgentConfig)) == 0
    with pytest.raises(ResourceNotFoundError):
        service.get(tree.id)


def test_builder_preview_reuses_readiness_without_persisting(database):
    service = TreeService(database)
    payload = valid_payload(connected_provider(database))
    counts = {model: database.scalar(select(func.count()).select_from(model)) for model in (Tree, TreeVersion, AgentConfig)}
    assert service.preview_draft(payload).valid
    assert not database.new
    assert counts == {model: database.scalar(select(func.count()).select_from(model)) for model in counts}
    payload.agents[2].model_id = None
    result = service.preview_draft(payload)
    assert not result.valid
    assert any(issue.agent_id == payload.agents[2].id for issue in result.errors)


def test_builder_preview_does_not_change_ready_version(database):
    service = TreeService(database)
    payload = valid_payload(connected_provider(database))
    tree = service.create(payload)
    service.validate(tree.id, mark_ready=True)
    payload.agents[1].parent_agent_id = None
    assert not service.preview_draft(payload, tree.id).valid
    persisted = service.get(tree.id)
    assert persisted.current_version_id == tree.current_version_id
    assert persisted.status == 'ready'
    assert persisted.version.agents[1].parent_agent_id is not None


def test_builder_preview_empty_and_duplicate_roots(database):
    service = TreeService(database)
    empty = TreeDraftPayload(name='Blank', agents=[])
    assert any(i.code == 'root_count' for i in service.preview_draft(empty).errors)
    payload = valid_payload(connected_provider(database))
    copy = payload.agents[0].model_copy(update={'id': str(uuid4())})
    payload.agents.append(copy)
    assert any(i.code == 'root_count' for i in service.preview_draft(payload).errors)


def test_builder_preview_reports_tool_loop_and_mcp_readiness(database):
    service = TreeService(database)
    from backend.schemas.secret import SecretCreate
    from backend.services.secret_service import SecretService
    provider = connected_provider(database)
    secret = SecretService(database).create(SecretCreate(name="MCP key", secret_type="api_key", value="test-key"))
    provider.provider_type = "groq"
    provider.secret_id = secret.id
    database.commit()
    payload = valid_payload(provider)
    payload.agents[2].settings = {'autonomous_tool_use': True}
    assert any(i.code == 'tool_assignment_required' for i in service.preview_draft(payload).errors)
    tool = ToolConnection(name='MCP', tool_type='mcp', status='connected', enabled=True,
                          transport_type='streamable_http', discovered_tools_json=[])
    database.add(tool)
    database.commit()
    payload.tool_assignments = [ToolAssignmentDraft(agent_config_id=payload.agents[2].id, tool_connection_id=tool.id)]
    assert any(i.code == 'mcp_tool_not_selected' for i in service.preview_draft(payload).errors)
    tool.discovered_tools_json = [{'name': 'query', 'selected': True}]
    database.commit()
    assert service.preview_draft(payload).valid


def test_ready_model_with_unsupported_provider_tool_binding_is_tree_not_ready(database):
    service = TreeService(database)
    provider = connected_provider(database)
    payload = valid_payload(provider)
    tool = ToolConnection(name="Bound HTTP Tool", tool_type="http_api", status="connected", enabled=True,
                          config_json={"base_url": "https://example.test"})
    database.add(tool)
    database.commit()
    payload.tool_assignments = [ToolAssignmentDraft(
        agent_config_id=payload.agents[0].id, tool_connection_id=tool.id,
    )]

    result = service.preview_draft(payload)
    assert not result.valid
    issue = next(issue for issue in result.errors if issue.code == "provider_tool_incompatible")
    assert issue.agent_id == payload.agents[0].id
    assert "Tool" in issue.message and "provider" in issue.message
    assert database.query(ProviderModel).filter_by(model_id="discovered-model").one().qualification_status == "qualified"

    from backend.schemas.secret import SecretCreate
    from backend.services.secret_service import SecretService
    secret = SecretService(database).create(SecretCreate(name="Compatible key", secret_type="api_key", value="test-key"))
    provider.provider_type = "groq"
    provider.secret_id = secret.id
    assert service.preview_draft(payload).valid


def test_historical_version_selector_retains_pinned_agent_ids(database):
    service = TreeService(database)
    payload = valid_payload(connected_provider(database))
    tree = service.create(payload)
    assert service.validate(tree.id, mark_ready=True).valid
    old_id = tree.version.id
    old_agents = {agent.id for agent in tree.version.agents}
    updated = service.replace_ready_configuration(tree.id, payload)
    assert updated.version.id != old_id
    assert {agent.id for agent in service.get_version(tree.id, old_id).agents} == old_agents
    assert service.get_version(tree.id).id == updated.version.id


def test_version_selector_rejects_version_from_another_tree(database):
    service = TreeService(database)
    payload = valid_payload(connected_provider(database))
    tree_a = service.create(payload)
    tree_b = service.create(valid_payload(database.get(ProviderConnection, payload.agents[0].provider_connection_id)))
    with pytest.raises(ResourceNotFoundError):
        service.get_version(tree_a.id, tree_b.version.id)
    with pytest.raises(ResourceNotFoundError):
        service.get_version(tree_a.id, 'missing-version')
