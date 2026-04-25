import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api import auth as auth_module


class TestAuthRedirectAllowlist:
    def test_normalize_redirect_uri_lowercases_scheme_and_host(self):
        result = auth_module._normalize_redirect_uri(
            " HTTPS://Example.COM/auth/callback?foo=bar "
        )
        assert result == "https://example.com/auth/callback?foo=bar"

    def test_normalize_redirect_uri_rejects_fragment(self):
        assert auth_module._normalize_redirect_uri(
            "https://example.com/auth/callback#fragment"
        ) is None

    def test_parse_allowed_redirect_uris_deduplicates_sources(self, monkeypatch):
        monkeypatch.setattr(
            auth_module.settings,
            "oauth_redirect_uri_allowlist",
            "https://app.example.com/auth/callback, https://APP.example.com/auth/callback ",
            raising=False,
        )
        monkeypatch.setattr(
            auth_module.settings,
            "oauth_redirect_allowlist",
            "https://app.example.com/auth/callback?next=%2Fhome",
            raising=False,
        )

        result = auth_module._parse_allowed_redirect_uris()

        assert result == [
            "https://app.example.com/auth/callback",
            "https://app.example.com/auth/callback?next=%2Fhome",
        ]

    def test_is_allowed_redirect_uri_matches_exact_allowlist(self, monkeypatch):
        monkeypatch.setattr(
            auth_module.settings,
            "oauth_redirect_uri_allowlist",
            "https://app.example.com/auth/callback",
            raising=False,
        )
        monkeypatch.setattr(
            auth_module.settings,
            "oauth_redirect_allowlist",
            "",
            raising=False,
        )

        assert auth_module._is_allowed_redirect_uri(
            "https://app.example.com/auth/callback"
        )
        assert not auth_module._is_allowed_redirect_uri(
            "https://app.example.com/other"
        )

    def test_is_allowed_redirect_uri_blocks_wildcard_in_production(
        self, monkeypatch
    ):
        monkeypatch.setattr(
            auth_module.settings,
            "oauth_redirect_uri_allowlist",
            "*",
            raising=False,
        )
        monkeypatch.setattr(
            auth_module.settings,
            "oauth_redirect_allowlist",
            "",
            raising=False,
        )
        monkeypatch.setenv("ENV", "production")

        assert not auth_module._is_allowed_redirect_uri(
            "https://app.example.com/auth/callback"
        )
