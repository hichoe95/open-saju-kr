import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import Settings


def build_settings(**overrides):
    defaults = {
        "cors_origins": "https://app.example.com,https://example.com",
        "allowed_hosts": "app.example.com,example.com",
        "oauth_redirect_allowlist": "https://app.example.com/auth/callback/kakao",
        "oauth_redirect_uri_allowlist": "https://app.example.com/auth/callback/naver",
        "jwt_secret_key": "x" * 32,
        "data_enc_key_v1": "enc-key-value",
        "supabase_url": "https://example.supabase.co",
        "supabase_service_role_key": "service-role-key",
    }
    defaults.update(overrides)
    return Settings(**defaults)


def test_production_requires_oauth_redirect_allowlist(monkeypatch):
    monkeypatch.setenv("ENV", "production")

    with pytest.raises(ValueError, match="OAuth redirect allowlist"):
        build_settings(
            oauth_redirect_allowlist="",
            oauth_redirect_uri_allowlist="",
        )


def test_production_blocks_oauth_redirect_wildcard(monkeypatch):
    monkeypatch.setenv("ENV", "production")

    with pytest.raises(ValueError, match="wildcard"):
        build_settings(oauth_redirect_allowlist="*")


def test_production_accepts_explicit_auth_deployment_settings(monkeypatch):
    monkeypatch.setenv("ENV", "production")

    settings = build_settings()

    assert settings.allowed_hosts == "app.example.com,example.com"
    assert (
        settings.oauth_redirect_allowlist
        == "https://app.example.com/auth/callback/kakao"
    )
