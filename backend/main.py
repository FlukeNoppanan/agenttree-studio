"""AgentTree Studio API application."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.api.health import router as health_router
from backend.api.dashboard import router as dashboard_router
from backend.api.capabilities import router as capabilities_router
from backend.api.providers import router as providers_router
from backend.api.runs import router as runs_router
from backend.api.runtime import router as runtime_router
from backend.api.destinations import router as destinations_router
from backend.api.secrets import router as secrets_router
from backend.api.tools import router as tools_router
from backend.api.trees import router as trees_router
from backend.core.config import settings
from backend.db.session import initialize_database
from backend.services.errors import ServiceError


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Initialize local infrastructure before accepting requests."""
    initialize_database()
    yield


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)


@app.exception_handler(ServiceError)
async def handle_service_error(_: Request, exc: ServiceError) -> JSONResponse:
    content: dict = {"detail": str(exc)}
    if hasattr(exc, "error_code"):
        content["error"] = {"code": exc.error_code, "message": str(exc)}
    return JSONResponse(status_code=exc.status_code, content=content)


@app.exception_handler(RequestValidationError)
async def handle_validation_error(
    _: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    """Return useful validation errors without echoing submitted credentials."""
    safe_errors = [
        {key: value for key, value in error.items() if key not in ("input", "ctx")}
        for error in exc.errors()
    ]
    return JSONResponse(status_code=422, content={"detail": safe_errors})

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix="/api")
app.include_router(dashboard_router, prefix="/api")
app.include_router(secrets_router, prefix="/api")
app.include_router(providers_router, prefix="/api")
app.include_router(trees_router, prefix="/api")
app.include_router(tools_router, prefix="/api")
app.include_router(capabilities_router, prefix="/api")
app.include_router(runs_router, prefix="/api")
app.include_router(runtime_router, prefix="/api")
app.include_router(destinations_router, prefix="/api")
