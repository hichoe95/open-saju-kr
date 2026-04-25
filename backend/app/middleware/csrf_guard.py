from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response

from ..config import get_settings


class CSRFCookieGuardMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        settings = get_settings()
        self._allowed_origins = {
            origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()
        }

    async def dispatch(self, request: Request, call_next) -> Response:
        method = request.method.upper()
        if method in {"GET", "HEAD", "OPTIONS"}:
            return await call_next(request)

        path = request.url.path
        if path.startswith("/api/webhook"):
            return await call_next(request)

        authorization = request.headers.get("Authorization", "")
        if authorization.lower().startswith("bearer "):
            return await call_next(request)

        access_cookie = request.cookies.get("access_token")
        if not access_cookie:
            return await call_next(request)

        origin = request.headers.get("Origin")
        # If origin is provided, check if it's in allowlist
        if origin:
            if "*" not in self._allowed_origins and origin not in self._allowed_origins:
                return JSONResponse({"detail": "CSRF blocked"}, status_code=403)
            # Origin is in allowlist, allow the request
            return await call_next(request)

        # No origin header, check Sec-Fetch-Site for cross-site requests
        sec_fetch_site = request.headers.get("Sec-Fetch-Site")
        if sec_fetch_site == "cross-site":
            return JSONResponse({"detail": "CSRF blocked"}, status_code=403)

        return await call_next(request)
