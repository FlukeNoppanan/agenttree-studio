"""Health and dependency readiness endpoints."""

import platform

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.core.config import PROJECT_ROOT, settings
from backend.db.session import get_db
from backend.schemas.health import (
    ComponentHealth,
    HealthResponse,
    MigrationHealth,
    RuntimeInfo,
    SystemHealthResponse,
)
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


@router.get("/system-health", response_model=SystemHealthResponse)
def system_health(database: Session = Depends(get_db)) -> SystemHealthResponse:
    """Return sanitized infrastructure diagnostics for Settings."""
    agenttree_status = get_agenttree_status()
    database_ok = True
    try:
        database.execute(text("SELECT 1"))
    except Exception:
        database_ok = False

    config = Config(str(PROJECT_ROOT / "alembic.ini"))
    script = ScriptDirectory.from_config(config)
    head = script.get_current_head()
    current = MigrationContext.configure(database.connection()).get_current_revision() if database_ok else None
    migrations_ok = current == head
    overall = agenttree_status.available and database_ok and migrations_ok
    return SystemHealthResponse(
        status="ok" if overall else "degraded",
        studio_api=ComponentHealth(available=True, version=settings.app_version),
        agenttree=agenttree_status,
        database=ComponentHealth(
            available=database_ok,
            detail=database.bind.dialect.name if database.bind is not None else "unknown",
        ),
        migrations=MigrationHealth(current=current, head=head, up_to_date=migrations_ok),
        backend_version=settings.app_version,
        frontend_version="0.1.0",
        runtime=RuntimeInfo(python_version=platform.python_version(), platform=platform.system()),
    )
