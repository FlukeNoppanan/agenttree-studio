"""Resolve portable Template Tool requirements against local connections."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models.tool import ToolConnection
from backend.models.tree import TreeVersion
from backend.schemas.template import (
    TemplateDefinition,
    TemplateRequirementState,
    TemplateToolRequirementStatus,
    upgrade_template_definition,
)
from backend.tools.catalog import TOOL_PACKAGES


_PACKAGES = {item["id"]: item for item in TOOL_PACKAGES}


def catalog_key_for_tool(tool: ToolConnection) -> str | None:
    """Identify only adapter/package semantics that can be inferred safely."""
    configuration = tool.config_json or {}
    marker = configuration.get("catalog_package_id")
    if isinstance(marker, str):
        return marker if marker in _PACKAGES else None
    if tool.tool_type == "artifact" and not configuration:
        return "artifact-output"
    if tool.tool_type == "mcp" and tool.transport_type == "streamable_http":
        return "generic-mcp-http"
    if tool.tool_type == "http_api":
        url = configuration.get("url")
        method = configuration.get("method", "GET")
        if url == "https://api.github.com/user" and isinstance(method, str) and method.upper() == "GET":
            return "github-account-api"
        # An HTTP Tool is the same flexible request adapter as this package;
        # no endpoint URL or authentication value is copied into a Template.
        return "web-api-request"
    return None


def _matches(tool: ToolConnection, catalog_key: str) -> bool:
    marker = (tool.config_json or {}).get("catalog_package_id")
    inferred = catalog_key_for_tool(tool)
    if marker and marker != catalog_key:
        return False
    return inferred == catalog_key


def resolve_requirements(
    database: Session,
    version: TreeVersion,
    definition: TemplateDefinition,
    agent_ids: dict[str, str],
) -> list[TemplateToolRequirementStatus]:
    tools = database.scalars(select(ToolConnection).order_by(ToolConnection.created_at.desc())).all()
    assigned = {
        (item.agent_config_id, item.tool_connection_id)
        for item in version.tool_assignments
        if item.tree_version_id == version.id
    }
    results: list[TemplateToolRequirementStatus] = []
    for requirement in definition.tool_requirements:
        package = _PACKAGES.get(requirement.catalog_key)
        package_name = package["name"] if package else None
        target_id = agent_ids.get(requirement.agent_ref) if requirement.agent_ref else None
        target_valid = requirement.agent_ref is None or target_id is not None
        candidates = [tool for tool in tools if _matches(tool, requirement.catalog_key)]
        healthy = [tool for tool in candidates if tool.enabled and tool.status == "connected" and (
            tool.tool_type != "mcp" or any(
                isinstance(item, dict) and item.get("selected") is True
                for item in (tool.discovered_tools_json or [])
            )
        )]
        assigned_tool = next((tool for tool in healthy if (
            any(agent_id == target_id and tool_id == tool.id for agent_id, tool_id in assigned)
            if target_id else any(tool_id == tool.id for _, tool_id in assigned)
        )), None)
        available_tool = healthy[0] if healthy else None

        if not target_valid or package is None:
            state, action, tool_id = TemplateRequirementState.MISSING, "none", None
        elif package["status"].value == "coming_soon":
            state, action, tool_id = TemplateRequirementState.COMING_SOON, "none", None
        elif assigned_tool is not None:
            state, action, tool_id = TemplateRequirementState.READY, "none", assigned_tool.id
        elif available_tool is not None:
            state, action, tool_id = TemplateRequirementState.AVAILABLE_TO_ADD, "assign", available_tool.id
        elif candidates:
            state, action, tool_id = TemplateRequirementState.NEEDS_CONFIGURATION, "configure", candidates[0].id
        elif any(field["required"] for field in package["config_fields"]):
            state, action, tool_id = TemplateRequirementState.NEEDS_CONFIGURATION, "configure", None
        else:
            state, action, tool_id = TemplateRequirementState.AVAILABLE_TO_ADD, "add", None

        selected_connection = next((tool for tool in candidates if tool.id == tool_id), None)
        results.append(TemplateToolRequirementStatus(
            id=requirement.id,
            catalog_key=requirement.catalog_key,
            requirement=requirement.requirement,
            agent_ref=requirement.agent_ref,
            agent_id=target_id,
            reason=requirement.reason,
            package_name=package_name,
            package_status=package["status"] if package else None,
            state=state,
            tool_id=tool_id,
            action=action,
            discovered_tools=(selected_connection.discovered_tools_json or [])
            if selected_connection and selected_connection.tool_type == "mcp" else [],
        ))
    return results
