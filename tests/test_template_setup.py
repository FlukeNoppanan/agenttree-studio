"""Template onboarding snapshots, bindings, readiness, and Tool resolution."""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.core.authz import required_access
from backend.core import authz
from backend.db.session import get_db
from backend.models.auth import User
from backend.models.provider import ProviderConnection, ProviderModel
from backend.models.template import TreeTemplate
from backend.models.tool import ToolConnection
from backend.schemas.template import (
    AgentModelBindingUpdate,
    TemplateMetadataCreate,
    TemplateRequirementState,
    TemplateToolRequirement,
    ToolPackageSetupRequest,
    upgrade_template_definition,
)
from backend.schemas.tree import TreeDraftPayload
from backend.services.errors import ServiceError
from backend.services.template_setup_service import TemplateSetupService
from backend.services.template_service import TemplateService
from backend.services.template_requirements import catalog_key_for_tool, resolve_requirements
from backend.services.tree_service import TreeService
from backend.services.auth_service import AuthService
from backend.main import app


def _user(database, username="owner"):
    user = User(username=username, username_key=username, password_hash="unused", is_admin=True)
    database.add(user)
    database.commit()
    return user


def _provider(database, *, status="connected", model_status="qualified", model_id="gemma4:e4b"):
    provider = ProviderConnection(name=f"Local Ollama {uuid4().hex[:4]}", provider_type="ollama",
                                  base_url="http://127.0.0.1:11434", status=status)
    database.add(provider)
    database.flush()
    model = ProviderModel(
        provider_connection_id=provider.id, model_id=model_id,
        display_name=model_id, is_available=model_status == "qualified",
        generation_candidate=model_status == "qualified", qualification_status=model_status,
    )
    database.add(model)
    database.commit()
    return provider, model


def test_schema_v1_user_templates_upgrade_and_instance_snapshot_survives_source_delete(database):
    owner = _user(database)
    legacy = {
        "schema_version": 1,
        "agents": [
            {"key": "root", "agent_type": "root", "name": "Coordinator"},
            {"key": "manager", "agent_type": "manager", "name": "Manager", "parent_key": "root"},
            {"key": "docs", "agent_type": "specialist", "name": "Documents", "parent_key": "manager"},
        ],
        "suggested_tools": [{"name": "Monitoring or Incident API", "tool_type": "http_api", "description": "Incident status"}],
    }
    row = TreeTemplate(
        id="legacy-template", name="Legacy", description="Old format", category="operations",
        template_type="user", definition_json=legacy, created_by=owner.id,
    )
    database.add(row)
    database.commit()

    read = TemplateService(database).get(row.id, owner)
    assert read.definition.schema_version == 2
    assert [item.role for item in read.definition.agents] == ["Coordinator", "Workstream Manager", "Domain Specialist"]
    assert read.definition.tool_requirements[0].catalog_key == "monitoring-observability"
    assert read.definition.tool_requirements[0].requirement == "recommended"

    tree = TemplateService(database).instantiate(row.id, owner)
    snapshot = TreeService(database).get_model(tree.id).current_version.template_instance_json
    assert snapshot["definition"]["schema_version"] == 2
    database.delete(row)
    database.commit()
    setup = TemplateSetupService(database).get(tree.id, owner)
    assert setup.definition.agents[0].name == "Coordinator"
    assert setup.warnings == []


