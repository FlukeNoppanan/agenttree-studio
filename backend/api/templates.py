"""Built-in and user-owned Tree Template APIs."""

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from backend.api.auth import current_user
from backend.db.session import get_db
from backend.schemas.template import TemplateInstantiateRequest, TemplateRead, TemplateUpdate
from backend.schemas.tree import TreeDetailRead
from backend.services.template_service import TemplateService

router = APIRouter(prefix="/templates", tags=["templates"])


@router.get("", response_model=list[TemplateRead])
def list_templates(request: Request, database: Session = Depends(get_db)):
    return TemplateService(database).list(current_user(request, database))


@router.get("/{template_id}", response_model=TemplateRead)
def get_template(template_id: str, request: Request, database: Session = Depends(get_db)):
    return TemplateService(database).get(template_id, current_user(request, database))


@router.post("/{template_id}/instantiate", response_model=TreeDetailRead, status_code=status.HTTP_201_CREATED)
def instantiate_template(
    template_id: str, payload: TemplateInstantiateRequest, request: Request,
    database: Session = Depends(get_db),
):
    return TemplateService(database).instantiate(
        template_id, current_user(request, database), name=payload.name,
    )


@router.put("/{template_id}", response_model=TemplateRead)
def update_template(
    template_id: str, payload: TemplateUpdate, request: Request,
    database: Session = Depends(get_db),
):
    return TemplateService(database).update(template_id, payload, current_user(request, database))


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(template_id: str, request: Request, database: Session = Depends(get_db)) -> Response:
    TemplateService(database).delete(template_id, current_user(request, database))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
