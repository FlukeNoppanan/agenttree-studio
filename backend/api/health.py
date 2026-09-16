"""Health and dependency readiness endpoints."""

import platform

from fastapi import APIRouter

from backend.schemas.health import HealthResponse, RuntimeInfo
from backend.services.agenttree_service import get_agenttree_status

router = APIRouter(tags=["system"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Report backend health and verify the AgentTree package import."""
    agenttree_status = get_agenttree_status()
    return HealthResponse(
        status="ok" if agenttree_status.available else "degraded",
        service="AgentTree Studio",
        version="0.1.0",
        agenttree=agenttree_status,
        runtime=RuntimeInfo(
            python_version=platform.python_version(),
            platform=platform.system(),
        ),
    )
