"""Catalog manifests are safe generators for existing Tool adapters."""

import json

import httpx
import pytest
from pydantic import ValidationError

from agenttree.tools.mcp import BaseMCPClient
from backend.models.secret import Secret
from backend.schemas.template import ToolPackageSetupRequest, ToolPackageStatus
from backend.schemas.secret import SecretCreate
from backend.services.errors import ServiceError
from backend.services.secret_service import SecretService
from backend.services.tool_catalog_service import ToolCatalogService
from backend.services.tool_service import ToolService
from backend.tools.factory import ToolAdapterFactory


class FakeMCPClient(BaseMCPClient):
    def __init__(self, *, fail=False):
        super().__init__(server_id="catalog-test")
        self.fail = fail
        self.connected = False

    def connect(self):
        if self.fail:
            raise RuntimeError("connection refused")
        self.connected = True

    def list_tools(self):
        assert self.connected
        return ()

    def call_tool(self, name, arguments):
        raise AssertionError("This connection test must not execute an MCP Tool")

    def close(self):
        self.connected = False


class CatalogTestFactory(ToolAdapterFactory):
    __test__ = False

    def __init__(self, database, transport, mcp_client=None):
        super().__init__(database, http_transport=transport)
        self.mcp_client = mcp_client or FakeMCPClient()

    def create_mcp_client(self, connection):
        return self.mcp_client


def test_catalog_manifests_only_mark_real_generators_ready():
    packages = ToolCatalogService(None).list()
    by_id = {item.id: item for item in packages}
    assert by_id["web-api-request"].status is ToolPackageStatus.SETUP_REQUIRED
    assert by_id["generic-mcp-http"].status is ToolPackageStatus.SETUP_REQUIRED
    assert by_id["github-account-api"].status is ToolPackageStatus.SETUP_REQUIRED
    assert by_id["filesystem-workspace"].status is ToolPackageStatus.CATALOG_ADDABLE
    assert by_id["database-access"].status is ToolPackageStatus.COMING_SOON
    assert by_id["monitoring-observability"].status is ToolPackageStatus.COMING_SOON
    assert all("command" not in [field.key for field in item.config_fields] for item in packages)


def test_ready_http_package_tests_then_creates_connected_existing_tool(database):
    seen = []
    def response(request):
        seen.append(request)
        return httpx.Response(200, json={"status": "ok"}, request=request)
    factory = CatalogTestFactory(database, httpx.MockTransport(response))
    service = ToolCatalogService(database, factory)
    payload = ToolPackageSetupRequest(url="https://api.example.test/health")

    result = service.test("web-api-request", payload)
    assert result.success
    created = service.create("web-api-request", payload)
    assert created.tool.status.value == "connected"
    assert created.tool.tool_type.value == "http_api"
    assert ToolService(database).get(created.tool.id).status.value == "connected"
    assert len(seen) == 3  # preflight, create-time verification, persisted status test
    assert "{{secret}}" not in json.dumps(created.model_dump(mode="json"))


def test_catalog_auth_uses_secret_reference_and_never_serializes_plaintext(database):
    secret = SecretService(database).create(SecretCreate(
        name="Catalog token", secret_type="api_key", value="catalog-private-token",
    ))
    observed = []
    def response(request):
        observed.append(request.headers.get("authorization"))
        return httpx.Response(200, json={"login": "agenttree"}, request=request)
    service = ToolCatalogService(database, CatalogTestFactory(database, httpx.MockTransport(response)))
    payload = ToolPackageSetupRequest(secret_id=secret.id, auth_mode="bearer")

    tested = service.test("github-account-api", payload)
    created = service.create("github-account-api", payload)
    serialized = json.dumps(created.model_dump(mode="json"))
    assert tested.success and created.tool.status.value == "connected"
    assert observed == ["Bearer catalog-private-token"] * 3
    assert "catalog-private-token" not in serialized
    assert "Bearer {{secret}}" in serialized


