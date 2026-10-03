"""Dependency inspection and deletion contracts through API route handlers."""

import httpx
from unittest.mock import patch
from starlette.requests import Request
from backend.models.auth import User
from backend.api.providers import delete_provider, provider_dependencies
from backend.api.secrets import delete_secret, secret_dependencies
from backend.api.tools import delete_tool, tool_dependencies
from backend.main import app
from backend.services.errors import ServiceError
from backend.models.destination import ResultDestination
from backend.models.provider import ProviderConnection, ProviderModel
from backend.models.secret import Secret
from backend.models.tool import ToolAssignment, ToolConnection
from backend.models.tree import AgentConfig, Tree, TreeVersion


def client_for(database_factory):
    class Client:
        def request(self, method, path):
            _, _, kind, resource_id, *suffix = path.split("/")
            handlers = {
                "secrets": (secret_dependencies, delete_secret),
                "providers": (provider_dependencies, delete_provider),
                "tools": (tool_dependencies, delete_tool),
            }
            inspect, remove = handlers[kind]
            with database_factory() as database:
                try:
                    if method == "GET" and suffix == ["dependencies"]:
                        with patch(f"backend.api.{kind}.current_user", return_value=User(is_admin=True)):
                            return httpx.Response(200, json=inspect(resource_id, Request({"type": "http"}), database).model_dump(mode="json"))
                    if method == "DELETE" and not suffix:
                        remove(resource_id, database)
                        return httpx.Response(204)
                    raise AssertionError(f"Unexpected route: {method} {path}")
                except ServiceError as error:
                    return httpx.Response(error.status_code, json={"detail": str(error)})

        def get(self, path):
            return self.request("GET", path)

        def delete(self, path):
            return self.request("DELETE", path)

    return Client()


def test_dependency_routes_are_registered():
    paths = app.openapi()["paths"]
    assert "get" in paths["/api/secrets/{secret_id}/dependencies"]
    assert "get" in paths["/api/providers/{provider_id}/dependencies"]
    assert "get" in paths["/api/tools/{tool_id}/dependencies"]


def test_secret_dependencies_and_safe_deletion(database_factory):
    with database_factory() as database:
        free = Secret(name="Disposable", secret_type="api_key", encrypted_value="never-plain")
        used = Secret(name="Shared", secret_type="api_key", encrypted_value="sensitive-ciphertext")
        database.add_all([free, used])
        database.flush()
        provider = ProviderConnection(name="Gemini Production", provider_type="gemini", secret_id=used.id)
        tool = ToolConnection(name="Secure Tool", tool_type="http_api", secret_id=used.id)
        tree = Tree(name="Delivery Tree")
        destination = ResultDestination(tree=tree, name="Webhook", destination_type="webhook", secret_id=used.id)
        database.add_all([provider, tool, destination])
        database.commit()
        free_id, used_id, provider_id, tool_id, tree_id = free.id, used.id, provider.id, tool.id, tree.id

    client = client_for(database_factory)
    assert client.get(f"/api/secrets/{free_id}/dependencies").json()["can_delete"] is True
    assert client.delete(f"/api/secrets/{free_id}").status_code == 204
    response = client.get(f"/api/secrets/{used_id}/dependencies")
    assert response.status_code == 200
    payload = response.json()
    assert payload["can_delete"] is False
    assert {(item["type"], item["name"]) for item in payload["dependencies"]} == {
        ("provider", "Gemini Production"), ("tool", "Secure Tool"), ("destination", "Webhook")
    }
    assert payload["dependencies"][2]["tree_id"] == tree_id
    assert "sensitive-ciphertext" not in response.text
    assert "encrypted_value" not in response.text
    assert client.delete(f"/api/secrets/{used_id}").status_code == 409
    with database_factory() as database:
        assert database.get(Secret, used_id) is not None
        database.get(ProviderConnection, provider_id).secret_id = None
        database.get(ToolConnection, tool_id).secret_id = None
        database.get(ResultDestination, payload["dependencies"][2]["id"]).secret_id = None
        database.commit()
    assert client.get(f"/api/secrets/{used_id}/dependencies").json()["can_delete"] is True
    assert client.delete(f"/api/secrets/{used_id}").status_code == 204


