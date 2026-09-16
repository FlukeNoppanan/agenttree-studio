"""Read-only Tool catalog for tree draft assignment integration."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.db.session import get_db
from backend.schemas.tool import ToolConnectionRead
from backend.services.tree_service import ToolCatalogService

router = APIRouter(prefix="/tools", tags=["tools"])


@router.get("", response_model=list[ToolConnectionRead])
def list_tools(database: Session = Depends(get_db)) -> list[ToolConnectionRead]:
    return [ToolConnectionRead.model_validate(tool) for tool in ToolCatalogService(database).list()]