def test_catalog_requires_studio_secret_and_rejects_extra_shell_or_credentials(database):
    service = ToolCatalogService(database)
    with pytest.raises(ServiceError, match="Studio Secret"):
        service.test("github-account-api", ToolPackageSetupRequest())
    with pytest.raises(ValidationError):
        ToolPackageSetupRequest.model_validate({"url": "https://example.test", "command": "sh"})
    with pytest.raises(ValidationError):
        ToolPackageSetupRequest.model_validate({"configuration": {"headers": {"Authorization": "Bearer raw"}}})
    with pytest.raises(ServiceError, match="coming soon"):
        service.test("database-access", ToolPackageSetupRequest())


def test_streamable_http_package_uses_existing_mcp_factory(database):
    factory = CatalogTestFactory(database, httpx.MockTransport(lambda request: httpx.Response(200)), FakeMCPClient())
    service = ToolCatalogService(database, factory)
    payload = ToolPackageSetupRequest(url="https://mcp.example.test/mcp")
    assert service.test("generic-mcp-http", payload).success
    created = service.create("generic-mcp-http", payload)
    assert created.tool.tool_type.value == "mcp"
    assert created.tool.transport_type.value == "streamable_http"
    assert created.tool.status.value == "connected"


def test_curated_mcp_guides_are_registration_not_software_installation(database):
    service=ToolCatalogService(database)
    for key in ['filesystem-workspace','mcp-fetch','mcp-memory']:
        package=service.get(key)
        assert package.status is ToolPackageStatus.CATALOG_ADDABLE
        assert package.tool_type=='mcp' and package.transport_type=='stdio'
        assert package.source_url.startswith('https://github.com/modelcontextprotocol/servers/')
        assert package.access_scope and package.setup_instructions
        with pytest.raises(ServiceError,match='no software is installed'):
            service.create(key,ToolPackageSetupRequest())


def test_all_catalog_manifests_round_trip_and_do_not_embed_credentials():
    from backend.schemas.template import ToolPackageRead
    for package in ToolCatalogService(None).list():
        assert ToolPackageRead.model_validate_json(package.model_dump_json())==package
        assert package.status in set(ToolPackageStatus)
        assert not any(word in package.model_dump_json() for word in ['encrypted_value','Bearer sk-','api_key=secret'])


def test_registered_mcp_profile_matches_template_requirement_without_name_guessing(database):
    from backend.models.tool import ToolConnection, ToolAssignment
    from backend.models.auth import User
    from backend.services.template_service import TemplateService
    from backend.services.template_requirements import resolve_requirements
    from backend.models.tree import TreeVersion
    from backend.schemas.tree import ToolAssignmentDraft
    user=User(username='catalog-admin',username_key='catalog-admin',is_admin=True,is_active=True,password_hash='not-used')
    database.add(user); database.commit()
    templates=TemplateService(database)
    prepared=templates.prepare_draft('builtin-document-analysis',user)
    definition=templates.get('builtin-document-analysis',user).definition
    requirement=next(r for r in definition.tool_requirements if r.catalog_key=='filesystem-workspace')
    mcp=ToolConnection(name='A custom resource label',tool_type='mcp',transport_type='stdio',enabled=True,status='connected',
        config_json={'catalog_package_id':'filesystem-workspace'},discovered_tools_json=[{'name':'read_text_file','selected':True}])
    database.add(mcp);database.commit()
    prepared.configuration.tool_assignments=[ToolAssignmentDraft(agent_config_id=prepared.agent_ids[requirement.agent_ref],tool_connection_id=mcp.id)]
    tree=templates.instantiate('builtin-document-analysis',user,configuration=prepared.configuration,agent_ids=prepared.agent_ids)
    version=database.get(TreeVersion,tree.current_version_id)
    states=resolve_requirements(database,version,definition,prepared.agent_ids)
    assert next(s for s in states if s.catalog_key=='filesystem-workspace').state.value=='ready'
    mcp.config_json={};database.commit()
    states=resolve_requirements(database,version,definition,prepared.agent_ids)
    assert next(s for s in states if s.catalog_key=='filesystem-workspace').state.value!='ready'
