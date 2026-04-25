from datetime import timedelta
import sys
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.deps import get_current_user_id
from app.core.security import create_access_token


auth_deps_test_app = FastAPI()


@auth_deps_test_app.get("/protected")
async def protected_route(user_id: str = Depends(get_current_user_id)):
    return {"user_id": user_id}


client = TestClient(auth_deps_test_app)


def test_get_current_user_id_accepts_bearer_token():
    token = create_access_token({"sub": "header-user"})

    response = client.get(
        "/protected",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == {"user_id": "header-user"}


def test_get_current_user_id_accepts_cookie_token():
    token = create_access_token({"sub": "cookie-user"})

    response = client.get(
        "/protected",
        cookies={"access_token": token},
    )

    assert response.status_code == 200
    assert response.json() == {"user_id": "cookie-user"}


def test_get_current_user_id_rejects_missing_credentials():
    response = client.get("/protected")

    assert response.status_code == 401
    assert response.json()["detail"] == "Could not validate credentials"


def test_get_current_user_id_rejects_expired_bearer_token():
    token = create_access_token(
        {"sub": "expired-user"},
        expires_delta=timedelta(minutes=-1),
    )

    response = client.get(
        "/protected",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Could not validate credentials"


def test_invalid_bearer_overrides_valid_cookie():
    valid_cookie_token = create_access_token({"sub": "cookie-user"})

    response = client.get(
        "/protected",
        headers={"Authorization": "Bearer invalid.token.value"},
        cookies={"access_token": valid_cookie_token},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Could not validate credentials"
