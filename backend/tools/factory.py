"""Translate stored ToolConnection records into public AgentTree tools."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx
from agenttree.tools import BaseTool
from agenttree.tools.mcp import (
    BaseMCPClient,
    MCPTool,
    MCPToolDefinition,
    StdioMCPClient,
    StreamableHttpMCPClient,
)
from sqlalchemy.orm import Session

from backend.models.tool import ToolConnection
from backend.services.secret_service import SecretService
from backend.tools.http_api import HTTPAPITool


@dataclass(frozen=True)
class BuiltTools:
    tools: tuple[BaseTool, ...]
    sensitive_values: tuple[str, ...] = ()
    mcp_clients: tuple[BaseMCPClient, ...] = ()


class ToolAdapterFactory:
    def __init__(
        self,
        database: Session,
        *,
        http_transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._database = database
        self._http_transport = http_transport

    def credential(self, connection: ToolConnection) -> str | None:
        return (
            SecretService(self._database).reveal(connection.secret_id)
            if connection.secret_id else None
        )

    def build_http(self, connection: ToolConnection) -> HTTPAPITool:
        return HTTPAPITool(
            tool_id=connection.id,
            name=connection.name,
            description=connection.description,
            configuration=connection.config_json or {},
            credential=self.credential(connection),
            transport=self._http_transport,
        )

    def create_mcp_client(self, connection: ToolConnection) -> BaseMCPClient:
        config = connection.config_json or {}
        credential = self.credential(connection)
        timeout = config.get("timeout", 30)
        if connection.transport_type == "stdio":
            env = dict(config.get("env") or {})
            for key, value in tuple(env.items()):
                if "{{secret}}" in value:
                    if credential is None:
                        raise ValueError("MCP stdio environment requires a configured Secret")
                    env[key] = value.replace("{{secret}}", credential)
            return StdioMCPClient(
                server_id=connection.id,
                command=config.get("command", ""),
                args=config.get("args") or (),
                env=env or None,
                cwd=config.get("cwd") or None,
                timeout=timeout,
            )
        if connection.transport_type == "streamable_http":
            headers = dict(config.get("headers") or {})
            for key, value in tuple(headers.items()):
                if "{{secret}}" in value:
                    if credential is None:
                        raise ValueError("MCP HTTP headers require a configured Secret")
                    headers[key] = value.replace("{{secret}}", credential)
            return StreamableHttpMCPClient(
                server_id=connection.id,
                url=config.get("url", ""),
                headers=headers or None,
                timeout=timeout,
            )
        raise ValueError("MCP transport must be stdio or streamable_http")

    @staticmethod
    def definition(record: dict[str, Any]) -> MCPToolDefinition:
        return MCPToolDefinition(
            name=record["name"],
            description=record.get("description", ""),
            input_schema=record.get("input_schema") or {},
            metadata=record.get("metadata") or {},
        )

    def build_runtime_tools(self, connection: ToolConnection) -> BuiltTools:
        credential = self.credential(connection)
        sensitive = (credential,) if credential else ()
        if connection.tool_type == "http_api":
            return BuiltTools(tools=(self.build_http(connection),), sensitive_values=sensitive)
        if connection.tool_type == "mcp":
            client = self.create_mcp_client(connection)
            selected = [
                item for item in (connection.discovered_tools_json or [])
                if item.get("selected") is True
            ]
            tools = tuple(MCPTool(
                client=client,
                definition=self.definition(item),
                name=f"{connection.name}.{item['name']}",
                tool_id=f"mcp:{connection.id}:{item['name']}",
            ) for item in selected)
            return BuiltTools(
                tools=tools,
                sensitive_values=sensitive,
                mcp_clients=(client,),
            )
        raise ValueError("Unsupported Tool type")
