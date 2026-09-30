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
