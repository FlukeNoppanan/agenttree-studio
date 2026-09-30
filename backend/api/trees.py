"""Tree draft, version, and validation endpoints."""

from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy.orm import Session

from backend.db.session import get_db
from backend.api.auth import current_user
from backend.schemas.template import TemplateMetadataCreate, TemplateRead
from backend.schemas.template import (
    AgentModelBindingUpdate, TemplateAgentCreate, TemplateAgentUpdate,
    TemplateAgentToolsUpdate, TemplateSetupRead,
)
from backend.schemas.tree import (
    TreeDetailRead,
    TreeDraftPayload,
    TreeListRead,
    TreeUpdate,
    TreeValidationRead,
    TreeVersionRead,
)
from backend.services.tree_service import TreeService
from backend.services.template_service import TemplateService
from backend.services.template_setup_service import TemplateSetupService

router = APIRouter(prefix="/trees", tags=["trees"])


@router.get("/{tree_id}/template-setup", response_model=TemplateSetupRead)
def get_template_setup(
    tree_id: str, request: Request, database: Session = Depends(get_db),
) -> TemplateSetupRead:
    return TemplateSetupService(database).get(tree_id, current_user(request, database))


@router.post("/{tree_id}/template-setup/agents", response_model=TemplateSetupRead, status_code=status.HTTP_201_CREATED)
def create_template_agent(
    tree_id: str, payload: TemplateAgentCreate, request: Request,
    database: Session = Depends(get_db),
) -> TemplateSetupRead:
    return TemplateSetupService(database).create_agent(
        tree_id, payload, current_user(request, database),
    )


@router.patch("/{tree_id}/template-setup/agents/{agent_id}", response_model=TemplateSetupRead)
def update_template_agent(
    tree_id: str, agent_id: str, payload: TemplateAgentUpdate, request: Request,
    database: Session = Depends(get_db),
) -> TemplateSetupRead:
    return TemplateSetupService(database).update_agent(
        tree_id, agent_id, payload, current_user(request, database),
    )


@router.put("/{tree_id}/template-setup/agents/{agent_id}/tools", response_model=TemplateSetupRead)
def update_template_agent_tools(
    tree_id: str, agent_id: str, payload: TemplateAgentToolsUpdate, request: Request,
    database: Session = Depends(get_db),
) -> TemplateSetupRead:
    return TemplateSetupService(database).update_agent_tools(
        tree_id, agent_id, payload, current_user(request, database),
    )


@router.patch("/{tree_id}/template-setup/agents/{agent_id}/model", response_model=TemplateSetupRead)
def bind_template_agent_model(
    tree_id: str, agent_id: str, payload: AgentModelBindingUpdate,
    request: Request, database: Session = Depends(get_db),
) -> TemplateSetupRead:
    return TemplateSetupService(database).bind_agent(
        tree_id, agent_id, payload, current_user(request, database),
    )


@router.post("/{tree_id}/template-setup/apply-default", response_model=TemplateSetupRead)
def apply_template_default_model(
    tree_id: str, payload: AgentModelBindingUpdate,
    request: Request, database: Session = Depends(get_db),
) -> TemplateSetupRead:
    return TemplateSetupService(database).apply_default(
        tree_id, payload, current_user(request, database),
    )


@router.get("", response_model=list[TreeListRead])
def list_trees(database: Session = Depends(get_db)) -> list[TreeListRead]:
    return TreeService(database).list()


@router.post("", response_model=TreeDetailRead, status_code=status.HTTP_201_CREATED)
def create_tree(
    payload: TreeDraftPayload,
    database: Session = Depends(get_db),
) -> TreeDetailRead:
    return TreeService(database).create(payload)


@router.post("/{tree_id}/save-as-template", response_model=TemplateRead, status_code=status.HTTP_201_CREATED)
def save_tree_as_template(
    tree_id: str, payload: TemplateMetadataCreate, request: Request,
    database: Session = Depends(get_db),
) -> TemplateRead:
    return TemplateService(database).create_from_tree(tree_id, payload, current_user(request, database))


@router.get("/{tree_id}", response_model=TreeDetailRead)
def get_tree(tree_id: str, database: Session = Depends(get_db)) -> TreeDetailRead:
    return TreeService(database).get(tree_id)


@router.put("/{tree_id}", response_model=TreeDetailRead)
def update_tree(
    tree_id: str,
    payload: TreeUpdate,
    database: Session = Depends(get_db),
) -> TreeDetailRead:
    return TreeService(database).update(tree_id, payload)


@router.delete("/{tree_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tree(tree_id: str, database: Session = Depends(get_db)) -> Response:
    TreeService(database).delete(tree_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{tree_id}/version", response_model=TreeVersionRead)
def get_tree_version(
    tree_id: str,
    database: Session = Depends(get_db),
) -> TreeVersionRead:
    return TreeService(database).get_version(tree_id)


@router.put("/{tree_id}/version", response_model=TreeDetailRead)
def save_tree_draft(
    tree_id: str,
    payload: TreeDraftPayload,
    database: Session = Depends(get_db),
) -> TreeDetailRead:
    return TreeService(database).save_draft(tree_id, payload)


@router.put("/{tree_id}/configuration", response_model=TreeDetailRead)
def replace_ready_tree_configuration(
    tree_id: str,
    payload: TreeDraftPayload,
    database: Session = Depends(get_db),
) -> TreeDetailRead:
    return TreeService(database).replace_ready_configuration(tree_id, payload)


@router.post("/{tree_id}/validate", response_model=TreeValidationRead)
def validate_tree(
    tree_id: str,
    mark_ready: bool = Query(default=False),
    database: Session = Depends(get_db),
) -> TreeValidationRead:
    return TreeService(database).validate(tree_id, mark_ready=mark_ready)