def test_provider_agent_model_dependency_and_lifecycle(database_factory):
    with database_factory() as database:
        provider = ProviderConnection(name="Gemini", provider_type="gemini")
        free = ProviderConnection(name="Disposable", provider_type="ollama")
        database.add_all([provider, free])
        database.flush()
        model = ProviderModel(provider_connection_id=provider.id, model_id="models/gemini-flash")
        tree = Tree(name="IT Helpdesk")
        version = TreeVersion(tree=tree, version_number=1)
        agent = AgentConfig(tree_version=version, agent_type="root", name="Root Agent",
                            provider_connection_id=provider.id, model_id=model.model_id)
        tree.current_version = version
        database.add_all([model, agent])
        database.commit()
        provider_id, free_id, tree_id, agent_id = provider.id, free.id, tree.id, agent.id

    client = client_for(database_factory)
    assert client.get(f"/api/providers/{free_id}/dependencies").json()["can_delete"] is True
    assert client.delete(f"/api/providers/{free_id}").status_code == 204
    payload = client.get(f"/api/providers/{provider_id}/dependencies").json()
    assert payload["can_delete"] is False
    dependency = payload["dependencies"][0]
    assert (dependency["tree_id"], dependency["tree_name"]) == (tree_id, "IT Helpdesk")
    assert (dependency["agent_id"], dependency["agent_name"]) == (agent_id, "Root Agent")
    assert dependency["model_id"] == "models/gemini-flash"
    assert client.delete(f"/api/providers/{provider_id}").status_code == 409
    with database_factory() as database:
        database.get(AgentConfig, agent_id).provider_connection_id = None
        database.commit()
    assert client.get(f"/api/providers/{provider_id}/dependencies").json()["can_delete"] is True
    assert client.delete(f"/api/providers/{provider_id}").status_code == 204


def test_tool_assignment_blocks_deletion_until_removed(database_factory):
    with database_factory() as database:
        tool = ToolConnection(name="Filesystem", tool_type="mcp")
        free = ToolConnection(name="Disposable", tool_type="http_api")
        tree = Tree(name="Coding Assistant")
        version = TreeVersion(tree=tree, version_number=1)
        specialist = AgentConfig(tree_version=version, agent_type="specialist", name="Developer Specialist",
                                 capabilities_json=["code-editing"])
        tree.current_version = version
        assignment = ToolAssignment(tree_version=version, agent_config=specialist, tool_connection=tool)
        database.add_all([tool, free, tree, assignment])
        database.commit()
        tool_id, free_id, assignment_id, specialist_id = tool.id, free.id, assignment.id, specialist.id

    client = client_for(database_factory)
    assert client.get(f"/api/tools/{free_id}/dependencies").json()["can_delete"] is True
    assert client.delete(f"/api/tools/{free_id}").status_code == 204
    payload = client.get(f"/api/tools/{tool_id}/dependencies").json()
    assert payload["can_delete"] is False
    dependency = payload["dependencies"][0]
    assert dependency["tree_name"] == "Coding Assistant"
    assert dependency["agent_id"] == specialist_id
    assert dependency["agent_name"] == "Developer Specialist"
    assert dependency["capabilities"] == ["code-editing"]
    assert client.delete(f"/api/tools/{tool_id}").status_code == 409
    with database_factory() as database:
        assert database.get(ToolAssignment, assignment_id) is not None
        assert database.get(ToolConnection, tool_id) is not None
        database.delete(database.get(ToolAssignment, assignment_id))
        database.commit()
    assert client.get(f"/api/tools/{tool_id}/dependencies").json()["can_delete"] is True
    assert client.delete(f"/api/tools/{tool_id}").status_code == 204