def test_default_model_is_applied_only_by_explicit_call_and_only_qualified_models_are_offered(database):
    owner = _user(database)
    tree = TemplateService(database).instantiate("builtin-general-analysis", owner)
    qualified, qualified_model = _provider(database, model_id="gemma4:e4b")
    disconnected, _ = _provider(database, status="error", model_id="hidden:1b")
    unqualified, _ = _provider(database, model_status="unavailable", model_id="unverified:1b")
    service = TemplateSetupService(database)

    before = service.get(tree.id, owner)
    assert {item.id for item in before.providers} == {qualified.id, unqualified.id}
    assert next(item for item in before.providers if item.id == qualified.id).models[0].model_id == "gemma4:e4b"
    assert next(item for item in before.providers if item.id == unqualified.id).models == []
    assert all(agent.agent.provider_connection_id is None for agent in before.agents)

    root = next(item.agent for item in before.agents if item.agent.agent_type == "root")
    service.bind_agent(tree.id, root.id, AgentModelBindingUpdate(
        provider_connection_id=qualified.id, model_id=qualified_model.model_id,
    ), owner)
    partially_bound = service.get(tree.id, owner)
    assert sum(bool(item.agent.model_id) for item in partially_bound.agents) == 1

    applied = service.apply_default(tree.id, AgentModelBindingUpdate(
        provider_connection_id=qualified.id, model_id=qualified_model.model_id,
    ), owner)
    assert all(item.agent.provider_connection_id == qualified.id for item in applied.agents)
    assert all(item.agent.model_id == qualified_model.model_id for item in applied.agents)
    with pytest.raises(ServiceError, match="connected Provider"):
        service.apply_default(tree.id, AgentModelBindingUpdate(
            provider_connection_id=disconnected.id, model_id="hidden:1b",
        ), owner)
    with pytest.raises(ServiceError, match="verified model"):
        service.apply_default(tree.id, AgentModelBindingUpdate(
            provider_connection_id=unqualified.id, model_id="unverified:1b",
        ), owner)


def test_ready_required_tool_blocks_readiness_but_recommendations_do_not_and_add_is_tree_scoped(database):
    owner = _user(database)
    tree = TemplateService(database).instantiate("builtin-general-analysis", owner)
    provider, model = _provider(database)
    setup = TemplateSetupService(database)
    ready = setup.apply_default(tree.id, AgentModelBindingUpdate(
        provider_connection_id=provider.id, model_id=model.model_id,
    ), owner)
    initial_required = next(item for item in ready.tool_requirements if item.requirement == "required")
    optional_http = next(item for item in ready.tool_requirements if item.catalog_key == "web-api-request")
    assert initial_required.state is TemplateRequirementState.AVAILABLE_TO_ADD
    assert optional_http.state is TemplateRequirementState.NEEDS_CONFIGURATION
    assert ready.readiness.required_tools_ready == 0
    assert not ready.readiness.ready

    resolved = setup.resolve_all_required(tree.id, owner)
    artifact_requirement = next(item for item in resolved.tool_requirements if item.requirement == "required")
    assert artifact_requirement.state is TemplateRequirementState.READY
    assert resolved.readiness.required_tools_ready == resolved.readiness.required_tools_total == 1
    assert resolved.readiness.ready  # The unconfigured recommended HTTP package is non-blocking.
    assert resolved.tree.status == "draft"
    assert len(resolved.tree.version.tool_assignments) == 1
    assert resolved.tree.version.tool_assignments[0].agent_config_id == artifact_requirement.agent_id
    artifact = database.get(ToolConnection, artifact_requirement.tool_id)
    assert artifact and artifact.enabled and artifact.status == "connected"
    assert artifact.config_json == {}

    other = TemplateService(database).instantiate("builtin-general-analysis", owner)
    assert TreeService(database).get(other.id).version.tool_assignments == []


def test_requirement_states_cover_missing_coming_soon_and_unhealthy_connections(database):
    owner = _user(database)
    tree = TemplateService(database).instantiate("builtin-general-analysis", owner)
    version = TreeService(database).get_model(tree.id).current_version
    snapshot = version.template_instance_json
    definition = upgrade_template_definition(snapshot["definition"])
    extra = [
        TemplateToolRequirement(id="future", catalog_key="database-access", requirement="required", agent_ref="analyst"),
        TemplateToolRequirement(id="unknown", catalog_key="unmapped-custom-tool", requirement="recommended"),
    ]
    definition = definition.model_copy(update={"tool_requirements": definition.tool_requirements + extra})
    assigned_agent = snapshot["agent_ids"]["analyst"]
    db_tool = ToolConnection(name="Unavailable DB", tool_type="http_api", enabled=False, status="error",
                             config_json={"catalog_package_id": "database-access"})
    database.add(db_tool)
    database.commit()

    statuses = {item.id: item for item in resolve_requirements(database, version, definition, snapshot["agent_ids"])}
    assert statuses["future"].state is TemplateRequirementState.COMING_SOON
    assert statuses["unknown"].state is TemplateRequirementState.MISSING
    assert statuses["external-research"].state is TemplateRequirementState.NEEDS_CONFIGURATION
    assert statuses["final-artifact"].state is TemplateRequirementState.AVAILABLE_TO_ADD
    assert catalog_key_for_tool(db_tool) == "database-access"
    assert assigned_agent


