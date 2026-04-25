import sys
from pathlib import Path

from fastapi import Request, Response

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api import auth


def build_request(scheme: str = "http", forwarded_proto: str | None = None) -> Request:
    headers: list[tuple[bytes, bytes]] = [(b"host", b"api.example.com")]
    if forwarded_proto:
        headers.append((b"x-forwarded-proto", forwarded_proto.encode()))

    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "POST",
        "scheme": scheme,
        "path": "/api/auth/login/kakao",
        "raw_path": b"/api/auth/login/kakao",
        "query_string": b"",
        "headers": headers,
        "client": ("127.0.0.1", 12345),
        "server": ("api.example.com", 443 if scheme == "https" else 80),
    }
    return Request(scope)


def test_secure_cookie_enabled_for_https_request_without_env(monkeypatch):
    monkeypatch.delenv("ENV", raising=False)
    monkeypatch.setattr(auth.settings, "cors_origins", "http://localhost:3000")

    request = build_request(scheme="http", forwarded_proto="https")

    assert auth._is_secure_cookie(request) is True


def test_secure_cookie_enabled_for_https_cors_origin_without_env(monkeypatch):
    monkeypatch.delenv("ENV", raising=False)
    monkeypatch.setattr(
        auth.settings,
        "cors_origins",
        "https://app.example.com,https://example.com,http://localhost:3000",
    )

    assert auth._is_secure_cookie(None) is True


def test_local_http_cookie_stays_lax_in_development(monkeypatch):
    monkeypatch.delenv("ENV", raising=False)
    monkeypatch.setattr(
        auth.settings, "cors_origins", "http://localhost:3000,http://127.0.0.1:3000"
    )

    response = Response()
    auth._set_auth_cookies(response, "access-token", "refresh-token")
    set_cookie_headers = [
        value.decode() for key, value in response.raw_headers if key == b"set-cookie"
    ]

    assert any("SameSite=lax" in header for header in set_cookie_headers)
    assert all("Secure" not in header for header in set_cookie_headers)
    assert all("Path=/" in header for header in set_cookie_headers)


def test_https_cookie_uses_secure_and_none(monkeypatch):
    monkeypatch.delenv("ENV", raising=False)
    monkeypatch.setattr(auth.settings, "cors_origins", "http://localhost:3000")

    response = Response()
    auth._set_auth_cookies(
        response,
        "access-token",
        "refresh-token",
        request=build_request(scheme="http", forwarded_proto="https"),
    )
    set_cookie_headers = [
        value.decode() for key, value in response.raw_headers if key == b"set-cookie"
    ]

    assert any("SameSite=none" in header for header in set_cookie_headers)
    assert all("Secure" in header for header in set_cookie_headers)
    assert all("Path=/" in header for header in set_cookie_headers)
