"""Executable HTTP/MCP Tools, assignments, and RuntimeBuilder integration."""

import json

import httpx
import pytest
from agenttree import SpecialistAgent
from agenttree.providers import MockProvider, ProviderConfig
from agenttree.tools.mcp import BaseMCPClient, MCPCallResult, MCPToolDefinition
from sqlalchemy import create_engine, func, inspect, select, text

from backend.db.migrations import apply_local_migrations
from backend.models.tool import ToolAssignment
from backend.schemas.secret import SecretCreate
from backend.schemas.tool import (
    ToolAssignmentsUpdate,
    ToolCreate,
    ToolExecuteRequest,
    ToolUpdate,
)
from backend.services.errors import ServiceError
from backend.services.runtime_builder import RuntimeBuilder
from backend.services.secret_service import SecretService
from backend.services.tool_service import ToolService
from backend.services.tree_service import TreeService
from backend.tools.factory import ToolAdapterFactory
from tests.test_trees import connected_provider, valid_payload


class FakeMCPClient(BaseMCPClient):
    def __init__(self, *, fail: bool = False) -> None:
        super().__init__(server_id="fake-server")
        self.connected = False
        self.fail = fail
        self.definitions = (
            MCPToolDefinition(
                name="get_alerts",
                description="Return active alerts",
                input_schema={
                    "type": "object",
                    "properties": {"limit": {"type": "integer", "description": "Maximum alerts"}},
                    "required": ["limit"],
                },
                metadata={"read_only": True},
            ),
        )

    def connect(self) -> None:
        if self.fail:
            raise RuntimeError("private token detail")
        self.connected = True

    def list_tools(self) -> tuple[MCPToolDefinition, ...]:
        if not self.connected:
            raise RuntimeError("not connected")
        return self.definitions

    def call_tool(self, name, arguments) -> MCPCallResult:
        if not self.connected:
            raise RuntimeError("not connected")
        return MCPCallResult(success=True, output={"name": name, "arguments": dict(arguments)})

    def close(self) -> None:
        self.connected = False


class TestToolFactory(ToolAdapterFactory):
    __test__ = False

    def __init__(self, database, *, transport=None, mcp_client=None) -> None:
        super().__init__(database, http_transport=transport)
        self.mcp_client = mcp_client

    def create_mcp_client(self, connection):
        return self.mcp_client or super().create_mcp_client(connection)


def secret(database):
    return SecretService(database).create(SecretCreate(
        name="Tool token", secret_type="api_key", value="private-tool-token",
    ))


def http_payload(secret_id=None) -> ToolCreate:
    return ToolCreate.model_validate({
        "name": "Get Server Status",
        "tool_type": "http_api",
        "description": "Fetch one server status.",
        "secret_id": secret_id,
        "configuration": {
            "method": "GET",
            "url": "https://api.example.test/servers/{server_id}",
            "headers": {"Authorization": "Bearer {{secret}}"} if secret_id else {},
            "query": {"detail": "{detail}"},
            "input_schema": {
                "type": "object",
                "properties": {
                    "server_id": {"type": "string"},
                    "detail": {"type": "string"},
                },
                "required": ["server_id", "detail"],
            },
            "output_handling": "json",
            "timeout": 5,
            "test_arguments": {"server_id": "srv-1", "detail": "full"},
        },
    })


def successful_transport(record: dict):
    def handler(request: httpx.Request) -> httpx.Response:
        record["url"] = str(request.url)
        record["authorization"] = request.headers.get("authorization")
        return httpx.Response(200, json={"status": "ok"}, request=request)
    return httpx.MockTransport(handler)


def test_create_test_and_execute_http_tool_with_safe_secret(database) -> None:
    stored_secret = secret(database)
    record: dict = {}
    factory = TestToolFactory(database, transport=successful_transport(record))
    service = ToolService(database, factory)

    created = service.create(http_payload(stored_secret.id))
    tested = service.test(created.id)
    result = service.execute(created.id, ToolExecuteRequest(
        arguments={"server_id": "srv 2", "detail": "short"},
    ))

    assert created.status.value == "not_configured"
    assert tested.tool.status.value == "connected"
    assert result.success is True and result.output == {"status": "ok"}
    assert [event.event_type for event in result.trace] == [
        "orchestration.tool_execution_started",
        "orchestration.tool_execution_completed",
    ]
    assert record["authorization"] == "Bearer private-tool-token"
    assert "/servers/srv%202" in record["url"]
    assert "detail=short" in record["url"]
    serialized = json.dumps(service.get(created.id).model_dump(mode="json"))
    assert "private-tool-token" not in serialized
    assert "{{secret}}" in serialized
    with pytest.raises(ServiceError, match="Tool connection"):
        SecretService(database).delete(stored_secret.id)


