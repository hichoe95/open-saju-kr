import logging
import os
from fastapi import APIRouter, Depends, HTTPException, Security, Request, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from typing import Literal, Optional
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse
import httpx
import hashlib
import hmac as hmac_module
from jose import jwt, JWTError

from ..core.security import (
    create_access_token,
    decode_access_token,
    create_oauth_state,
    verify_oauth_state,
    hmac_provider_id,
    crypto_manager,
    CURRENT_KEY_VERSION,
    create_refresh_token,
    REFRESH_TOKEN_EXPIRE_DAYS,
    add_to_blacklist,
)
from .deps import rate_limit_dependency
from ..config import get_settings
from ..db.supabase_client import supabase, db_execute
from ..services.config_service import config_service
from ..services.analytics_service import analytics
from .referral import process_referral_reward

logger = logging.getLogger(__name__)

TABLE_IDENTITIES = "user_identities"
TABLE_SIGNUP = "user_signup_profiles"


router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()
security = HTTPBearer(auto_error=False)
ACCESS_TOKEN_COOKIE_KEY = "access_token"
REFRESH_TOKEN_COOKIE_KEY = "refresh_token"


def _is_local_hostname(hostname: Optional[str]) -> bool:
    if not hostname:
        return False

    normalized = hostname.strip().lower()
    return normalized in {
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
        "::1",
    } or normalized.endswith(".localhost")


def _is_request_https(request: Optional[Request]) -> bool:
    if request is None:
        return False

    forwarded_proto = request.headers.get("x-forwarded-proto", "")
    if forwarded_proto:
        primary_proto = forwarded_proto.split(",", 1)[0].strip().lower()
        if primary_proto:
            return primary_proto == "https"

    return request.url.scheme == "https"


def _has_https_origin_config() -> bool:
    origins = [
        origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()
    ]
    for origin in origins:
        parsed = urlparse(origin)
        if parsed.scheme == "https" and not _is_local_hostname(parsed.hostname):
            return True
    return False


def _is_secure_cookie(request: Optional[Request] = None) -> bool:
    env = os.environ.get("ENV", "development").lower()
    if env in ("production", "prod"):
        return True
    if _is_request_https(request):
        return True
    return _has_https_origin_config()


def _cookie_samesite(secure_cookie: bool) -> Literal["lax", "none"]:
    return "none" if secure_cookie else "lax"


def _set_auth_cookies(
    response: Response,
    access_token: str,
    refresh_token: Optional[str] = None,
    request: Optional[Request] = None,
) -> None:
    secure_cookie = _is_secure_cookie(request)
    same_site = _cookie_samesite(secure_cookie)
    logger.info(
        "[AUTH] set cookies secure=%s samesite=%s env=%s request_https=%s",
        secure_cookie,
        same_site,
        os.environ.get("ENV", "development").lower(),
        _is_request_https(request),
    )
    response.set_cookie(
        key=ACCESS_TOKEN_COOKIE_KEY,
        value=access_token,
        max_age=settings.access_token_expire_minutes * 60,
        httponly=True,
        secure=secure_cookie,
        samesite=same_site,
        path="/",
    )

    if refresh_token:
        response.set_cookie(
            key=REFRESH_TOKEN_COOKIE_KEY,
            value=refresh_token,
            max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
            httponly=True,
            secure=secure_cookie,
            samesite=same_site,
            path="/",
        )


def _clear_auth_cookies(response: Response, request: Optional[Request] = None) -> None:
    secure_cookie = _is_secure_cookie(request)
    same_site = _cookie_samesite(secure_cookie)
    response.delete_cookie(
        key=ACCESS_TOKEN_COOKIE_KEY,
        path="/",
        secure=secure_cookie,
        httponly=True,
        samesite=same_site,
    )
    response.delete_cookie(
        key=REFRESH_TOKEN_COOKIE_KEY,
        path="/",
        secure=secure_cookie,
        httponly=True,
        samesite=same_site,
    )


class AuthCallbackRequest(BaseModel):
    code: str = Field(..., max_length=2048)
    redirect_uri: str = Field(..., max_length=500)
    state: Optional[str] = Field(None, max_length=500)


class OAuthProfile(BaseModel):
    """OAuth에서 가져온 프로필 정보 (첫 가입 시 폼 미리 채우기용)"""

    name: Optional[str] = None
    email: Optional[str] = None
    birthday: Optional[str] = None  # 향후 OAuth 승인 후 사용 (MMDD 또는 MM-DD)
    birthyear: Optional[str] = None  # 향후 OAuth 승인 후 사용 (YYYY)
    gender: Optional[str] = None  # 향후 OAuth 승인 후 사용 (male/female 또는 M/F)


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    user_id: str
    is_new: bool
    oauth_profile: Optional[OAuthProfile] = None  # 첫 가입 시에만 포함


