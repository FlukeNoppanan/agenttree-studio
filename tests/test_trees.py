"""Tree draft persistence, hierarchy, and readiness validation."""

from uuid import uuid4

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


def test_every_agent_requires_a_capability(database) -> None:
    provider = connected_provider(database)
    payload = valid_payload(provider)
    payload.agents[2].capabilities = []
    tree = TreeService(database).create(payload)

    validation = TreeService(database).validate(tree.id)

    assert any(error.code == "capability_required" for error in validation.errors)


def test_trigger_and_output_are_required(database) -> None:
    provider = connected_provider(database)
    payload = valid_payload(provider)
    payload.trigger = None
    payload.output = None
    tree = TreeService(database).create(payload)

    validation = TreeService(database).validate(tree.id)

    assert any(error.code == "trigger_required" for error in validation.errors)
    assert any(error.code == "output_required" for error in validation.errors)


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
    invalid_payload.trigger = None
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
