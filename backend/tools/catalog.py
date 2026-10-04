"""Source-controlled, non-executable Tool package manifests."""

from backend.schemas.template import ToolPackageStatus


TOOL_PACKAGES: tuple[dict, ...] = (
    {
        "id": "artifact-output", "name": "Artifact Output",
        "description": "Create and update run artifacts using AgentTree's existing artifact Tool.",
        "category": "workspace", "version": "1.0.0", "icon": "file-output",
        "status": ToolPackageStatus.READY, "tool_type": "artifact", "transport_type": None,
        "config_fields": [], "required_secrets": [],
        "operations": ["Create artifact", "Update artifact", "Delete artifact"],
        "setup_instructions": ["No connection or Secret is required. The artifact is scoped to its run."],
    },
    {
        "id": "web-api-request", "name": "Web/API Request",
        "description": "Call a documented HTTP API using Studio's existing HTTP Tool adapter.",
        "category": "web", "version": "1.0.0", "icon": "globe",
        "status": ToolPackageStatus.READY, "tool_type": "http_api", "transport_type": None,
        "config_fields": [
            {"key": "url", "kind": "url", "required": True},
            {"key": "method", "kind": "method", "required": True,
             "options": ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]},
            {"key": "auth_mode", "kind": "auth", "required": False,
             "options": ["none", "bearer", "api_key"]},
        ],
        "required_secrets": [], "operations": ["HTTP request"],
        "setup_instructions": ["Enter an HTTP or HTTPS endpoint.", "Optionally choose an existing Secret for authentication."],
    },
    {
        "id": "generic-mcp-http", "name": "Generic MCP Server",
        "description": "Connect to an MCP server over the supported Streamable HTTP transport.",
        "category": "developer", "version": "1.0.0", "icon": "plug",
        "status": ToolPackageStatus.READY, "tool_type": "mcp", "transport_type": "streamable_http",
        "config_fields": [
            {"key": "url", "kind": "url", "required": True},
            {"key": "auth_mode", "kind": "auth", "required": False,
             "options": ["none", "bearer"]},
        ],
        "required_secrets": [], "operations": ["Discover MCP tools", "Execute selected MCP tools"],
        "setup_instructions": ["Use an MCP Streamable HTTP endpoint.", "Studio discovers available tools before they can be assigned."],
    },
    {
        "id": "github-account-api", "name": "GitHub Account API",
        "description": "Experimental read-only GitHub account check using GitHub's authenticated user endpoint.",
        "category": "developer", "version": "0.1.0", "icon": "github",
        "status": ToolPackageStatus.EXPERIMENTAL, "tool_type": "http_api", "transport_type": None,
        "config_fields": [{"key": "secret_id", "kind": "secret", "required": True}],
        "required_secrets": ["GitHub personal access token"], "operations": ["Read authenticated account"],
        "setup_instructions": ["Create a GitHub token with the minimum account-read scope needed.", "Save it as a Studio Secret before setup."],
    },
    {
        "id": "filesystem-workspace", "name": "Filesystem / Workspace",
        "description": "Workspace file access is not available through a safe built-in package yet.",
        "category": "workspace", "version": "0.1.0", "icon": "folder",
        "status": ToolPackageStatus.COMING_SOON, "tool_type": None, "transport_type": None,
        "config_fields": [], "required_secrets": [], "operations": [],
        "setup_instructions": ["This package is planned and cannot be configured yet."],
    },
    {
        "id": "database-access", "name": "Database", "description": "Database-specific, least-privilege connectors are planned.",
        "category": "data", "version": "0.1.0", "icon": "database",
        "status": ToolPackageStatus.COMING_SOON, "tool_type": None, "transport_type": None,
        "config_fields": [], "required_secrets": [], "operations": [],
        "setup_instructions": ["This package is planned and cannot be configured yet."],
    },
    {
        "id": "monitoring-observability", "name": "Monitoring / Observability",
        "description": "Monitoring service packages are planned; no executable integration is included yet.",
        "category": "operations", "version": "0.1.0", "icon": "activity",
        "status": ToolPackageStatus.COMING_SOON, "tool_type": None, "transport_type": None,
        "config_fields": [], "required_secrets": [], "operations": [],
        "setup_instructions": ["This package is planned and cannot be configured yet."],
    },
)


def package_read(package: dict):
    from backend.schemas.template import ToolPackageRead
    return ToolPackageRead.model_validate(package)


def _mcp_guide(key: str, name: str, description: str, source: str,
               scope: list[str], setup: list[str], category: str) -> dict:
    return {"id": key, "name": name, "description": description, "category": category,
            "version": "1.0.0", "icon": "plug", "status": ToolPackageStatus.CATALOG_ADDABLE,
            "tool_type": "mcp", "transport_type": "stdio", "config_fields": [],
            "required_secrets": [], "operations": ["Discover MCP tools", "Execute selected MCP tools"],
            "source_url": source, "access_scope": scope,
            "setup_instructions": setup + ["Configure an already-installed executable accessible to the backend container. Test, discover and explicitly select permitted Tools. No package installation is performed by Studio."]}


# An implemented adapter is not the same as a configured, connected resource.
for _package in TOOL_PACKAGES:
    if _package['id'] in {'web-api-request', 'generic-mcp-http', 'github-account-api'}:
        _package['status'] = ToolPackageStatus.SETUP_REQUIRED
    if _package['id'] == 'artifact-output':
        _package['access_scope'] = ['Run-scoped Artifact create/update/delete; no filesystem writes']
    if _package['id'] == 'web-api-request':
        _package['access_scope'] = ['Configured endpoint and method only', 'Write/destructive capability depends on the configured HTTP method']

TOOL_PACKAGES = tuple(p for p in TOOL_PACKAGES if p['id'] != 'filesystem-workspace') + (
    _mcp_guide('filesystem-workspace', 'Filesystem MCP', 'Connect the reference Filesystem server with explicit allowed directories.',
               'https://github.com/modelcontextprotocol/servers/blob/main/src/filesystem/README.md',
               ['Read and write files inside configured allowed directories', 'May modify or move files; select read-only Tools when appropriate'],
               ['Review allowed directories before launching the server. Do not grant the backend host home directory or credential directories.'], 'workspace'),
    _mcp_guide('mcp-fetch', 'Fetch MCP', 'Retrieve web content through the reference Fetch server.',
               'https://github.com/modelcontextprotocol/servers/blob/main/src/fetch/README.md',
               ['Network requests to URLs requested by the Agent', 'Retrieved content is untrusted; do not send credentials in URLs'],
               ['Install and manage the reference Fetch server separately. Network access follows the server and backend host configuration.'], 'web'),
    _mcp_guide('mcp-memory', 'Knowledge Graph MCP', 'Connect the reference Memory server for an explicitly configured knowledge graph.',
               'https://github.com/modelcontextprotocol/servers/blob/main/src/memory/README.md',
               ['Read/create/update/delete knowledge graph records', 'Persistent data belongs to the external MCP server; not AgentTree conversation memory'],
               ['Choose a dedicated external data location. Review which read/write/delete Tools are exposed before assigning them.'], 'data'),
)