class RefreshRequest(BaseModel):
    refresh_token: Optional[str] = Field(None, max_length=2048)


class UserInfo(BaseModel):
    """Current user information"""

    user_id: str
    provider: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    profile_image: Optional[str] = None


def _normalize_redirect_uri(uri: str) -> Optional[str]:
    value = (uri or "").strip()
    if not value:
        return None

    try:
        parsed = urlparse(value)
    except Exception:
        return None

    if not parsed.scheme or not parsed.netloc:
        return None
    if parsed.fragment:
        return None

    path = parsed.path or "/"
    normalized = f"{parsed.scheme.lower()}://{parsed.netloc.lower()}{path}"
    if parsed.query:
        normalized = f"{normalized}?{parsed.query}"
    return normalized


def _parse_allowed_redirect_uris() -> list[str]:
    allowlist: list[str] = []

    raw_allowlist: list[str] = []
    if settings.oauth_redirect_uri_allowlist:
        raw_allowlist.extend(
            [
                o.strip()
                for o in settings.oauth_redirect_uri_allowlist.split(",")
                if o.strip()
            ]
        )
    if settings.oauth_redirect_allowlist:
        raw_allowlist.extend(
            [
                o.strip()
                for o in settings.oauth_redirect_allowlist.split(",")
                if o.strip()
            ]
        )

    for raw in raw_allowlist:
        if raw == "*":
            allowlist.append(raw)
            continue

        normalized = _normalize_redirect_uri(raw)
        if normalized:
            allowlist.append(normalized)

    return list(dict.fromkeys(allowlist))


def _is_allowed_redirect_uri(redirect_uri: str) -> bool:
    normalized_redirect_uri = _normalize_redirect_uri(redirect_uri)
    if not normalized_redirect_uri:
        return False

    allowlist = _parse_allowed_redirect_uris()

    if "*" in allowlist:
        import logging
        import os

        env = os.environ.get("ENV", "development")
        if env in ("production", "prod"):
            logging.error(
                "[SECURITY] Wildcard (*) blocked in production. Configure OAUTH_REDIRECT_ALLOWLIST properly."
            )
            return False
        logging.warning(
            f"[SECURITY] Wildcard (*) in redirect allowlist (dev only). URI: {redirect_uri}"
        )
        return True

    for allowed in allowlist:
        if normalized_redirect_uri == allowed:
            return True
    return False


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[dict]:
    """
    Dependency to get current user from JWT token.
    Returns None if no valid token.
    """
    token = (
        credentials.credentials
        if credentials
        else request.cookies.get(ACCESS_TOKEN_COOKIE_KEY)
    )
    if not token:
        return None

    payload = decode_access_token(token)

    if not payload:
        return None

    user_id = payload.get("sub")
    if not user_id:
        return None

    return {"user_id": user_id, "payload": payload}


