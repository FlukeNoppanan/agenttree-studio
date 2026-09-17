"""Aggregated product dashboard API."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.db.session import get_db
from backend.schemas.dashboard import DashboardSummary
from backend.services.dashboard_service import DashboardService

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
def dashboard_summary(database: Session = Depends(get_db)) -> DashboardSummary:
    return DashboardService(database).summary()