def test_mcp_requirement_discovers_then_assigns_only_user_selected_tools(database):
    owner = _user(database)
    tree = TemplateService(database).instantiate("builtin-general-analysis", owner)
    version = TreeService(database).get_model(tree.id).current_version
    snapshot = dict(version.template_instance_json)
    definition = upgrade_template_definition(snapshot["definition"])
    requirement = TemplateToolRequirement(
        id="mcp-research", catalog_key="generic-mcp-http", requirement="required",
        agent_ref="researcher", reason="Allow the Research Specialist to use this server.",
    )
    definition = definition.model_copy(update={"tool_requirements": definition.tool_requirements + [requirement]})
    snapshot["definition"] = definition.model_dump(mode="json")
    version.template_instance_json = snapshot
    tool = ToolConnection(
        name="Research MCP", tool_type="mcp", transport_type="streamable_http", enabled=True,
        status="connected", config_json={"catalog_package_id": "generic-mcp-http", "url": "https://mcp.example.test/mcp"},
        discovered_tools_json=[{"name": "search", "description": "Search sources", "input_schema": {"type": "object"}, "selected": False}],
    )
    database.add(tool)
    database.commit()
    service = TemplateSetupService(database)
    before = service.get(tree.id, owner)
    status = next(item for item in before.tool_requirements if item.id == "mcp-research")
    assert status.state is TemplateRequirementState.NEEDS_CONFIGURATION
    assert status.discovered_tools[0].name == "search"
    assert before.tree.version.tool_assignments == []

    chosen = service.resolve_requirement(
        tree.id, "mcp-research", setup=None, agent_id=None,
        selected_tools=None, user=owner,
    )
    assert chosen.tree.version.tool_assignments == []
    resolved = service.resolve_requirement(
        tree.id, "mcp-research", setup=ToolPackageSetupRequest(), agent_id=None,
        selected_tools=["search"], user=owner,
    )
    after = next(item for item in resolved.tool_requirements if item.id == "mcp-research")
    assert after.state is TemplateRequirementState.READY
    assert resolved.tree.version.tool_assignments[0].tool_connection_id == tool.id
    assert resolved.tree.version.tool_assignments[0].agent_config_id == snapshot["agent_ids"]["researcher"]
    assert database.get(ToolConnection, tool.id).discovered_tools_json[0]["selected"] is True


def test_custom_unknown_tools_are_not_guessed_into_templates_and_reported(database):
    owner = _user(database)
    tree = TreeService(database).create(TreeDraftPayload(
        name="Custom", agents=[{"agent_type": "root", "name": "Root", "capabilities": ["review"]}],
    ))
    custom = ToolConnection(
        name="Private Runner", tool_type="custom", enabled=True, status="connected",
        config_json={"catalog_package_id": "private-runner-v9", "command": "local-private-command"},
    )
    database.add(custom)
    database.commit()
    from backend.models.tool import ToolAssignment
    version = TreeService(database).get_model(tree.id).current_version
    agent = version.agents[0]
    version.template_instance_json = {
        "schema_version": 1,
        "definition": {
            "schema_version": 2,
            "agents": [{"key": "agent_1", "agent_type": "root", "name": "Root", "capabilities": ["review"]}],
            "tool_requirements": [{"id": "private-req", "catalog_key": "private-runner-v9", "requirement": "required", "agent_ref": "agent_1"}],
        },
        "agent_ids": {"agent_1": agent.id},
    }
    version.tool_assignments.append(ToolAssignment(
        tree_version_id=version.id, agent_config_id=agent.id, tool_connection_id=custom.id,
    ))
    database.commit()

    saved = TemplateService(database).create_from_tree(
        tree.id, TemplateMetadataCreate(name="Portable"), owner,
    )
    assert saved.definition.tool_requirements == []
    assert len(saved.definition.metadata["portable_tool_warnings"]) == 2
    assert "local-private-command" not in str(saved.model_dump(mode="json"))


