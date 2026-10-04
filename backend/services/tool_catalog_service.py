"""Allow-listed generators for source-controlled Tool Catalog packages."""

from __future__ import annotations

from uuid import uuid4

from sqlalchemy.orm import Session

from backend.models.secret import Secret
from backend.models.tool import ToolConnection
from backend.schemas.template import ToolCatalogTestResponse, ToolPackageStatus, ToolPackageSetupRequest
from backend.schemas.tool import ToolCreate, ToolExecuteRequest, ToolTestResponse, ToolType, MCPTransportType
from backend.services.errors import ResourceNotFoundError, ServiceError, ToolOperationError
from backend.services.secret_service import SecretService
from backend.services.tool_service import ToolService
from backend.tools.catalog import TOOL_PACKAGES, package_read
from backend.tools.factory import ToolAdapterFactory


class ToolCatalogService:
    def __init__(self, database: Session, factory: ToolAdapterFactory | None = None) -> None:
        self._database = database
        self._factory = factory or ToolAdapterFactory(database)

    def list(self):
        return [package_read(item) for item in TOOL_PACKAGES]

    def get(self, package_id: str):
        item = next((item for item in TOOL_PACKAGES if item["id"] == package_id), None)
        if item is None:
            raise ResourceNotFoundError("Tool package not found")
        return package_read(item)

    @staticmethod
    def _package(package_id: str) -> dict:
        item = next((item for item in TOOL_PACKAGES if item["id"] == package_id), None)
        if item is None:
            raise ResourceNotFoundError("Tool package not found")
        if item["status"] == ToolPackageStatus.COMING_SOON:
            raise ServiceError("This Tool package is coming soon")
        if item["status"] == ToolPackageStatus.CATALOG_ADDABLE:
            raise ServiceError("Configure this installed MCP server through the existing custom Tool workflow; no software is installed by the Catalog")
        return item

    def _generated(self, package_id: str, payload: ToolPackageSetupRequest) -> ToolCreate:
        package = self._package(package_id)
        package_name = package["name"]
        name = (payload.name or package_name).strip()
        description = payload.description if payload.description is not None else package["description"]
        secret_id = payload.secret_id
        if secret_id and self._database.get(Secret, secret_id) is None:
            raise ResourceNotFoundError("Secret not found")

        if package_id == "web-api-request":
            if not payload.url:
                raise ServiceError("An HTTP or HTTPS URL is required")
            if payload.auth_mode != "none" and not secret_id:
                raise ServiceError("Select a Studio Secret for authentication")
            if payload.auth_mode == "none" and secret_id:
                raise ServiceError("Select an authentication mode or remove the unused Secret")
            headers = {}
            if payload.auth_mode == "bearer":
                headers["Authorization"] = "Bearer {{secret}}"
            elif payload.auth_mode == "api_key":
                headers["X-API-Key"] = "{{secret}}"
            configuration = {
                "url": payload.url, "method": payload.method, "headers": headers,
                "input_schema": payload.request_schema, "test_arguments": payload.test_arguments,
                "timeout": payload.timeout, "catalog_package_id": package_id,
            }
            tool_type, transport = ToolType.HTTP_API, None
        elif package_id == "github-account-api":
            if not secret_id:
                raise ServiceError("A GitHub token saved as a Studio Secret is required")
            configuration = {
                "url": "https://api.github.com/user", "method": "GET",
                "headers": {"Authorization": "Bearer {{secret}}", "Accept": "application/vnd.github+json"},
                "input_schema": {"type": "object", "properties": {}}, "test_arguments": {},
                "timeout": payload.timeout, "catalog_package_id": package_id,
            }
            tool_type, transport = ToolType.HTTP_API, None
        elif package_id == "generic-mcp-http":
            if not payload.url:
                raise ServiceError("An MCP Streamable HTTP URL is required")
            if payload.method != "GET" or payload.request_schema != {"type": "object", "properties": {}} or payload.test_arguments:
                raise ServiceError("MCP setup accepts only its URL, auth mode, Secret, name, and description")
            if payload.auth_mode not in {"none", "bearer"}:
                raise ServiceError("MCP Streamable HTTP supports no auth or bearer auth")
            if payload.auth_mode == "bearer" and not secret_id:
                raise ServiceError("Select a Studio Secret for bearer authentication")
            if payload.auth_mode == "none" and secret_id:
                raise ServiceError("Select bearer authentication or remove the unused Secret")
            configuration = {
                "url": payload.url,
                "headers": {"Authorization": "Bearer {{secret}}"} if payload.auth_mode == "bearer" else {},
                "timeout": payload.timeout, "catalog_package_id": package_id,
            }
            tool_type, transport = ToolType.MCP, MCPTransportType.STREAMABLE_HTTP
        elif package_id == "artifact-output":
            if (secret_id or payload.url or payload.method != "GET" or payload.auth_mode != "none"
                    or payload.request_schema != {"type": "object", "properties": {}}
                    or payload.test_arguments or payload.timeout != 30):
                raise ServiceError("Artifact Output does not accept connection configuration")
            configuration = {}
            tool_type, transport = ToolType.ARTIFACT, None
        else:
            raise ServiceError("Tool package has no supported configuration generator")

        if package_id == "github-account-api" and (
            payload.url is not None or payload.method != "GET" or payload.test_arguments
            or payload.request_schema != {"type": "object", "properties": {}}
            or payload.auth_mode not in {"none", "bearer"}
        ):
            raise ServiceError("GitHub setup does not accept custom endpoints or request configuration")
        return ToolCreate(
            name=name, description=description, tool_type=tool_type, enabled=True,
            secret_id=secret_id, transport_type=transport, configuration=configuration,
        )

    def test(self, package_id: str, payload: ToolPackageSetupRequest) -> ToolCatalogTestResponse:
        create = self._generated(package_id, payload)
        transient = ToolConnection(
            id=str(uuid4()), name=create.name, tool_type=create.tool_type.value,
            description=create.description, enabled=True, secret_id=create.secret_id,
            transport_type=create.transport_type.value if create.transport_type else None,
            status="not_configured", config_json=create.configuration,
            discovered_tools_json=[],
        )
        try:
            ToolService(self._database, self._factory)._validate_configuration(transient)
            if create.tool_type == ToolType.HTTP_API:
                result = ToolService(self._database, self._factory)._execute_core(
                    transient, ToolExecuteRequest(arguments=create.configuration.get("test_arguments", {})),
                )
                if not result.success:
                    return ToolCatalogTestResponse(success=False, message=result.error or "HTTP request failed")
            elif create.tool_type == ToolType.MCP:
                client = self._factory.create_mcp_client(transient)
                try:
                    client.connect()
                    client.list_tools()
                finally:
                    client.close()
            else:
                # The supported artifact adapter is local and needs no remote
                # handshake; constructing it verifies the same runtime path.
                self._factory.build_runtime_tools(transient)
            return ToolCatalogTestResponse(success=True, message="Connection test succeeded")
        except Exception as error:
            # ToolAdapterFactory and HTTPAPITool already redact credentials; do
            # not expose arbitrary exception strings from package transports.
            try:
                credential = SecretService(self._database).reveal(create.secret_id) if create.secret_id else None
            except Exception:
                credential = None
            safe = ToolService._safe_error(
                error, "Connection test failed", (credential,) if credential else (),
            )
            return ToolCatalogTestResponse(success=False, message=safe)

    def create(self, package_id: str, payload: ToolPackageSetupRequest) -> ToolTestResponse:
        result = self.test(package_id, payload)
        if not result.success:
            raise ToolOperationError(result.message)
        service = ToolService(self._database, self._factory)
        tool = service.create(self._generated(package_id, payload))
        try:
            tested = service.test(tool.id)
            if tested.tool.status != "connected":
                service.delete(tool.id)
                raise ToolOperationError(tested.message)
            return tested
        except Exception:
            # A failed post-create check must not leave an unverified connection.
            current = self._database.get(ToolConnection, tool.id)
            if current is not None:
                try:
                    service.delete(tool.id)
                except Exception:
                    self._database.rollback()
            raise
