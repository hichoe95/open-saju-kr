import asyncio
import logging
import os
import time
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from .config import get_settings
from .api.reading import router as reading_router
from .api.decision import router as decision_router
from .api.flow import router as flow_router
from .api.compatibility import router as compatibility_router
from .api.compatibility_save import router as compatibility_save_router
from .api.auth import router as auth_router
from .api.consent import router as consent_router
from .api.profile import router as profile_router
from .api.profile_share import router as profile_share_router
from .api.received_profiles import router as received_profiles_router
from .api.share import router as share_router
from .api.payment import router as payment_router
from .api.streak import router as streak_router
from .api.feedback import router as feedback_router
from .api.image import router as image_router
from .api.stats import router as stats_router
from .api.admin import router as admin_router
from .api.analytics import router as analytics_router
from .api.daily_fortune import router as daily_fortune_router
from .api.webhook import router as webhook_router
from .api.vs_battle import router as vs_battle_router
from .api.past_timeline import router as past_timeline_router
from .api.chat import router as chat_router
from .api.push import router as push_router
from .api.referral import router as referral_router
from .middleware.csrf_guard import CSRFCookieGuardMiddleware

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("사주 웹앱 API 서버 시작!")
    logger.info("API 문서: http://localhost:8003/docs")

    from .services.scheduler_service import start_scheduler, stop_scheduler
    from .services.compatibility_job_service import reconcile_stale_compatibility_jobs
    from .services.notification_service import notifier
    from .api.admin import sync_admin_users_from_env

    await sync_admin_users_from_env()
    start_scheduler()
    asyncio.create_task(reconcile_stale_compatibility_jobs())

    env = os.environ.get("ENV", "development")
    asyncio.create_task(notifier.notify_server_start(env))

    yield

    stop_scheduler()
    logger.info("사주 웹앱 API 서버 종료")


def _is_production() -> bool:
    env = os.environ.get("ENV", "development").lower()
    return env in ("production", "prod")


class RequestTimeoutMiddleware(BaseHTTPMiddleware):
    """글로벌 요청 타임아웃 미들웨어 (REL-P1-03)"""

    def __init__(self, app, timeout_seconds: int = 60):
        super().__init__(app)
        self.timeout_seconds = timeout_seconds

    async def dispatch(self, request: Request, call_next) -> Response:
        try:
            response = await asyncio.wait_for(
                call_next(request), timeout=self.timeout_seconds
            )
            return response
        except asyncio.TimeoutError:
            logger.error(
                f"[TIMEOUT] Request timed out after {self.timeout_seconds}s: "
                f"{request.method} {request.url.path}"
            )
            return JSONResponse(
                status_code=504, content={"detail": "Request timed out"}
            )