def test_template_setup_api_permissions_keep_tool_creation_separate():
    assert required_access("/api/trees/tree-1/template-setup", "GET") == ("manage_trees_agents", None)
    assert required_access("/api/trees/tree-1/template-setup/apply-default", "POST") == ("manage_trees_agents", None)
    assert required_access("/api/tool-catalog/artifact-output/resolve-requirement", "POST") == ("manage_tools_mcp", None)
    assert required_access("/api/tool-catalog/resolve-required", "POST") == ("manage_tools_mcp", None)


def test_v1_unknown_suggestion_becomes_visible_missing_recommendation():
    upgraded = upgrade_template_definition({
        "schema_version": 1,
        "agents": [{"key": "root", "agent_type": "root", "name": "Root"}],
        "suggested_tools": [{"name": "Private custom connector", "tool_type": "mcp"}],
    })
    assert upgraded.schema_version == 2
    assert upgraded.tool_requirements == []
    assert "Private custom connector" in upgraded.metadata["portable_tool_warnings"][0]


def test_template_setup_http_flow_returns_models_and_finishes_after_required_tool_resolution(database_factory, monkeypatch):
    monkeypatch.setattr(authz, "SessionLocal", database_factory)

    def db_override():
        with database_factory() as database:
            yield database

    app.dependency_overrides[get_db] = db_override
    with database_factory() as database:
        AuthService(database).bootstrap("SetupAdmin", "strong-template-setup-password-2026")
        user = database.scalar(select(User).where(User.is_primary_admin.is_(True)))
        provider, model = _provider(database)
        tree = TemplateService(database).instantiate("builtin-general-analysis", user)
        provider_id, model_id, tree_id = provider.id, model.model_id, tree.id
    client = TestClient(app)
    try:
        assert client.post("/api/auth/login", json={
            "username": "setupadmin", "password": "strong-template-setup-password-2026",
        }).status_code == 200
        setup_response = client.get(f"/api/trees/{tree_id}/template-setup")
        assert setup_response.status_code == 200, setup_response.text
        setup = setup_response.json()
        assert setup["providers"][0]["id"] == provider_id
        assert setup["providers"][0]["models"][0]["model_id"] == "gemma4:e4b"

        applied = client.post(f"/api/trees/{tree_id}/template-setup/apply-default", json={
            "provider_connection_id": provider_id, "model_id": model_id,
        })
        assert applied.status_code == 200, applied.text
        assert all(item["agent"]["model_id"] == model.model_id for item in applied.json()["agents"])

        resolved = client.post("/api/tool-catalog/resolve-required", json={"tree_id": tree_id})
        assert resolved.status_code == 200, resolved.text
        result = resolved.json()
        assert result["readiness"]["ready"] is True
        assert result["readiness"]["required_tools_ready"] == result["readiness"]["required_tools_total"] == 1
        assert len(result["tree"]["version"]["tool_assignments"]) == 1
        assert result["tree"]["version"]["tool_assignments"][0]["agent_config_id"] == next(
            item["agent_id"] for item in result["tool_requirements"] if item["requirement"] == "required"
        )
        validated = client.post(f"/api/trees/{tree_id}/validate?mark_ready=true")
        assert validated.status_code == 200 and validated.json()["valid"] is True, validated.text
        assert client.get(f"/api/trees/{tree_id}").json()["status"] == "ready"
    finally:
        client.close()
        app.dependency_overrides.clear()