async def require_auth(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    """
    Dependency that requires authentication.
    Raises 401 if not authenticated.
    """
    user = await get_current_user(request, credentials)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


async def get_kakao_user_info(code: str, redirect_uri: str) -> dict:
    async with httpx.AsyncClient() as client:
        # 1. Token Exchange
        token_data = {
            "grant_type": "authorization_code",
            "client_id": settings.kakao_client_id,
            "redirect_uri": redirect_uri,
            "code": code,
        }

        # Only include client_secret if it's configured
        if settings.kakao_client_secret:
            token_data["client_secret"] = settings.kakao_client_secret

        token_res = await client.post(
            "https://kauth.kakao.com/oauth/token",
            data=token_data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

        if token_res.status_code != 200:
            logger.error(f"[KAKAO TOKEN ERROR] status={token_res.status_code}")
            raise HTTPException(
                status_code=400, detail="카카오 인증에 실패했습니다. 다시 시도해주세요."
            )

        token_data = token_res.json()
        access_token = token_data.get("access_token")

        # 2. User Info
        user_res = await client.get(
            "https://kapi.kakao.com/v2/user/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )

        if user_res.status_code != 200:
            raise HTTPException(status_code=400, detail="Kakao User Info Error")

        user_data = user_res.json()
        kakao_account = user_data.get("kakao_account", {})

        birthday = kakao_account.get("birthday")
        birthyear = kakao_account.get("birthyear")
        gender_raw = kakao_account.get("gender")
        gender = gender_raw if gender_raw in ("male", "female") else None

        return {
            "provider_user_id": str(user_data["id"]),
            "email": kakao_account.get("email"),
            "name": kakao_account.get("name"),
            "profile_image": kakao_account.get("profile", {}).get("profile_image_url"),
            "birthday": birthday,
            "birthyear": birthyear,
            "gender": gender,
        }


async def get_naver_user_info(code: str, redirect_uri: str) -> dict:
    async with httpx.AsyncClient() as client:
        # 1. Token Exchange
        token_res = await client.post(
            "https://nid.naver.com/oauth2.0/token",
            params={
                "grant_type": "authorization_code",
                "client_id": settings.naver_client_id,
                "client_secret": settings.naver_client_secret,
                "code": code,
            },
        )

        if token_res.status_code != 200:
            logger.error(f"[NAVER TOKEN ERROR] status={token_res.status_code}")
            raise HTTPException(
                status_code=400, detail="네이버 인증에 실패했습니다. 다시 시도해주세요."
            )

        token_data = token_res.json()
        access_token = token_data.get("access_token")

        # 2. User Info
        user_res = await client.get(
            "https://openapi.naver.com/v1/nid/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )

        if user_res.status_code != 200:
            raise HTTPException(status_code=400, detail="Naver User Info Error")

        user_data = user_res.json().get("response", {})

        birthday_raw = user_data.get("birthday")
        birthday = birthday_raw.replace("-", "") if birthday_raw else None
        birthyear = user_data.get("birthyear")
        gender_raw = user_data.get("gender")
        gender = {"M": "male", "F": "female"}.get(gender_raw)

        return {
            "provider_user_id": user_data["id"],
            "email": user_data.get("email"),
            "name": user_data.get("name"),
            "profile_image": user_data.get("profile_image"),
            "birthday": birthday,
            "birthyear": birthyear,
            "gender": gender,
        }


@router.post("/login/{provider}", response_model=AuthResponse)
async def login_callback(
    provider: str,
    payload: AuthCallbackRequest,
    response: Response,
    raw_request: Request,
    _rate_limit: None = Depends(
        rate_limit_dependency(limit=30, window_seconds=60, scope="auth_login")
    ),
    # db: AsyncSession = Depends(get_db) # No longer needed for auth
):
    if not _is_allowed_redirect_uri(payload.redirect_uri):
        logger.warning(
            "[AUTH] login rejected: reason=invalid_redirect_uri provider=%s redirect_uri=%s",
            provider,
            payload.redirect_uri,
        )
        raise HTTPException(status_code=400, detail="Invalid redirect_uri")
    if not payload.state or not verify_oauth_state(payload.state, provider):
        logger.warning(
            "[AUTH] login rejected: reason=invalid_state provider=%s redirect_uri=%s",
            provider,
            payload.redirect_uri,
        )
        raise HTTPException(status_code=400, detail="Invalid state")

    # 1. Fetch Provider User Info
    if provider == "kakao":
        user_info = await get_kakao_user_info(payload.code, payload.redirect_uri)
    elif provider == "naver":
        user_info = await get_naver_user_info(payload.code, payload.redirect_uri)
    else:
        try:
            await analytics.track_event(
                event_type="login_failed",
                event_data={"provider": provider, "error": "unsupported_provider"},
            )
        except Exception:
            pass
        raise HTTPException(status_code=400, detail="Unsupported provider")

    pid = user_info["provider_user_id"]
    email = user_info.get("email")
    name = user_info.get("name")
    profile_image = user_info.get("profile_image")

    pid_hash = hmac_provider_id(provider, str(pid))

    try:
        res_identity = await db_execute(
            lambda: (
                supabase.table(TABLE_IDENTITIES)
                .select("user_id")
                .eq("provider", provider)
                .eq("provider_user_id_hash", pid_hash)
                .execute()
            )
        )

        user_id = None
        is_new = False

        if res_identity.data and len(res_identity.data) > 0:
            user_id = res_identity.data[0]["user_id"]
            is_new = False
        else:
            is_new = True

            res_user = await db_execute(
                lambda: supabase.table("users").insert({}).execute()
            )

            if not res_user.data:
                raise Exception("Failed to create user")

            user_id = res_user.data[0]["id"]

            identity_data = {
                "user_id": user_id,
                "provider": provider,
                "provider_user_id_hash": pid_hash,
                "profile_image": profile_image,
                "key_id": CURRENT_KEY_VERSION,
            }

            if email:
                enc = crypto_manager.encrypt_field(TABLE_IDENTITIES, "email", email)
                identity_data["email_ct"] = enc["ciphertext"]
                identity_data["email_iv"] = enc["iv"]
                identity_data["email_tag"] = enc["tag"]

            if name:
                enc = crypto_manager.encrypt_field(TABLE_IDENTITIES, "name", name)
                identity_data["name_ct"] = enc["ciphertext"]
                identity_data["name_iv"] = enc["iv"]
                identity_data["name_tag"] = enc["tag"]

            await db_execute(
                lambda: supabase.table(TABLE_IDENTITIES).insert(identity_data).execute()
            )

        if not is_new and user_id:
            update_data: dict = {"profile_image": profile_image}

            if email:
                enc = crypto_manager.encrypt_field(TABLE_IDENTITIES, "email", email)
                update_data["email_ct"] = enc["ciphertext"]
                update_data["email_iv"] = enc["iv"]
                update_data["email_tag"] = enc["tag"]
                update_data["key_id"] = CURRENT_KEY_VERSION

            if name:
                enc = crypto_manager.encrypt_field(TABLE_IDENTITIES, "name", name)
                update_data["name_ct"] = enc["ciphertext"]
                update_data["name_iv"] = enc["iv"]
                update_data["name_tag"] = enc["tag"]

            await db_execute(
                lambda: (
                    supabase.table(TABLE_IDENTITIES)
                    .update(update_data)
                    .eq("user_id", user_id)
                    .eq("provider", provider)
                    .execute()
                )
            )

    except Exception as e:
        logger.error(f"Supabase DB Error: {e}")
        try:
            await analytics.track_event(
                event_type="login_failed",
                event_data={"provider": provider, "error": "auth_processing_error"},
            )
        except Exception:
            pass
        # 내부 에러 메시지 노출 방지
        raise HTTPException(
            status_code=500,
            detail="인증 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
        )

    user_id_str = str(user_id)

    # 3. Issue JWT
    token_payload = {"sub": user_id_str, "provider": provider}
    access_token = create_access_token(token_payload)

    raw_refresh, hashed_refresh = create_refresh_token()
    refresh_expires_at = datetime.now(timezone.utc) + timedelta(
        days=REFRESH_TOKEN_EXPIRE_DAYS
    )
    try:
        await db_execute(
            lambda: supabase.rpc(
                "insert_refresh_token",
                {
                    "p_user_id": user_id_str,
                    "p_token_hash": hashed_refresh,
                    "p_expires_at": refresh_expires_at.isoformat(),
                },
            ).execute()
        )
    except Exception as e:
        logger.error(f"[REFRESH TOKEN ERROR] user_id={user_id_str}: {e}")
        raise HTTPException(
            status_code=500, detail="리프레시 토큰 발급 중 오류가 발생했습니다."
        )

    oauth_profile = None
    if is_new:
        oauth_profile = OAuthProfile(
            name=name,
            email=email,
            birthday=user_info.get("birthday"),
            birthyear=user_info.get("birthyear"),
            gender=user_info.get("gender"),
        )

        try:
            user_id_str = str(user_id)
            existing_signup_bonus = await db_execute(
                lambda: (
                    supabase.table("coin_transactions")
                    .select("id")
                    .eq("user_id", user_id_str)
                    .eq("reference_type", "signup_bonus")
                    .limit(1)
                    .execute()
                )
            )

            if not existing_signup_bonus.data:
                result = await db_execute(
                    lambda: supabase.rpc(
                        "grant_bonus_coins",
                        {
                            "p_user_id": user_id_str,
                            "p_amount": 100,
                            "p_description": "신규 가입 보너스",
                            "p_reference_type": "signup_bonus",
                        },
                    ).execute()
                )
                if result.data and len(result.data) > 0:
                    logger.info(f"[SIGNUP BONUS] User {user_id_str} received 100 coins")

                    from ..services.notification_service import notifier

                    notifier.check_signup_milestone()
            else:
                logger.info(
                    f"[SIGNUP BONUS] Already granted for {user_id_str}, skipping"
                )
        except Exception as e:
            logger.exception(f"[SIGNUP BONUS ERROR] User {user_id_str}: {e}")

    try:
        await analytics.track_event(
            event_type="login_success",
            event_data={"provider": provider, "is_new": is_new},
            user_id=user_id_str,
        )
    except Exception:
        logger.warning("[AUTH] Failed to track login_success event")

    _set_auth_cookies(response, access_token, raw_refresh, request=raw_request)

    return AuthResponse(
        access_token=access_token,
        refresh_token=raw_refresh,
        user_id=user_id_str,
        is_new=is_new,
        oauth_profile=oauth_profile,
    )


@router.post("/refresh")
async def refresh_access_token(
    request: Request,
    response: Response,
    body: RefreshRequest | None = None,
    _rate_limit: None = Depends(
        rate_limit_dependency(limit=20, window_seconds=60, scope="auth_refresh")
    ),
):
    """Refresh token으로 새 access token 발급"""
    raw_token = (body.refresh_token if body else None) or request.cookies.get(
        REFRESH_TOKEN_COOKIE_KEY
    )
    if not isinstance(raw_token, str) or not raw_token:
        logger.info("[AUTH] refresh rejected: reason=missing_refresh_token")
        raise HTTPException(status_code=401, detail="Refresh token is required")

    hashed_token = hashlib.sha256(raw_token.encode()).hexdigest()
    new_raw_refresh, new_hashed_refresh = create_refresh_token()
    refresh_expires_at = datetime.now(timezone.utc) + timedelta(
        days=REFRESH_TOKEN_EXPIRE_DAYS
    )

    try:
        rotate_result = await db_execute(
            lambda: supabase.rpc(
                "rotate_refresh_token",
                {
                    "p_old_token_hash": hashed_token,
                    "p_new_token_hash": new_hashed_refresh,
                    "p_new_expires_at": refresh_expires_at.isoformat(),
                },
            ).execute()
        )
    except Exception as e:
        logger.error(
            f"[REFRESH TOKEN ROTATE ERROR] token_hash={hashed_token[:8]}...: {e}"
        )
        raise HTTPException(
            status_code=500, detail="리프레시 토큰 갱신 중 오류가 발생했습니다."
        )

    if not rotate_result.data:
        logger.info(
            "[AUTH] refresh rejected: reason=invalid_or_expired_refresh_token token_hash_prefix=%s",
            hashed_token[:8],
        )
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    rotation = rotate_result.data[0]
    user_id = str(rotation["user_id"])

    new_access_token = create_access_token({"sub": user_id})
    _set_auth_cookies(response, new_access_token, new_raw_refresh, request=request)

    return {
        "access_token": new_access_token,
        "refresh_token": new_raw_refresh,
        "token_type": "bearer",
    }


class ReviewLoginRequest(BaseModel):
    review_code: str


@router.post("/review-login", response_model=AuthResponse)
async def review_login(
    payload: ReviewLoginRequest,
    response: Response,
    raw_request: Request,
    _rate_limit: None = Depends(
        rate_limit_dependency(limit=5, window_seconds=300, scope="review_login")
    ),
):
    env = os.environ.get("ENV", "development").lower()
    payment_mode = (await config_service.get_payment_mode() or "").lower()
    if env in ("production", "prod") or payment_mode == "live":
        logger.warning(
            f"[REVIEW LOGIN] blocked by environment guard (env={env}, payment_mode={payment_mode})"
        )
        raise HTTPException(status_code=404, detail="Not Found")

    is_enabled = await config_service.is_review_login_enabled()
    if not is_enabled:
        raise HTTPException(status_code=404, detail="Not Found")

    expected_code = await config_service.get_review_login_code()
    if not expected_code:
        raise HTTPException(status_code=500, detail="Review login not configured")

    if not hmac_module.compare_digest(payload.review_code, expected_code):
        raise HTTPException(status_code=401, detail="Invalid review code")

    provider = "review"
    review_user_id = "toss_reviewer"
    pid_hash = hmac_provider_id(provider, review_user_id)

    try:
        res_identity = await db_execute(
            lambda: (
                supabase.table(TABLE_IDENTITIES)
                .select("user_id")
                .eq("provider", provider)
                .eq("provider_user_id_hash", pid_hash)
                .execute()
            )
        )

        if res_identity.data and len(res_identity.data) > 0:
            user_id = res_identity.data[0]["user_id"]
            is_new = False
        else:
            res_user = await db_execute(
                lambda: supabase.table("users").insert({}).execute()
            )
            if not res_user.data:
                raise Exception("Failed to create review user")

            user_id = res_user.data[0]["id"]
            is_new = True

            identity_data = {
                "user_id": user_id,
                "provider": provider,
                "provider_user_id_hash": pid_hash,
                "key_id": CURRENT_KEY_VERSION,
            }

            enc_name = crypto_manager.encrypt_field(
                TABLE_IDENTITIES, "name", "토스 심사원"
            )
            identity_data["name_ct"] = enc_name["ciphertext"]
            identity_data["name_iv"] = enc_name["iv"]
            identity_data["name_tag"] = enc_name["tag"]

            await db_execute(
                lambda: supabase.table(TABLE_IDENTITIES).insert(identity_data).execute()
            )

            user_id_str = str(user_id)
            existing_bonus = await db_execute(
                lambda: (
                    supabase.table("coin_transactions")
                    .select("id")
                    .eq("user_id", user_id_str)
                    .eq("reference_type", "review_bonus")
                    .limit(1)
                    .execute()
                )
            )

            if not existing_bonus.data:
                await db_execute(
                    lambda: supabase.rpc(
                        "grant_bonus_coins",
                        {
                            "p_user_id": user_id_str,
                            "p_amount": 10000,
                            "p_description": "심사용 테스트 코인",
                            "p_reference_type": "review_bonus",
                        },
                    ).execute()
                )
                logger.info(f"[REVIEW LOGIN] Created review user with bonus: {user_id}")
            else:
                logger.info(
                    f"[REVIEW LOGIN] Bonus already granted, skipping: {user_id}"
                )

    except Exception as e:
        logger.error(f"[REVIEW LOGIN ERROR] {e}")
        raise HTTPException(status_code=500, detail="심사 로그인 처리 중 오류")

    user_id_str = str(user_id)
    access_token = create_access_token({"sub": user_id_str})

    raw_refresh, hashed_refresh = create_refresh_token()
    refresh_expires_at = datetime.now(timezone.utc) + timedelta(
        days=REFRESH_TOKEN_EXPIRE_DAYS
    )
    try:
        await db_execute(
            lambda: supabase.rpc(
                "insert_refresh_token",
                {
                    "p_user_id": user_id_str,
                    "p_token_hash": hashed_refresh,
                    "p_expires_at": refresh_expires_at.isoformat(),
                },
            ).execute()
        )
    except Exception as e:
        logger.warning(f"[REVIEW LOGIN] refresh token failed: {e}")

    _set_auth_cookies(response, access_token, raw_refresh, request=raw_request)

    return AuthResponse(
        access_token=access_token,
        refresh_token=raw_refresh,
        user_id=user_id_str,
        is_new=is_new,
        oauth_profile=OAuthProfile(name="토스 심사원") if is_new else None,
    )


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
    _rate_limit: None = Depends(
        rate_limit_dependency(limit=10, window_seconds=60, scope="auth_logout")
    ),
):
    """로그아웃 - 현재 토큰 무효화"""
    token = (
        credentials.credentials
        if credentials
        else request.cookies.get(ACCESS_TOKEN_COOKIE_KEY)
    )
    if not token:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not settings.jwt_secret_key:
        raise HTTPException(status_code=500, detail="JWT secret not configured")

    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
            options={"verify_exp": False},
        )
    except JWTError:
        raise HTTPException(status_code=400, detail="Invalid token")

    jti = payload.get("jti")
    exp_timestamp = payload.get("exp")
    if jti and exp_timestamp:
        try:
            exp = datetime.fromtimestamp(exp_timestamp, tz=timezone.utc)
            add_to_blacklist(jti, exp)
        except Exception as e:
            logger.warning(f"[LOGOUT] blacklist update failed: {e}")

    user_id = payload.get("sub")
    if user_id:
        try:
            await db_execute(
                lambda: supabase.rpc(
                    "revoke_all_user_refresh_tokens", {"p_user_id": user_id}
                ).execute()
            )
        except Exception as e:
            logger.error(f"[LOGOUT] refresh token revoke failed: {e}")
            raise HTTPException(
                status_code=500, detail="로그아웃 처리 중 오류가 발생했습니다."
            )

    _clear_auth_cookies(response, request=request)
    return {"message": "로그아웃되었습니다"}


class SignupCompleteRequest(BaseModel):
    name: str
    gender: str
    birthyear: int
    birthday_mmdd: str
    age_range: str
    terms_version: str
    privacy_version: str
    referral_code: Optional[str] = None


@router.post("/signup/complete")
async def complete_signup(
    req: SignupCompleteRequest,
    current_user: dict = Depends(require_auth),
    _rate_limit: None = Depends(
        rate_limit_dependency(limit=10, window_seconds=60, scope="auth_signup_complete")
    ),
):
    # TODO DB-3: user_signup_profiles allows NULL on name, gender, birthyear.
    # Migration: ALTER TABLE user_signup_profiles ALTER COLUMN name SET NOT NULL,
    # ALTER COLUMN gender SET NOT NULL, ALTER COLUMN birthyear SET NOT NULL;
    user_id = current_user["user_id"]
    referral_bonus: Optional[dict] = None

    name = (req.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    if req.gender not in ("male", "female"):
        raise HTTPException(status_code=400, detail="gender must be male or female")

    current_year = datetime.now(timezone.utc).year
    if req.birthyear < 1900 or req.birthyear > current_year:
        raise HTTPException(status_code=400, detail="birthyear is invalid")

    age = current_year - req.birthyear
    if age < 14:
        raise HTTPException(
            status_code=400,
            detail="만 14세 미만은 법정대리인의 동의가 필요합니다. 보호자와 함께 가입해주세요.",
        )

    if (
        not req.birthday_mmdd
        or len(req.birthday_mmdd) != 4
        or not req.birthday_mmdd.isdigit()
    ):
        raise HTTPException(
            status_code=400, detail="birthday_mmdd must be 4 digits (MMDD)"
        )
    month = int(req.birthday_mmdd[:2])
    day = int(req.birthday_mmdd[2:])
    if month < 1 or month > 12 or day < 1 or day > 31:
        raise HTTPException(status_code=400, detail="birthday_mmdd is invalid")

    now_iso = datetime.now(timezone.utc).isoformat()

    enc_name = crypto_manager.encrypt_field(TABLE_SIGNUP, "name", name)
    enc_gender = crypto_manager.encrypt_field(TABLE_SIGNUP, "gender", req.gender)
    enc_birthyear = crypto_manager.encrypt_field(
        TABLE_SIGNUP, "birthyear", f"{req.birthyear:04d}"
    )
    enc_birthday = crypto_manager.encrypt_field(
        TABLE_SIGNUP, "birthday_mmdd", req.birthday_mmdd
    )

    try:
        await db_execute(
            lambda: (
                supabase.table(TABLE_SIGNUP)
                .upsert(
                    {
                        "user_id": user_id,
                        "name_ct": enc_name["ciphertext"],
                        "name_iv": enc_name["iv"],
                        "name_tag": enc_name["tag"],
                        "gender_ct": enc_gender["ciphertext"],
                        "gender_iv": enc_gender["iv"],
                        "gender_tag": enc_gender["tag"],
                        "birthyear_ct": enc_birthyear["ciphertext"],
                        "birthyear_iv": enc_birthyear["iv"],
                        "birthyear_tag": enc_birthyear["tag"],
                        "birthday_mmdd_ct": enc_birthday["ciphertext"],
                        "birthday_mmdd_iv": enc_birthday["iv"],
                        "birthday_mmdd_tag": enc_birthday["tag"],
                        "key_id": CURRENT_KEY_VERSION,
                        "updated_at": now_iso,
                    },
                    on_conflict="user_id",
                )
                .execute()
            )
        )
    except Exception as e:
        logger.error(f"[SIGNUP COMPLETE ERROR] profile upsert failed: {e}")
        raise HTTPException(
            status_code=500, detail="회원가입 저장 중 오류가 발생했습니다."
        )

    try:
        enc_identity_name = crypto_manager.encrypt_field(TABLE_IDENTITIES, "name", name)
        await db_execute(
            lambda: (
                supabase.table(TABLE_IDENTITIES)
                .update(
                    {
                        "name_ct": enc_identity_name["ciphertext"],
                        "name_iv": enc_identity_name["iv"],
                        "name_tag": enc_identity_name["tag"],
                        "key_id": CURRENT_KEY_VERSION,
                    }
                )
                .eq("user_id", user_id)
                .execute()
            )
        )
    except Exception as e:
        logger.warning(f"[SIGNUP COMPLETE WARNING] identity update failed: {e}")

    # 필수 동의 이력 기록 (히스토리 보관을 위해 INSERT)
    try:
        await db_execute(
            lambda: (
                supabase.table("user_consents")
                .insert(
                    [
                        {
                            "user_id": user_id,
                            "consent_type": "TERMS_OF_SERVICE",
                            "version": req.terms_version,
                            "is_granted": True,
                        },
                        {
                            "user_id": user_id,
                            "consent_type": "PRIVACY_POLICY",
                            "version": req.privacy_version,
                            "is_granted": True,
                        },
                        {
                            "user_id": user_id,
                            "consent_type": "SAJU_PROFILE_STORE",
                            "version": "1.0",
                            "is_granted": True,
                        },
                    ]
                )
                .execute()
            )
        )
    except Exception as e:
        logger.error(f"[SIGNUP COMPLETE ERROR] consent insert failed: {e}")
        raise HTTPException(status_code=500, detail="동의 저장 중 오류가 발생했습니다.")

    if req.referral_code:
        try:
            referral_result = await process_referral_reward(req.referral_code, user_id)
            if referral_result.get("success"):
                referral_bonus = {
                    "applied": True,
                    "reward_amount": referral_result.get("reward_amount", 20),
                    "referrer_user_id": referral_result.get("referrer_user_id"),
                    "transaction_id": referral_result.get("reward_transaction_id"),
                }
                logger.info(
                    "[SIGNUP COMPLETE] referral reward applied user_id=%s referrer_user_id=%s",
                    user_id,
                    referral_result.get("referrer_user_id"),
                )
            else:
                referral_bonus = {
                    "applied": False,
                    "reason": referral_result.get("error", "reward_grant_failed"),
                }
                logger.warning(
                    "[SIGNUP COMPLETE] referral reward not applied user_id=%s reason=%s",
                    user_id,
                    referral_result.get("error", "reward_grant_failed"),
                )
        except HTTPException as e:
            referral_bonus = {"applied": False, "reason": e.detail}
            logger.warning(
                "[SIGNUP COMPLETE] referral processing skipped user_id=%s detail=%s",
                user_id,
                e.detail,
            )
        except Exception as e:
            referral_bonus = {"applied": False, "reason": "internal_error"}
            logger.exception(
                "[SIGNUP COMPLETE] referral processing failed user_id=%s: %s",
                user_id,
                e,
            )

    return {"status": "success", "referral_bonus": referral_bonus}


@router.get("/urls")
def get_auth_urls():
    kakao_state = create_oauth_state("kakao")
    naver_state = create_oauth_state("naver")

    kakao_scopes = "name,gender,profile_image,birthday,birthyear"

    return {
        "kakao": f"https://kauth.kakao.com/oauth/authorize?client_id={settings.kakao_client_id}&response_type=code&lang=ko&state={kakao_state}&scope={kakao_scopes}",
        "naver": f"https://nid.naver.com/oauth2.0/authorize?client_id={settings.naver_client_id}&response_type=code&state={naver_state}",
    }


@router.get("/me", response_model=UserInfo)
async def get_me(current_user: dict = Depends(require_auth)):
    user_id = current_user["user_id"]

    try:
        res = await db_execute(
            lambda: (
                supabase.table(TABLE_IDENTITIES)
                .select(
                    "provider, profile_image, key_id, name_ct, name_iv, name_tag, email_ct, email_iv, email_tag"
                )
                .eq("user_id", user_id)
                .limit(1)
                .execute()
            )
        )

        if res.data and len(res.data) > 0:
            identity = res.data[0]

            name = None
            email = None
            key_id = identity.get("key_id", "v1")

            if (
                identity.get("name_ct")
                and identity.get("name_iv")
                and identity.get("name_tag")
            ):
                try:
                    name = crypto_manager.decrypt_field(
                        TABLE_IDENTITIES,
                        "name",
                        identity["name_iv"],
                        identity["name_ct"],
                        identity["name_tag"],
                        key_id,
                    )
                except Exception as e:
                    logger.warning(f"[DECRYPT] name failed for user {user_id}: {e}")

            if (
                identity.get("email_ct")
                and identity.get("email_iv")
                and identity.get("email_tag")
            ):
                try:
                    email = crypto_manager.decrypt_field(
                        TABLE_IDENTITIES,
                        "email",
                        identity["email_iv"],
                        identity["email_ct"],
                        identity["email_tag"],
                        key_id,
                    )
                except Exception as e:
                    logger.warning(f"[DECRYPT] email failed for user {user_id}: {e}")

            return UserInfo(
                user_id=user_id,
                provider=identity.get("provider"),
                name=name,
                email=email,
                profile_image=identity.get("profile_image"),
            )

        return UserInfo(user_id=user_id)

    except Exception as e:
        logger.error(f"Database Error in get_me: {e}")
        raise HTTPException(
            status_code=500, detail="사용자 정보 조회 중 오류가 발생했습니다."
        )


@router.delete("/withdraw")
async def withdraw_account(
    current_user: dict = Depends(require_auth),
    _rate_limit: None = Depends(
        rate_limit_dependency(limit=5, window_seconds=60, scope="auth_withdraw")
    ),
):
    """
    회원 탈퇴
    - users 테이블에서 삭제 (CASCADE로 연관 데이터 자동 삭제)
    - 삭제되는 데이터: user_identities, user_consents, saju_profiles, user_readings
    """
    # TODO PRIV-DATA-7: Implement user data export endpoint for GDPR/PIPA compliance.
    # TODO PRIV-DATA-7: Should export all user data (profiles, readings, transactions) in JSON format.
    # TODO PRIV-DATA-7: Endpoint: GET /api/auth/data-export
    user_id = current_user["user_id"]
    payload = current_user.get("payload") or {}

    try:
        jti = payload.get("jti")
        exp_timestamp = payload.get("exp")
        if jti and exp_timestamp:
            try:
                exp = datetime.fromtimestamp(exp_timestamp, tz=timezone.utc)
                add_to_blacklist(jti, exp)
            except Exception as e:
                logger.warning(f"[WITHDRAW] blacklist update failed: {e}")

        await db_execute(
            lambda: supabase.rpc(
                "revoke_all_user_refresh_tokens", {"p_user_id": user_id}
            ).execute()
        )

        # users 테이블에서 삭제 (ON DELETE CASCADE로 연관 테이블 자동 삭제)
        res = await db_execute(
            lambda: supabase.table("users").delete().eq("id", user_id).execute()
        )

        if res.data:
            logger.info(f"[WITHDRAW] User {user_id} deleted successfully")
            return {"status": "success", "message": "회원 탈퇴가 완료되었습니다."}
        else:
            # 데이터가 없어도 성공으로 처리 (이미 삭제된 경우)
            logger.info(f"[WITHDRAW] User {user_id} not found or already deleted")
            return {"status": "success", "message": "회원 탈퇴가 완료되었습니다."}

    except Exception as e:
        logger.error(f"[WITHDRAW ERROR] User {user_id}: {e}")
        # 내부 에러 메시지 노출 방지
        raise HTTPException(
            status_code=500,
            detail="탈퇴 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
        )
