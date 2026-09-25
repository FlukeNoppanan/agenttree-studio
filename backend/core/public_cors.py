"""Bearer-only CORS allowlist for v1 without widening Studio cookie CORS."""

from starlette.responses import Response

from backend.core.config import settings


class PublicCORSMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not scope.get("path", "").startswith("/api/v1/"):
            await self.app(scope, receive, send)
            return
        headers = {key.lower(): value.decode("latin1") for key, value in scope.get("headers", [])}
        origin = headers.get(b"origin")
        allowed = origin in settings.public_api_cors_origins and origin not in settings.cors_origins
        if scope["method"] == "OPTIONS" and b"access-control-request-method" in headers:
            if not allowed:
                await Response(status_code=403)(scope, receive, send)
                return
            await Response(status_code=204, headers={
                "Access-Control-Allow-Origin": origin,
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Request-ID",
                "Access-Control-Max-Age": "600",
                "Vary": "Origin",
            })(scope, receive, send)
            return

        async def send_cors(message):
            if allowed and message["type"] == "http.response.start":
                message.setdefault("headers", []).extend([
                    (b"access-control-allow-origin", origin.encode("latin1")),
                    (b"vary", b"Origin"),
                ])
            await send(message)

        await self.app(scope, receive, send_cors)
