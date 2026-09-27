"""AgentTree Studio API application."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, contextmanager
import logging
from time import monotonic

from fastapi import FastAPI, Request
from fastapi.exceptions import HTTPException as FastAPIHTTPException
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
from backend.api.auth import router as auth_router
from backend.api.public_v1 import router as public_v1_router
from backend.api.public_v2 import router as public_v2_router
from backend.api.studio_runs import router as studio_runs_router
from backend.core.config import settings
from backend.db.session import SessionLocal, initialize_database
from backend.core.authz import AuthMiddleware
from backend.services.auth_service import AuthService
import os
from backend.services.errors import ServiceError
from backend.core.public_api import PublicAPIError
from backend.core.public_cors import PublicCORSMiddleware

startup_logger = logging.getLogger("uvicorn.error")


@contextmanager
def startup_step(name: str):
    """Log stage and duration without including configuration or credentials."""
    started = monotonic()
    startup_logger.info("startup.%s.begin", name)
    outcome = "ok"
    try:
        yield
    except BaseException:
        outcome = "failed"
        raise
    finally:
        startup_logger.info("startup.%s.%s duration_ms=%.1f", name, outcome,
                            (monotonic() - started) * 1000)


def public_error(request: Request, status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {
        "code": code, "message": message, "request_id": request.state.request_id,
    }})


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Initialize local infrastructure before accepting requests."""
    if os.getenv("AGENTTREE_STUDIO_DEPLOYMENT") == "railway":
        required = (
            "AGENTTREE_STUDIO_ENCRYPTION_KEY",
            "AGENTTREE_STUDIO_ADMIN_USERNAME",
            "AGENTTREE_STUDIO_ADMIN_PASSWORD",
            "AGENTTREE_STUDIO_ARTIFACT_ROOT",
            "AGENTTREE_STUDIO_PUBLIC_ORIGIN",
        )
        missing = [name for name in required if not os.getenv(name)]
        if missing or not (os.getenv("AGENTTREE_STUDIO_DATABASE_URL") or os.getenv("DATABASE_URL")):
            raise RuntimeError("Railway deployment configuration is incomplete")
        if os.getenv("AGENTTREE_STUDIO_SECURE_COOKIES", "").lower() != "true":
            raise RuntimeError("Railway deployment requires secure cookies")
        if os.getenv("AGENTTREE_STUDIO_ADMIN_PASSWORD") == "admin":
            raise RuntimeError("Railway deployment requires a unique bootstrap password")
        if len(os.getenv("AGENTTREE_STUDIO_ADMIN_PASSWORD", "")) < 12:
            raise RuntimeError("Railway bootstrap password must contain at least 12 characters")
        if not settings.database_url.startswith("postgresql+psycopg://"):
            raise RuntimeError("Railway deployment requires PostgreSQL")
        from cryptography.fernet import Fernet
        try:
            Fernet(settings.encryption_key.encode())
        except (ValueError, TypeError) as exc:
            raise RuntimeError("Railway encryption key is not a valid Fernet key") from exc
        _ = settings.public_origin
    if os.getenv("AGENTTREE_STUDIO_DEPLOYMENT") == "railway":
        startup_logger.info("startup.migration.skipped reason=entrypoint")
    else:
        with startup_step("migration"):
            initialize_database()
    with startup_step("session"):
        with SessionLocal() as database:
            with startup_step("bootstrap"):
                AuthService(database).bootstrap(
                    os.getenv("AGENTTREE_STUDIO_ADMIN_USERNAME", "admin"),
                    os.getenv("AGENTTREE_STUDIO_ADMIN_PASSWORD", "admin"),
                )
            with startup_step("reconcile"):
                from backend.services.async_runs import reconcile_interrupted_runs
                reconcile_interrupted_runs(database)
    try:
        yield
    finally:
        from backend.services.async_runs import shutdown_async_run_coordinator
        from backend.services.core_runtime import shutdown_studio_runtime
        shutdown_async_run_coordinator()
        shutdown_studio_runtime()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)


@app.exception_handler(ServiceError)
async def handle_service_error(request: Request, exc: ServiceError) -> JSONResponse:
    if request.url.path.startswith(("/api/v1/", "/api/v2/")):
        return public_error(request, exc.status_code, getattr(exc, "error_code", "request_failed").lower(), str(exc))
    content: dict = {"detail": str(exc)}
    if hasattr(exc, "error_code"):
        content["error"] = {"code": exc.error_code, "message": str(exc)}
    return JSONResponse(status_code=exc.status_code, content=content)


@app.exception_handler(RequestValidationError)
async def handle_validation_error(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    """Return useful validation errors without echoing submitted credentials."""
    safe_errors = [
        {key: value for key, value in error.items() if key not in ("input", "ctx")}
        for error in exc.errors()
    ]
    if request is not None and request.url.path.startswith(("/api/v1/", "/api/v2/")):
        return public_error(request, 422, "validation_error", "Request validation failed.")
    return JSONResponse(status_code=422, content={"detail": safe_errors})


@app.exception_handler(PublicAPIError)
async def handle_public_error(request: Request, exc: PublicAPIError) -> JSONResponse:
    return public_error(request, exc.status_code, exc.code, exc.message)


@app.exception_handler(FastAPIHTTPException)
async def handle_http_error(request: Request, exc: FastAPIHTTPException) -> JSONResponse:
    if request.url.path.startswith(("/api/v1/", "/api/v2/")):
        return public_error(request, exc.status_code, "resource_not_found" if exc.status_code == 404 else "request_failed", "Resource not found." if exc.status_code == 404 else "Request failed.")
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(Exception)
async def handle_unexpected_error(request: Request, _: Exception) -> JSONResponse:
    if request.url.path.startswith(("/api/v1/", "/api/v2/")):
        return public_error(request, 500, "internal_error", "An internal error occurred.")
    return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(AuthMiddleware)
app.add_middleware(PublicCORSMiddleware)

app.include_router(auth_router, prefix="/api")
app.include_router(public_v1_router)
app.include_router(public_v2_router)
app.include_router(studio_runs_router, prefix="/api")
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