def test_http_failures_are_generic_and_credentials_never_serialize(database) -> None:
    stored_secret = secret(database)

    def fail(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("private-tool-token connection refused", request=request)

    service = ToolService(database, TestToolFactory(database, transport=httpx.MockTransport(fail)))
    created = service.create(http_payload(stored_secret.id))
    tested = service.test(created.id)

    assert tested.tool.status.value == "error"
    assert tested.tool.last_error == "HTTP Tool request failed"
    assert "private-tool-token" not in json.dumps(tested.model_dump(mode="json"))


def test_embedded_query_credentials_are_rejected(database) -> None:
    payload = http_payload().model_copy(deep=True)
    payload.configuration["query"] = {"api_key": "raw-key"}
    with pytest.raises(ServiceError, match="Secret reference"):
        ToolService(database).create(payload)

    stored_secret = secret(database)
    safe_payload = http_payload(stored_secret.id).model_copy(deep=True)
    safe_payload.name = "Query-authenticated status"
    safe_payload.configuration["query"]["api_key"] = "{{secret}}"
    record: dict = {}
    service = ToolService(database, TestToolFactory(database, transport=successful_transport(record)))
    tool = service.create(safe_payload)
    assert service.test(tool.id).tool.status.value == "connected"
    assert "api_key=private-tool-token" in record["url"]
    assert "private-tool-token" not in json.dumps(service.get(tool.id).model_dump(mode="json"))


def test_disabled_tool_can_clear_assignments_and_reenable_safely(database) -> None:
    service = ToolService(database, TestToolFactory(database, transport=successful_transport({})))
    tool = service.create(http_payload())
    service.test(tool.id)

    disabled = service.update(tool.id, ToolUpdate(enabled=False))
    assert disabled.status.value == "disabled"
    assert service.replace_assignments(tool.id, ToolAssignmentsUpdate(agent_ids=[])).assignments == []
    reenabled = service.update(tool.id, ToolUpdate(enabled=True))
    assert reenabled.status.value == "not_configured"


def test_create_test_discover_select_and_execute_mcp_tool(database) -> None:
    client = FakeMCPClient()
    service = ToolService(database, TestToolFactory(database, mcp_client=client))
    created = service.create(ToolCreate.model_validate({
        "name": "Wazuh MCP",
        "tool_type": "mcp",
        "transport_type": "stdio",
        "configuration": {"command": "wazuh-mcp", "args": [], "timeout": 5},
    }))

    assert service.test(created.id).tool.status.value == "connected"
    discovery = service.discover(created.id)
    assert discovery.tools[0].name == "get_alerts"
    assert discovery.tools[0].description == "Return active alerts"
    assert discovery.tools[0].input_schema["required"] == ["limit"]

    provider = connected_provider(database)
    tree = TreeService(database).create(valid_payload(provider))
    specialist = next(item for item in tree.version.agents if item.agent_type == "specialist")
    with pytest.raises(ServiceError, match="Select at least one"):
        service.replace_assignments(created.id, ToolAssignmentsUpdate(agent_ids=[specialist.id]))

    selected = service.update(created.id, ToolUpdate(selected_tools=["get_alerts"]))
    assert selected.discovered_tools[0].selected is True

    result = service.execute(created.id, ToolExecuteRequest(
        tool_name="get_alerts", arguments={"limit": 3},
    ))
    assert result.success is True
    assert result.output["arguments"] == {"limit": 3}
    assert result.tool_id.endswith(":get_alerts")

    service.replace_assignments(created.id, ToolAssignmentsUpdate(agent_ids=[specialist.id]))

    def provider_factory(connection, model, credential, runtime_name):
        return MockProvider(ProviderConfig(provider_name=runtime_name, model=model))

    bundle = RuntimeBuilder(
        database, provider_factory=provider_factory,
        tool_factory=TestToolFactory(database, mcp_client=client),
    ).build(tree.id)
    assert client.connected is True
    runtime_result = bundle.tool_executor.execute(
        specialist=bundle.agents_by_id[specialist.id],
        tool_name="Wazuh MCP.get_alerts",
        arguments={"limit": 2},
    )
    assert runtime_result.success is True
    for runtime_client in bundle.mcp_clients:
        runtime_client.close()


def test_local_tool_migration_preserves_existing_rows(tmp_path) -> None:
    engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    with engine.begin() as connection:
        connection.execute(text("""
            CREATE TABLE secrets (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(120) NOT NULL,
                secret_type VARCHAR(50) NOT NULL,
                encrypted_value TEXT NOT NULL,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL
            )
        """))
        connection.execute(text("""
            CREATE TABLE tool_connections (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(160) NOT NULL,
                tool_type VARCHAR(40) NOT NULL,
                description TEXT NOT NULL,
                status VARCHAR(30) NOT NULL,
                config_json JSON,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL
            )
        """))
        connection.execute(text("""
            INSERT INTO tool_connections
                (id, name, tool_type, description, status, created_at, updated_at)
            VALUES
                ('legacy', 'Legacy Tool', 'function', '', 'available', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """))

    apply_local_migrations(engine)
    apply_local_migrations(engine)

    columns = {item["name"] for item in inspect(engine).get_columns("tool_connections")}
    with engine.connect() as connection:
        row = connection.execute(text(
            "SELECT name, status, enabled FROM tool_connections WHERE id = 'legacy'",
        )).one()
    assert {"enabled", "secret_id", "transport_type", "discovered_tools_json", "last_checked_at", "last_error"} <= columns
    assert row == ("Legacy Tool", "not_configured", 1)


def test_mcp_connection_failure_is_sanitized(database) -> None:
    service = ToolService(database, TestToolFactory(database, mcp_client=FakeMCPClient(fail=True)))
    created = service.create(ToolCreate.model_validate({
        "name": "Broken MCP", "tool_type": "mcp", "transport_type": "stdio",
        "configuration": {"command": "broken"},
    }))
    result = service.test(created.id)
    assert result.tool.status.value == "error"
    assert "token" not in result.tool.last_error.casefold()


def test_assignments_are_specialist_only_and_delete_cleans_them(database) -> None:
    provider = connected_provider(database)
    tree = TreeService(database).create(valid_payload(provider))
    specialist = next(item for item in tree.version.agents if item.agent_type == "specialist")
    manager = next(item for item in tree.version.agents if item.agent_type == "manager")
    service = ToolService(database, TestToolFactory(database, transport=successful_transport({})))
    tool = service.create(http_payload())
    service.test(tool.id)

    assigned = service.replace_assignments(tool.id, ToolAssignmentsUpdate(agent_ids=[specialist.id]))
    assert assigned.assignments[0].agent_id == specialist.id
    with pytest.raises(ServiceError, match="Specialist"):
        service.replace_assignments(tool.id, ToolAssignmentsUpdate(agent_ids=[manager.id]))

    service.delete(tool.id)
    assert database.scalar(select(func.count()).select_from(ToolAssignment)) == 0


def test_runtime_builder_registers_tools_preserves_bindings_and_enforces_authorization(database) -> None:
    provider = connected_provider(database)
    tree = TreeService(database).create(valid_payload(provider))
    specialist_config = next(item for item in tree.version.agents if item.agent_type == "specialist")
    factory = TestToolFactory(database, transport=successful_transport({}))
    tool_service = ToolService(database, factory)
    tool = tool_service.create(http_payload())
    tool_service.test(tool.id)
    tool_service.replace_assignments(tool.id, ToolAssignmentsUpdate(agent_ids=[specialist_config.id]))

    def provider_factory(connection, model, credential, runtime_name):
        return MockProvider(ProviderConfig(provider_name=runtime_name, model=model))

    bundle = RuntimeBuilder(
        database,
        provider_factory=provider_factory,
        tool_factory=factory,
    ).build(tree.id)

    assert bundle.runtime.tools[0].id == tool.id
    assert bundle.tool_bindings.tool_ids_for(specialist_config.id) == (tool.id,)
    result = bundle.tool_executor.execute(
        specialist=bundle.agents_by_id[specialist_config.id],
        tool_id=tool.id,
        arguments={"server_id": "srv", "detail": "full"},
    )
    assert result.success is True
    with pytest.raises(PermissionError):
        bundle.tool_executor.execute(
            specialist=SpecialistAgent(name="Unauthorized"),
            tool_id=tool.id,
            arguments={"server_id": "srv", "detail": "full"},
        )
