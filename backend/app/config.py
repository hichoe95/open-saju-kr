"""
환경 설정 및 API 키 관리
"""

import os
from pydantic_settings import BaseSettings
from pydantic import model_validator
from functools import lru_cache
from pathlib import Path


_BACKEND_DIR = Path(__file__).resolve().parents[1]
_ENV_FILE = _BACKEND_DIR / ".env"


def _is_production() -> bool:
    env = os.environ.get("ENV", "development").lower()
    return env in ("production", "prod")


class Settings(BaseSettings):
    """앱 설정 - 환경변수에서 로드"""

    # API Keys (서버에서만 관리!)
    openai_api_key: str = ""
    google_api_key: str = ""
    anthropic_api_key: str = ""

    # CORS (환경변수 필수)
    cors_origins: str

    allowed_hosts: str = ""
    oauth_redirect_allowlist: str = ""
    oauth_redirect_uri_allowlist: str = ""
    oauth_state_expire_minutes: int = 10

    # Rate Limiting
    rate_limit_per_minute: int = 10
    rate_limit_per_day: int = 100
    redis_url: str = ""  # Redis URL for distributed rate limiting (optional)
    slack_webhook_url: str = ""
    # TRUSTED_PROXY_COUNT: 신뢰할 프록시 개수
    # 0 = 프록시 없음 (기존 동작)
    # 1 = 프록시 1개 (X-Forwarded-For에서 마지막 IP 신뢰)
    # 2 = 프록시 2개 (X-Forwarded-For에서 뒤에서 2번째 IP 신뢰)
    trusted_proxy_count: int = 0
    trusted_proxy_cidrs: str = ""

    enable_debug_response_dump: bool = False

    # 프롬프트 버전
    prompt_version: str = "v1"

    enable_parallel_reading: bool = True
    parallel_max_concurrent: int = 11
    parallel_tab_timeout: int = 300
    parallel_retry_count: int = 2

    # Web Push (VAPID)
    vapid_private_key: str = ""
    vapid_email: str = "mailto:admin@example.com"

    # Database
    database_url: str = ""

    # Encryption
    data_enc_key_v1: str = ""
    encryption_key: str = ""
    encryption_key_v1: str = ""
    encryption_key_v2: str = ""
    current_key_version: str = "v1"

    # JWT (환경변수 필수)
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    # OAuth - Kakao
    kakao_client_id: str = ""
    kakao_client_secret: str = ""

    # OAuth - Naver
    naver_client_id: str = ""
    naver_client_secret: str = ""

    # Supabase
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""

    # Frontend URL (공유 링크용)
    frontend_url: str = "http://localhost:3000"

    admin_user_ids: str = ""

    # 토스페이먼츠 (test/live 분리)
    # 하위호환: TOSS_SECRET_KEY → toss_test_secret_key, TOSS_CLIENT_KEY → toss_test_client_key
    toss_test_secret_key: str = ""
    toss_live_secret_key: str = ""
    toss_test_client_key: str = ""
    toss_live_client_key: str = ""
    allow_unsigned_webhook_in_test: bool = False
    require_redis_for_payment_rate_limit: bool = False

    # Telegram
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    # 심사용 로그인 (PG 심사 등)
    review_login_enabled: bool = False
    review_login_code: str = ""

    @model_validator(mode="after")
    def _migrate_legacy_toss_keys(self) -> "Settings":
        """TOSS_SECRET_KEY/TOSS_CLIENT_KEY → test 키로 폴백 (하위호환)"""
        legacy_secret = os.environ.get("TOSS_SECRET_KEY", "")
        legacy_client = os.environ.get("TOSS_CLIENT_KEY", "")
        if not self.toss_test_secret_key and legacy_secret:
            self.toss_test_secret_key = legacy_secret
        if not self.toss_test_client_key and legacy_client:
            self.toss_test_client_key = legacy_client
        return self

    @model_validator(mode="after")
    def validate_production_config(self) -> "Settings":
        if not _is_production():
            return self

        critical_keys = {
            "supabase_url": self.supabase_url,
            "supabase_service_role_key": self.supabase_service_role_key,
            "jwt_secret_key": self.jwt_secret_key,
            "data_enc_key_v1": self.data_enc_key_v1,
        }

        missing = [k for k, v in critical_keys.items() if not v]
        if missing:
            raise ValueError(
                f"[SECURITY] Missing critical config in production: {', '.join(missing)}. "
                "Set these environment variables before deployment."
            )

        # toss 키는 warning만 (결제 시점에 체크됨)
        if not self.toss_test_secret_key and not self.toss_live_secret_key:
            import logging

            logging.getLogger(__name__).warning(
                "[CONFIG] No TossPayments keys configured. "
                "Payment features will fail until TOSS_TEST_SECRET_KEY or TOSS_LIVE_SECRET_KEY is set."
            )

        if len(self.jwt_secret_key) < 32:
            raise ValueError(
                "[SECURITY] JWT_SECRET_KEY must be at least 32 characters in production"
            )

        if not self.allowed_hosts:
            raise ValueError(
                "[SECURITY] ALLOWED_HOSTS must be explicitly configured in production"
            )

        if not self.oauth_redirect_allowlist and not self.oauth_redirect_uri_allowlist:
            raise ValueError(
                "[SECURITY] OAuth redirect allowlist must be configured in production"
            )

        redirect_entries = [
            entry.strip()
            for entry in f"{self.oauth_redirect_allowlist},{self.oauth_redirect_uri_allowlist}".split(
                ","
            )
            if entry.strip()
        ]
        if any(entry == "*" for entry in redirect_entries):
            raise ValueError(
                "[SECURITY] OAuth redirect allowlist wildcard (*) is blocked in production"
            )

        return self

    class Config:
        # CWD에 상관없이 backend/.env를 로드
        env_file = str(_ENV_FILE)
        env_file_encoding = "utf-8"
        extra = "ignore"  # 알 수 없는 환경변수 무시


@lru_cache()
def get_settings() -> Settings:
    """설정 싱글톤 반환"""
    return Settings()