class RequestIDMiddleware(BaseHTTPMiddleware):
    """요청 추적용 ID 미들웨어 (REL-P3-01)"""

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    EXCLUDED_PATHS = frozenset({"/", "/docs", "/redoc", "/openapi.json"})

    async def dispatch(self, request: Request, call_next) -> Response:
        if request.url.path in self.EXCLUDED_PATHS:
            return await call_next(request)

        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        start = time.monotonic()
        response = await call_next(request)
        elapsed_ms = int((time.monotonic() - start) * 1000)

        asyncio.create_task(
            self._log_request(request, response, elapsed_ms, request_id)
        )
        return response

    async def _log_request(
        self, request: Request, response: Response, elapsed_ms: int, request_id: str
    ) -> None:
        try:
            user_id = self._extract_user_id(request)
            ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (
                request.client.host if request.client else None
            )
            ua = (request.headers.get("user-agent") or "")[:500]
            error_detail = None
            if response.status_code >= 400:
                error_detail = f"HTTP {response.status_code}"[:1000]

            from .db.supabase_client import supabase, db_execute

            await db_execute(
                lambda: (
                    supabase.table("user_api_logs")
                    .insert(
                        {
                            "user_id": user_id,
                            "method": request.method,
                            "path": request.url.path[:500],
                            "status_code": response.status_code,
                            "response_time_ms": elapsed_ms,
                            "ip_address": ip,
                            "user_agent": ua,
                            "request_id": request_id,
                            "error_detail": error_detail,
                        }
                    )
                    .execute()
                )
            )
        except Exception:
            logger.warning(
                "[REQUEST_LOG] Failed to log request: %s %s",
                request.method,
                request.url.path,
            )

    @staticmethod
    def _extract_user_id(request: Request) -> str | None:
        auth_header = request.headers.get("authorization", "")
        if not auth_header.startswith("Bearer "):
            return None
        token = auth_header[7:]
        try:
            from jose import jwt
            from .config import get_settings

            settings = get_settings()
            payload = jwt.decode(token, settings.jwt_secret_key, algorithms=["HS256"])
            return payload.get("sub")
        except Exception:
            return None


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses"""

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        # Prevent MIME type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"
        # Prevent clickjacking
        response.headers["X-Frame-Options"] = "DENY"
        # XSS protection (legacy browsers)
        response.headers["X-XSS-Protection"] = "1; mode=block"
        # Referrer policy
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        # Permissions policy (disable unnecessary features)
        response.headers["Permissions-Policy"] = (
            "geolocation=(), microphone=(), camera=()"
        )
        # Content Security Policy - API server default (no inline scripts/styles)
        response.headers["Content-Security-Policy"] = (
            "default-src 'none'; frame-ancestors 'none'"
        )
        # HSTS - Force HTTPS in production (1 year, include subdomains)
        if _is_production():
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains; preload"
            )
        return response


# Disable API docs in production for security
_docs_url = None if _is_production() else "/docs"
_redoc_url = None if _is_production() else "/redoc"

# TODO OPS-7: Migrate to structured logging (JSON format) for production.
# TODO OPS-7: Consider: python-json-logger or structlog for better log aggregation.
# TODO OPS-10: Add graceful shutdown handler to complete in-flight requests.
# TODO OPS-10: Consider: signal handlers + asyncio shutdown timeout.
# TODO OPS-14: Configure log rotation (RotatingFileHandler or external log management).
# TODO OPS-15: Document deployment rollback procedure.
# TODO OPS-15: Railway: revert to previous deployment. Vercel: revert to previous build.

app = FastAPI(
    title="사주 웹앱 API",
    description="한국 명리학 기반 사주 리딩 서비스 API",
    version="1.0.0",
    docs_url=_docs_url,
    redoc_url=_redoc_url,
    lifespan=lifespan,
)

# CORS 설정 (강화된 검증)
settings = get_settings()
origins = [
    origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()
]

if "*" in origins:
    if _is_production():
        raise RuntimeError(
            "[SECURITY] CORS wildcard (*) is BLOCKED in production. "
            "Configure CORS_ORIGINS with specific allowed origins."
        )
    logger.warning("CORS wildcard (*) detected - allowed in development only")
    allow_credentials = False
else:
    allow_credentials = True

cors_allow_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
cors_allow_headers = [
    "Authorization",
    "Content-Type",
    "Accept",
    "Origin",
    "X-Requested-With",
]

logger.info(f"Allowed Origins (CORS): {origins}")

allowed_hosts = (
    [host.strip() for host in settings.allowed_hosts.split(",") if host.strip()]
    if settings.allowed_hosts
    else ["*"]
)

if "*" in allowed_hosts and _is_production():
    raise RuntimeError(
        "[SECURITY] ALLOWED_HOSTS wildcard (*) is BLOCKED in production. "
        "Configure ALLOWED_HOSTS with specific allowed hosts."
    )

# Middleware Order (LIFO: Last added = First to process requests, Last to process responses)
# CRITICAL: CORSMiddleware must be LAST (outermost) to always add CORS headers
# Request flow:  CORSMiddleware → SecurityHeaders → RequestID → RequestTimeout → RequestLogging → TrustedHost → Routes
# Response flow: Routes → TrustedHost → RequestLogging → RequestTimeout → RequestID → SecurityHeaders → CORSMiddleware

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=allowed_hosts,
)

app.add_middleware(RequestLoggingMiddleware)

app.add_middleware(RequestTimeoutMiddleware, timeout_seconds=60)

app.add_middleware(RequestIDMiddleware)

app.add_middleware(CSRFCookieGuardMiddleware)

app.add_middleware(SecurityHeadersMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=allow_credentials,
    allow_methods=cors_allow_methods,
    allow_headers=cors_allow_headers,
)

# 라우터 등록
app.include_router(reading_router, prefix="/api")
app.include_router(decision_router, prefix="/api")
app.include_router(flow_router, prefix="/api")
app.include_router(compatibility_router, prefix="/api")
app.include_router(compatibility_save_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(consent_router, prefix="/api")
app.include_router(profile_router, prefix="/api")
app.include_router(profile_share_router, prefix="/api")
app.include_router(received_profiles_router, prefix="/api")
app.include_router(share_router, prefix="/api")
app.include_router(payment_router, prefix="/api")
app.include_router(image_router, prefix="/api")
app.include_router(streak_router, prefix="/api")
app.include_router(feedback_router, prefix="/api")
app.include_router(stats_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(analytics_router, prefix="/api")
app.include_router(daily_fortune_router)  # prefix already set in router
app.include_router(webhook_router, prefix="/api")
app.include_router(vs_battle_router, prefix="/api")
app.include_router(past_timeline_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(push_router, prefix="/api")
app.include_router(referral_router, prefix="/api")


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    missing_fields = [
        e.get("loc", [])[-1] for e in errors if e.get("type") == "missing"
    ]
    field_names = (
        ", ".join(str(f) for f in missing_fields) if missing_fields else "unknown"
    )
    logger.warning(
        "Validation error on %s %s: missing=[%s], error_count=%d",
        request.method,
        request.url.path,
        field_names,
        len(errors),
    )

    origin = request.headers.get("origin")
    try:
        detail = jsonable_encoder(errors)
    except Exception:
        logger.exception(
            "Failed to encode validation errors for %s %s",
            request.method,
            request.url.path,
        )
        detail = [{"type": "validation_error", "msg": "Request validation failed"}]

    response = JSONResponse(status_code=422, content={"detail": detail})

    if origin and origin in origins:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Credentials"] = (
            "true" if allow_credentials else "false"
        )
        response.headers["Access-Control-Allow-Methods"] = ", ".join(cors_allow_methods)
        response.headers["Access-Control-Allow-Headers"] = ", ".join(cors_allow_headers)

    return response


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    origin = request.headers.get("origin")
    logger.error(f"Unhandled exception: {exc}", exc_info=True)

    response = JSONResponse(
        status_code=500, content={"detail": "Internal server error"}
    )

    if origin and origin in origins:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Credentials"] = (
            "true" if allow_credentials else "false"
        )
        response.headers["Access-Control-Allow-Methods"] = ", ".join(cors_allow_methods)
        response.headers["Access-Control-Allow-Headers"] = ", ".join(cors_allow_headers)

    return response


@app.get("/")
async def root():
    """루트 엔드포인트"""
    return {
        "service": "사주 웹앱 API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/api/health",
    }
