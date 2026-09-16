"""Studio capability catalog and AI suggestion endpoints."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.db.session import get_db
from backend.schemas.capability import (
    CapabilityCatalogItem,
    CapabilitySuggestionRequest,
    CapabilitySuggestionResponse,
)
from backend.services.capability_service import CapabilityCatalogService, CapabilitySuggestionService

router = APIRouter(prefix="/capabilities", tags=["capabilities"])


@router.get("", response_model=list[CapabilityCatalogItem])
def list_capabilities(
    q: str | None = Query(default=None, max_length=100),
    database: Session = Depends(get_db),
) -> list[CapabilityCatalogItem]:
    return CapabilityCatalogService(database).search(q)


@router.post("/suggest", response_model=CapabilitySuggestionResponse)
def suggest_capabilities(
    payload: CapabilitySuggestionRequest,
    database: Session = Depends(get_db),
) -> CapabilitySuggestionResponse:
    return CapabilitySuggestionService(database).suggest(payload)
