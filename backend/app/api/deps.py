from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from ..core.security import decode_access_token
from ..config import get_settings
import time
import logging
import threading
import ipaddress
import math
from typing import Any, Optional

logger = logging.getLogger(__name__)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")
oauth2_scheme_optional = OAuth2PasswordBearer(
    tokenUrl="api/auth/login", auto_error=False
)
ACCESS_TOKEN_COOKIE_KEY = "access_token"

# In-memory rate limit store with cleanup
_rate_limit_store: dict[str, list[float]] = {}
_rate_limit_lock = threading.Lock()

# Redis client (lazy initialization)
_redis_client: Optional[Any] = None
_redis_initialized: bool = False


def _get_redis_client() -> Optional[Any]:
    """Get Redis client with lazy initialization"""
    global _redis_client, _redis_initialized
    if _redis_initialized:
        return _redis_client

    _redis_initialized = True
    settings = get_settings()
    if not settings.redis_url:
        logger.info("Redis URL not configured, using in-memory rate limiting")
        return None

    try:
        import redis

        redis_client = redis.from_url(settings.redis_url, decode_responses=True)
        redis_client.ping()  # Test connection
        _redis_client = redis_client
        logger.info("Redis connected for rate limiting")
        return redis_client
    except Exception as e:
        logger.warning(f"Redis connection failed, falling back to in-memory: {e}")
        return None


def _extract_token_from_request(
    request: Request, header_token: Optional[str] = None
) -> tuple[Optional[str], Optional[str]]:
    if header_token:
        return header_token, "header"

    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()
        if token:
            return token, "header"

    cookie_token = request.cookies.get(ACCESS_TOKEN_COOKIE_KEY)
    if cookie_token:
        return cookie_token, "cookie"

    return None, None


def _extract_user_id_from_request(request: Request) -> str | None:
    token, _ = _extract_token_from_request(request)
    if not token:
        return None

    payload = decode_access_token(token)
    if not payload:
        return None
    return payload.get("sub")


def _get_client_ip(request: Request) -> str:
    """
    프록시 환경을 고려한 클라이언트 IP 추출

    TRUSTED_PROXY_CIDRS가 설정된 경우에만 X-Forwarded-For를 신뢰한다.
    X-Forwarded-For 형식: "client, proxy1, proxy2"
    마지막(우측)부터 검사하여 첫 번째 non-trusted IP를 클라이언트 IP로 사용한다.
    """
    settings = get_settings()
    client = request.client
    if client is None:
        direct_ip = "unknown"
    else:
        direct_ip = client.host

    trusted_proxy_cidrs = [
        cidr.strip() for cidr in settings.trusted_proxy_cidrs.split(",") if cidr.strip()
    ]
    if not trusted_proxy_cidrs:
        return direct_ip

    forwarded = request.headers.get("X-Forwarded-For")
    if not forwarded:
        return direct_ip

    ips = [ip.strip() for ip in forwarded.split(",") if ip.strip()]
    if not ips:
        return direct_ip

    trusted_networks = []
    for cidr in trusted_proxy_cidrs:
        try:
            trusted_networks.append(ipaddress.ip_network(cidr, strict=False))
        except ValueError:
            logger.warning(
                "[RATE LIMIT] Invalid TRUSTED_PROXY_CIDRS entry ignored: %s", cidr
            )

    if not trusted_networks:
        return direct_ip

    for ip_text in reversed(ips):
        try:
            ip_addr = ipaddress.ip_address(ip_text)
        except ValueError:
            continue

        if any(ip_addr in network for network in trusted_networks):
            continue
        return ip_text

    return direct_ip


def _cleanup_old_entries(window_start: float):
    """Clean up old entries from in-memory store"""
    with _rate_limit_lock:
        keys_to_delete = []
        for key, timestamps in _rate_limit_store.items():
            _rate_limit_store[key] = [t for t in timestamps if t > window_start]
            if not _rate_limit_store[key]:
                keys_to_delete.append(key)
        for key in keys_to_delete:
            del _rate_limit_store[key]


def _build_rate_limit_headers(
    window_seconds: int, retry_after: Optional[int] = None
) -> dict[str, str]:
    wait_seconds = (
        retry_after
        if isinstance(retry_after, int) and retry_after > 0
        else window_seconds
    )
    return {
        "Retry-After": str(max(1, wait_seconds)),
    }


