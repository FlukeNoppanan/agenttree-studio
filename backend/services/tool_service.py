"""CRUD, discovery, assignment, and explicit execution for Studio Tools."""

from __future__ import annotations

from datetime import datetime, timezone
import re
from urllib.parse import parse_qsl, urlsplit
from uuid import uuid4

from agenttree import SpecialistAgent
from agenttree.models import ExecutionTrace
from agenttree.tools import ToolBindingRegistry, ToolExecutor, ToolRegistry
from agenttree.tools.mcp import MCPTool, MCPToolLoader
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, selectinload

from backend.core.sanitization import sanitize_value
from backend.models.secret import Secret
from backend.models.tool import ToolAssignment, ToolConnection
from backend.models.tree import AgentConfig, TreeVersion
from backend.schemas.tool import (
    DiscoveredToolRead,
    MCPDiscoveryResponse,
    ToolAssignmentRead,
    ToolAssignmentsResponse,
    ToolAssignmentsUpdate,
    ToolConnectionRead,
    ToolCreate,
    ToolExecuteRequest,
    ToolExecuteResponse,
    ToolTestResponse,
    ToolTraceEventRead,
    ToolUpdate,
)
from backend.services.errors import (
    ResourceConflictError,
    ResourceNotFoundError,
    ServiceError,
    ToolOperationError,
)
from backend.tools.factory import ToolAdapterFactory


_SENSITIVE_NAME = re.compile(r"authorization|api.?key|token|secret|password", re.I)


