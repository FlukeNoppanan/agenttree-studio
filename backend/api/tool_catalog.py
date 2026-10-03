"""Safe source-controlled Tool package catalog APIs."""

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from backend.db.session import get_db
from backend.schemas.template import (
    TemplateToolRequirementResolveRequest,
    TemplateToolRequirementsResolveAllRequest,
    TemplateSetupRead,
    ToolCatalogTestResponse,
    ToolPackageRead,
    ToolPackageSetupRequest,
)
from backend.api.auth import current_user
from backend.services.auth_service import AuthService
from backend.schemas.tool import ToolTestResponse
from backend.services.tool_catalog_service import ToolCatalogService
from backend.services.template_setup_service import TemplateSetupService

router = APIRouter(prefix="/tool-catalog", tags=["tool-catalog"])


@router.get("", response_model=list[ToolPackageRead])
def list_packages(database: Session = Depends(get_db)):
    return ToolCatalogService(database).list()


@router.get("/{package_id}", response_model=ToolPackageRead)
def get_package(package_id: str, database: Session = Depends(get_db)):
    return ToolCatalogService(database).get(package_id)


@router.post("/{package_id}/test", response_model=ToolCatalogTestResponse)
def test_package(
    package_id: str, payload: ToolPackageSetupRequest, database: Session = Depends(get_db),
):
    return ToolCatalogService(database).test(package_id, payload)


@router.post("/{package_id}/create", response_model=ToolTestResponse, status_code=status.HTTP_201_CREATED)
def create_package_tool(
    package_id: str, payload: ToolPackageSetupRequest, database: Session = Depends(get_db),
):
    return ToolCatalogService(database).create(package_id, payload)


@router.post("/{package_id}/resolve-requirement", response_model=TemplateSetupRead)
def resolve_template_requirement(
    package_id: str,
    payload: TemplateToolRequirementResolveRequest,
    request: Request,
    database: Session = Depends(get_db),
) -> TemplateSetupRead:
    AuthService(database).require_tree_permission(current_user(request, database), payload.tree_id, "manage_trees_agents")
    setup = TemplateSetupService(database).get(payload.tree_id, current_user(request, database))
    requirement = next((item for item in setup.definition.tool_requirements if item.id == payload.requirement_id), None)
    if requirement is None or requirement.catalog_key != package_id:
        from backend.services.errors import ResourceNotFoundError
        raise ResourceNotFoundError("Template Tool requirement not found in this package")
    return TemplateSetupService(database).resolve_requirement(
        payload.tree_id,
        payload.requirement_id,
        setup=payload.setup,
        agent_id=payload.agent_id,
        selected_tools=payload.selected_tools,
        user=current_user(request, database),
    )


@router.post("/resolve-required", response_model=TemplateSetupRead)
def resolve_required_template_tools(
    payload: TemplateToolRequirementsResolveAllRequest,
    request: Request,
    database: Session = Depends(get_db),
) -> TemplateSetupRead:
    AuthService(database).require_tree_permission(current_user(request, database), payload.tree_id, "manage_trees_agents")
    return TemplateSetupService(database).resolve_all_required(
        payload.tree_id, current_user(request, database),
    )