def rate_limit_dependency(limit: int, window_seconds: int = 60, scope: str = "default"):
    """
    Rate limiting dependency with Redis support and in-memory fallback.
    Uses sliding window algorithm.
    """

    async def _rate_limit(request: Request):
        settings = get_settings()
        identifier = _extract_user_id_from_request(request) or _get_client_ip(request)
        key = f"ratelimit:{scope}:{identifier}"
        now = time.time()
        window_start = now - window_seconds
        protected_scopes = {
            "payment_prepare",
            "payment_spend",
            "payment_confirm",
            "webhook_toss",
            "share_create",
            "share_compatibility_create",
            "share_code_redeem",
            "share_quick_compat",
            "fortune_generate",
            "decision",
        }

        redis_client = _get_redis_client()

        if (
            redis_client is None
            and settings.require_redis_for_payment_rate_limit
            and scope in protected_scopes
        ):
            logger.error("[RATE LIMIT] Redis unavailable for protected scope=%s", scope)
            raise HTTPException(
                status_code=503, detail="Rate limit backend unavailable"
            )

        if redis_client:
            # Redis-based rate limiting (sliding window)
            try:
                pipe = redis_client.pipeline()
                pipe.zremrangebyscore(key, 0, window_start)
                pipe.zcard(key)
                pipe.zadd(key, {str(now): now})
                pipe.expire(key, window_seconds + 1)
                results = pipe.execute()
                request_count = results[1]

                if request_count >= limit:
                    retry_after = window_seconds
                    try:
                        oldest = redis_client.zrange(key, 0, 0, withscores=True)
                        if oldest:
                            oldest_timestamp = float(oldest[0][1])
                            elapsed = max(0.0, now - oldest_timestamp)
                            retry_after = max(
                                1, int(math.ceil(window_seconds - elapsed))
                            )
                    except Exception:
                        retry_after = window_seconds

                    raise HTTPException(
                        status_code=429,
                        detail="Too many requests",
                        headers=_build_rate_limit_headers(window_seconds, retry_after),
                    )
                return
            except HTTPException:
                raise
            except Exception as e:
                logger.warning(f"Redis rate limit error, falling back to memory: {e}")
                if (
                    settings.require_redis_for_payment_rate_limit
                    and scope in protected_scopes
                ):
                    logger.error(
                        "[RATE LIMIT] Redis unavailable for protected scope=%s", scope
                    )
                    raise HTTPException(
                        status_code=503, detail="Rate limit backend unavailable"
                    )

        # In-memory fallback with thread safety
        with _rate_limit_lock:
            timestamps = _rate_limit_store.get(key, [])
            timestamps = [t for t in timestamps if t > window_start]
            if len(timestamps) >= limit:
                oldest_timestamp = timestamps[0] if timestamps else now
                elapsed = max(0.0, now - oldest_timestamp)
                retry_after = max(1, int(math.ceil(window_seconds - elapsed)))
                raise HTTPException(
                    status_code=429,
                    detail="Too many requests",
                    headers=_build_rate_limit_headers(window_seconds, retry_after),
                )
            timestamps.append(now)
            _rate_limit_store[key] = timestamps

        # Periodic cleanup (every 100 requests approximately)
        if len(_rate_limit_store) > 100:
            _cleanup_old_entries(window_start)

        if len(_rate_limit_store) > 50000:
            with _rate_limit_lock:
                _rate_limit_store.clear()
            logger.error("[RATE LIMIT] Cleared in-memory store due to hard cap")

    return _rate_limit


async def get_current_user_id(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme_optional),
) -> str:
    resolved_token, token_source = _extract_token_from_request(request, token)
    if not resolved_token:
        logger.info(
            "[AUTH] credentials rejected: reason=missing_token path=%s token_source=none",
            request.url.path,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(resolved_token)
    if not payload:
        logger.info(
            "[AUTH] credentials rejected: reason=invalid_or_expired_token path=%s token_source=%s",
            request.url.path,
            token_source,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    sub = payload.get("sub")
    if not sub:
        logger.warning(
            "[AUTH] credentials rejected: reason=missing_sub path=%s token_source=%s",
            request.url.path,
            token_source,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing subject",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return sub


async def get_optional_user_id(request: Request) -> Optional[str]:
    """
    Optional authentication - returns user_id if valid token present, None otherwise.
    Never raises 401.
    """
    return _extract_user_id_from_request(request)


async def get_current_user_required(request: Request) -> dict:
    """
    인증 필수 dependency - 로그인한 사용자만 접근 가능
    Returns: {"user_id": str, "provider": str, ...}
    """
    token, _ = _extract_token_from_request(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="로그인이 필요합니다",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(token)

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="토큰이 만료되었거나 유효하지 않습니다",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return {
        "user_id": payload.get("sub"),
        "provider": payload.get("provider"),
    }
