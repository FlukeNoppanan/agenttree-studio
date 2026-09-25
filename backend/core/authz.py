"""Fail-closed API authorization at the HTTP boundary."""

import re
from uuid import uuid4

from fastapi import Request
from fastapi.responses import JSONResponse

from backend.db.session import SessionLocal
from backend.core.config import settings
from backend.core.public_api import rate_limited
from backend.services.auth_service import AuthService, COOKIE_NAME


def required_access(path: str, method: str) -> tuple[str, str | None] | None:
    """Return the sole authorization policy for every Studio API route."""
    if path == "/api/v1/health" and method == "GET":
        return None
    if path.startswith("/api/v1/"):
        return ("public_api", None)
    if path in {"/api/health", "/api/system-health", "/api/auth/login"}:
        return None
    if path in {"/api/auth/me", "/api/auth/account", "/api/auth/logout", "/api/auth/change-password"}:
        return ("authenticated", None)
    if path.startswith("/api/auth/tokens"):
        return ("use_trees", None)
    if path == "/api/me/trees":
        return ("use_trees", None)
    if path.startswith("/api/users"):
        return ("admin", None)
    if path == "/api/security-events":
        return ("admin", None)
    if path == "/api/dashboard/summary":
        return ("admin", None)
    if path == "/api/dashboard/me":
        return ("authenticated", None)
    for prefix, permission in (
        ("/api/secrets", "manage_secrets"),
        ("/api/providers", "manage_providers_models"),
        ("/api/tools", "manage_tools_mcp"),
        ("/api/capabilities", "manage_trees_agents"),
        ("/api/runs", "view_executions"),
    ):
        if path == prefix or path.startswith(prefix + "/"):
            return (permission, None)
    if path.startswith("/api/runtime/trees/") and path.endswith("/invoke") and method == "POST":
        return ("tree_use", path.split("/")[4])
    if path.startswith("/api/trees/"):
        pieces = path.split("/")
        tree_id = pieces[3]
        if len(pieces) == 5 and pieces[4] in {"runs", "live"} and method == "GET":
            return ("view_executions", None)
        if len(pieces) == 5 and pieces[4] == "test-run" and method == "POST":
            return ("tree_use", tree_id)
    if path == "/api/trees" or path.startswith("/api/trees/"):
        return ("manage_trees_agents", None)
    return ("deny", None)


class AuthMiddleware:
    """Pure ASGI middleware so authentication state survives endpoint execution."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        request = Request(scope, receive)
        path = request.url.path.rstrip("/") or "/"
        if not path.startswith("/api/") or request.method == "OPTIONS":
            await self.app(scope, receive, send)
            return
        policy = required_access(path, request.method)
        if path.startswith("/api/v1/"):
            incoming_id = request.headers.get("x-request-id", "")
            request_id = incoming_id if re.fullmatch(r"[A-Za-z0-9._:-]{1,64}", incoming_id) else f"req_{uuid4().hex}"
            request.state.request_id = request_id

            async def send_with_id(message):
                if message["type"] == "http.response.start":
                    message.setdefault("headers", []).append((b"x-request-id", request_id.encode()))
                await send(message)

            async def public_reject(code: int, error_code: str, message: str):
                await JSONResponse({"error": {"code": error_code, "message": message, "request_id": request_id}},
                                   status_code=code)(scope, receive, send_with_id)

            if path == "/api/v1/health" and request.method == "GET":
                await self.app(scope, receive, send_with_id)
                return
            bearer = request.headers.get("authorization", "")
            if not bearer or not re.fullmatch(r"Bearer ats_[A-Za-z0-9_-]{10,100}", bearer):
                if rate_limited("auth", request.client.host if request.client else "unknown", limit=30):
                    await public_reject(429, "rate_limited", "Too many authentication attempts.")
                else:
                    await public_reject(401, "authentication_required" if not bearer else "invalid_api_key", "A valid API key is required.")
                return
            with SessionLocal() as database:
                service = AuthService(database)
                resolved = service.resolve_token(bearer[7:])
                if resolved is None:
                    if rate_limited("auth", request.client.host if request.client else "unknown", limit=30):
                        await public_reject(429, "rate_limited", "Too many authentication attempts.")
                    else:
                        await public_reject(401, "invalid_api_key", "A valid API key is required.")
                    return
                user, token = resolved
                if path.endswith("/invoke") and request.method == "POST" and rate_limited("invoke", token.id, limit=30):
                    await public_reject(429, "rate_limited", "Too many invocation requests.")
                    return
                service.mark_token_used(token)
                request.state.user_id = user.id
                request.state.api_token_id = token.id
            await self.app(scope, receive, send_with_id)
            return
        if policy is None:
            await self.app(scope, receive, send)
            return

        async def reject(code: int, detail: str, *, reason: str | None = None):
            payload = {"detail": detail}
            if reason:
                payload["code"] = reason
            await JSONResponse(payload, status_code=code)(scope, receive, send)

        with SessionLocal() as database:
            service = AuthService(database)
            bearer = request.headers.get("authorization", "")
            is_runtime = path.startswith("/api/runtime/")
            session = None
            if bearer:
                user = service.token_user(bearer[7:]) if is_runtime and bearer.startswith("Bearer ") else None
            else:
                resolved = service.session_user(request.cookies[COOKIE_NAME]) if COOKIE_NAME in request.cookies else None
                user, session = resolved if resolved else (None, None)
            if user is None:
                await reject(401, "Authentication required")
                return
            if session is not None and request.method not in {"GET", "HEAD", "OPTIONS"}:
                origin = request.headers.get("origin")
                fetch_site = request.headers.get("sec-fetch-site")
                allowed_origins = {str(request.base_url).rstrip("/"), *settings.cors_origins}
                if (origin and origin not in allowed_origins) or fetch_site == "cross-site":
                    await reject(403, "Cross-origin request denied")
                    return
            if user.must_change_password and path not in {"/api/auth/me", "/api/auth/change-password", "/api/auth/logout"}:
                await reject(403, "Password change required", reason="PASSWORD_CHANGE_REQUIRED")
                return
            need, tree_id = policy
            if need == "deny":
                await reject(403, "Access denied")
                return
            if not user.is_admin:
                permissions = {item.permission for item in user.permissions}
                allowed = need == "authenticated" or need in permissions
                if need == "tree_use":
                    allowed = service.can_use_tree(user, tree_id)
                if not allowed:
                    await reject(403, "Access denied")
                    return
            request.state.user_id = user.id
            request.state.session_id = session.id if session else None
            await self.app(scope, receive, send)