class ToolService:
    def __init__(
        self,
        database: Session,
        factory: ToolAdapterFactory | None = None,
    ) -> None:
        self._database = database
        self._factory = factory or ToolAdapterFactory(database)

    def _get(self, tool_id: str) -> ToolConnection:
        tool = self._database.scalar(select(ToolConnection).options(
            selectinload(ToolConnection.assignments),
        ).where(ToolConnection.id == tool_id))
        if tool is None:
            raise ResourceNotFoundError("Tool not found")
        return tool

    def _ensure_secret(self, secret_id: str | None) -> None:
        if secret_id and self._database.get(Secret, secret_id) is None:
            raise ServiceError("Tool references a missing Secret")

    def _ensure_unique_name(self, name: str, *, excluding: str | None = None) -> None:
        statement = select(ToolConnection.id).where(func.lower(ToolConnection.name) == name.casefold())
        if excluding:
            statement = statement.where(ToolConnection.id != excluding)
        if self._database.scalar(statement):
            raise ResourceConflictError("A Tool with this name already exists")

    @staticmethod
    def _reject_embedded_secrets(configuration: dict) -> None:
        for section in ("headers", "env", "query"):
            values = configuration.get(section, {})
            if not isinstance(values, dict):
                continue
            for key, value in values.items():
                if _SENSITIVE_NAME.search(str(key)) and value != "{{secret}}" and "{{secret}}" not in str(value):
                    raise ServiceError("Credentials must use a Secret reference and {{secret}} placeholder")
        url = configuration.get("url")
        if isinstance(url, str):
            try:
                query_values = parse_qsl(urlsplit(url).query, keep_blank_values=True)
            except ValueError as error:
                raise ServiceError("Tool URL is invalid") from error
            for key, value in query_values:
                if _SENSITIVE_NAME.search(key) and "{{secret}}" not in value:
                    raise ServiceError("Credentials must use a Secret reference and {{secret}} placeholder")

    def _validate_configuration(self, tool: ToolConnection) -> None:
        self._reject_embedded_secrets(tool.config_json or {})
        try:
            if tool.tool_type == "http_api":
                self._factory.build_http(tool)
            elif tool.tool_type == "mcp":
                self._factory.create_mcp_client(tool)
            else:
                raise ServiceError("Unsupported Tool type")
        except ServiceError:
            raise
        except Exception as error:
            raise ServiceError("Tool configuration is invalid") from error

    @staticmethod
    def _read(tool: ToolConnection) -> ToolConnectionRead:
        return ToolConnectionRead(
            id=tool.id,
            name=tool.name,
            tool_type=tool.tool_type,
            description=tool.description,
            enabled=tool.enabled,
            secret_id=tool.secret_id,
            transport_type=tool.transport_type,
            status=tool.status,
            configuration=sanitize_value(tool.config_json or {}),
            discovered_tools=[DiscoveredToolRead.model_validate(item) for item in (tool.discovered_tools_json or [])],
            assigned_agents_count=len(tool.assignments),
            last_checked_at=tool.last_checked_at,
            last_error=tool.last_error,
            created_at=tool.created_at,
            updated_at=tool.updated_at,
        )

    def list(self) -> list[ToolConnectionRead]:
        tools = self._database.scalars(select(ToolConnection).options(
            selectinload(ToolConnection.assignments),
        ).order_by(ToolConnection.created_at.desc())).all()
        return [self._read(item) for item in tools]

    def get(self, tool_id: str) -> ToolConnectionRead:
        return self._read(self._get(tool_id))

    def create(self, payload: ToolCreate) -> ToolConnectionRead:
        self._ensure_unique_name(payload.name)
        self._ensure_secret(payload.secret_id)
        tool = ToolConnection(
            name=payload.name,
            tool_type=payload.tool_type.value,
            description=payload.description,
            enabled=payload.enabled,
            secret_id=payload.secret_id,
            transport_type=payload.transport_type.value if payload.transport_type else None,
            status="not_configured" if payload.enabled else "disabled",
            config_json=payload.configuration,
            discovered_tools_json=[],
        )
        if tool.tool_type == "mcp" and not tool.transport_type:
            raise ServiceError("MCP transport is required")
        self._database.add(tool)
        self._database.flush()
        self._validate_configuration(tool)
        self._database.commit()
        self._database.refresh(tool)
        return self._read(self._get(tool.id))

    def update(self, tool_id: str, payload: ToolUpdate) -> ToolConnectionRead:
        tool = self._get(tool_id)
        changed = payload.model_fields_set
        if "name" in changed and payload.name is not None:
            self._ensure_unique_name(payload.name, excluding=tool.id)
            tool.name = payload.name
        if "description" in changed and payload.description is not None:
            tool.description = payload.description
        if "enabled" in changed and payload.enabled is not None:
            tool.enabled = payload.enabled
        if "secret_id" in changed:
            self._ensure_secret(payload.secret_id)
            tool.secret_id = payload.secret_id
        if "transport_type" in changed:
            tool.transport_type = payload.transport_type.value if payload.transport_type else None
        if "configuration" in changed and payload.configuration is not None:
            tool.config_json = payload.configuration
        if payload.selected_tools is not None:
            selected = set(payload.selected_tools)
            known = {item.get("name") for item in (tool.discovered_tools_json or [])}
            if not selected <= known:
                raise ServiceError("Selected MCP Tool was not discovered")
            tool.discovered_tools_json = [
                {**item, "selected": item.get("name") in selected}
                for item in (tool.discovered_tools_json or [])
            ]
        if not tool.enabled:
            tool.status = "disabled"
        elif "enabled" in changed and tool.status == "disabled":
            tool.status = "not_configured"
            tool.last_error = None
        elif changed & {"secret_id", "transport_type", "configuration"}:
            tool.status = "not_configured"
            tool.last_error = None
        self._validate_configuration(tool)
        self._database.commit()
        self._database.expire_all()
        return self.get(tool.id)

    def delete(self, tool_id: str) -> None:
        tool = self._get(tool_id)
        self._database.execute(delete(ToolAssignment).where(ToolAssignment.tool_connection_id == tool.id))
        self._database.delete(tool)
        self._database.commit()

    def test(self, tool_id: str) -> ToolTestResponse:
        tool = self._get(tool_id)
        if not tool.enabled:
            raise ResourceConflictError("Disabled Tool cannot be tested")
        try:
            if tool.tool_type == "http_api":
                result = self._execute_core(tool, ToolExecuteRequest(
                    arguments=(tool.config_json or {}).get("test_arguments", {}),
                ))
                if not result.success:
                    raise ToolOperationError(result.error or "HTTP Tool test failed")
            else:
                client = self._factory.create_mcp_client(tool)
                try:
                    client.connect()
                    client.list_tools()
                finally:
                    client.close()
            tool.status = "connected"
            tool.last_error = None
            message = "Tool connection succeeded"
        except Exception as error:
            tool.status = "error"
            tool.last_error = self._safe_error(error, "Tool connection failed")
            message = tool.last_error
        tool.last_checked_at = datetime.now(timezone.utc)
        self._database.commit()
        self._database.expire_all()
        return ToolTestResponse(tool=self.get(tool.id), message=message)

    def discover(self, tool_id: str) -> MCPDiscoveryResponse:
        tool = self._get(tool_id)
        if tool.tool_type != "mcp":
            raise ServiceError("Discovery is available only for MCP connections")
        if not tool.enabled:
            raise ResourceConflictError("Disabled Tool cannot be discovered")
        client = self._factory.create_mcp_client(tool)
        try:
            client.connect()
            discovered = MCPToolLoader(client=client).discover()
            existing = {
                item.get("name"): bool(item.get("selected"))
                for item in (tool.discovered_tools_json or [])
            }
            records = [{
                "name": item.definition.name,
                "description": item.definition.description,
                "input_schema": item.definition.input_schema,
                "metadata": item.definition.metadata,
                "selected": existing.get(item.definition.name, False),
            } for item in discovered]
            tool.discovered_tools_json = sanitize_value(records)
            tool.status = "connected"
            tool.last_error = None
        except Exception as error:
            tool.status = "error"
            tool.last_error = self._safe_error(error, "MCP discovery failed")
            self._database.commit()
            raise ToolOperationError(tool.last_error) from error
        finally:
            try:
                client.close()
            except Exception:
                pass
        tool.last_checked_at = datetime.now(timezone.utc)
        self._database.commit()
        self._database.expire_all()
        read = self.get(tool.id)
        return MCPDiscoveryResponse(tool=read, tools=read.discovered_tools)

    def _mcp_tool(self, connection: ToolConnection, requested: str | None):
        if not requested:
            raise ServiceError("tool_name is required for MCP execution")
        record = next((item for item in (connection.discovered_tools_json or []) if item.get("name") == requested), None)
        if record is None:
            raise ServiceError("MCP Tool was not discovered")
        client = self._factory.create_mcp_client(connection)
        tool = MCPTool(
            client=client,
            definition=self._factory.definition(record),
            name=f"{connection.name}.{requested}",
            tool_id=f"mcp:{connection.id}:{requested}",
        )
        return tool, client

    def _execute_core(self, connection: ToolConnection, payload: ToolExecuteRequest) -> ToolExecuteResponse:
        client = None
        credential = self._factory.credential(connection)
        try:
            if connection.tool_type == "http_api":
                executable = self._factory.build_http(connection)
            else:
                executable, client = self._mcp_tool(connection, payload.tool_name)
                client.connect()
            specialist = SpecialistAgent(
                id=f"studio-tool-test-{uuid4()}", name="Studio Tool Test",
                capabilities=("manual-tool-test",),
            )
            registry = ToolRegistry()
            registry.register(executable)
            bindings = ToolBindingRegistry()
            bindings.assign(specialist.id, executable.id)
            trace = ExecutionTrace(task_id=f"tool-test-{uuid4()}")
            result = ToolExecutor(registry=registry, bindings=bindings).execute(
                specialist=specialist,
                tool_id=executable.id,
                arguments=payload.arguments,
                trace=trace,
            )
            secrets = (credential,) if credential else ()
            safe_result_error = (
                self._safe_error(result.error, "Tool execution failed", secrets)
                if result.error else None
            )
            return ToolExecuteResponse(
                tool_id=result.tool_id,
                success=result.success,
                output=sanitize_value(result.output, secrets),
                error=safe_result_error,
                metadata=sanitize_value(result.metadata, secrets),
                trace=[ToolTraceEventRead(
                    event_type=event.event_type,
                    actor_id=event.actor_id,
                    message=event.message,
                    metadata=sanitize_value(event.metadata, secrets),
                    timestamp=event.timestamp,
                ) for event in trace.events],
            )
        finally:
            if client is not None:
                client.close()

    def execute(self, tool_id: str, payload: ToolExecuteRequest) -> ToolExecuteResponse:
        tool = self._get(tool_id)
        if not tool.enabled:
            raise ResourceConflictError("Disabled Tool cannot execute")
        if tool.status != "connected":
            raise ResourceConflictError("Tool must be connected before execution")
        try:
            return self._execute_core(tool, payload)
        except ServiceError:
            raise
        except Exception as error:
            raise ToolOperationError(self._safe_error(error, "Tool execution failed")) from error

    def assignments(self, tool_id: str) -> ToolAssignmentsResponse:
        self._get(tool_id)
        rows = self._database.scalars(select(ToolAssignment).options(
            selectinload(ToolAssignment.agent_config),
            selectinload(ToolAssignment.tree_version).selectinload(TreeVersion.tree),
        ).where(ToolAssignment.tool_connection_id == tool_id)).all()
        return ToolAssignmentsResponse(assignments=[ToolAssignmentRead(
            agent_id=item.agent_config.id,
            agent_name=item.agent_config.name,
            tree_id=item.tree_version.tree_id,
            tree_name=item.tree_version.tree.name,
        ) for item in rows])

    def replace_assignments(
        self, tool_id: str, payload: ToolAssignmentsUpdate,
    ) -> ToolAssignmentsResponse:
        tool = self._get(tool_id)
        if payload.agent_ids and (not tool.enabled or tool.status != "connected"):
            raise ResourceConflictError("Only connected Tools can be assigned")
        if payload.agent_ids and tool.tool_type == "mcp" and not any(
            item.get("selected") is True for item in (tool.discovered_tools_json or [])
        ):
            raise ResourceConflictError("Select at least one discovered MCP Tool before assigning Agents")
        agent_ids = list(dict.fromkeys(payload.agent_ids))
        agents = list(self._database.scalars(select(AgentConfig).where(AgentConfig.id.in_(agent_ids))).all()) if agent_ids else []
        if len(agents) != len(agent_ids):
            raise ServiceError("Assignment references a missing Agent")
        if any(item.agent_type != "specialist" for item in agents):
            raise ServiceError("Core Tool bindings support Specialist Agents only")
        self._database.execute(delete(ToolAssignment).where(ToolAssignment.tool_connection_id == tool.id))
        for agent in agents:
            self._database.add(ToolAssignment(
                tree_version_id=agent.tree_version_id,
                agent_config_id=agent.id,
                tool_connection_id=tool.id,
            ))
        self._database.commit()
        return self.assignments(tool.id)

    @staticmethod
    def _safe_error(
        error: Exception | str,
        fallback: str,
        sensitive_values: tuple[str, ...] = (),
    ) -> str:
        text = str(sanitize_value(str(error), sensitive_values))
        if not text or len(text) > 240:
            return fallback
        if any(token in text.casefold() for token in (
            "authorization", "bearer ", "api_key", "password=", "token", "secret",
        )):
            return fallback
        return text
