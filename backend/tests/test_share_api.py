import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.deps import get_current_user_id
from app.api import share as share_module
from app.api.share import router as share_router


share_test_app = FastAPI()
share_test_app.include_router(share_router, prefix="/api")


@pytest.fixture
def client():
    return TestClient(share_test_app)


@pytest.fixture
def mock_share_supabase():
    with patch("app.api.share.supabase") as mock:
        yield mock


@pytest.fixture
def mock_share_db_execute():
    async def _mock_db_execute(fn):
        return fn()

    with patch("app.api.share.db_execute", side_effect=_mock_db_execute):
        yield


@pytest.fixture
def mock_share_auth():
    share_test_app.dependency_overrides[get_current_user_id] = lambda: "test-user-id"
    yield
    share_test_app.dependency_overrides.pop(get_current_user_id, None)


@pytest.fixture(autouse=True)
def reset_rate_limit_store():
    from app.api import deps as deps_module

    deps_module._rate_limit_store.clear()
    yield
    deps_module._rate_limit_store.clear()



class TestShareGet:
    def test_get_share_returns_410_when_expired(
        self,
        client,
        mock_share_supabase,
        mock_share_db_execute,
    ):
        expired_at = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
        shared_table = MagicMock()
        shared_table.select.return_value.eq.return_value.execute.return_value = (
            MagicMock(
                data=[
                    {
                        "id": "share-1",
                        "share_code": "expired-code",
                        "expires_at": expired_at,
                        "view_count": 0,
                    }
                ]
            )
        )
        mock_share_supabase.table.return_value = shared_table

        response = client.get("/api/share/expired-code")

        assert response.status_code == 410
        assert response.json()["detail"] == "공유 링크가 만료되었습니다"

    def test_get_share_increments_view_count(
        self,
        client,
        mock_share_supabase,
        mock_share_db_execute,
    ):
        future_at = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
        shared_table = MagicMock()
        shared_table.select.return_value.eq.return_value.execute.return_value = (
            MagicMock(
                data=[
                    {
                        "id": "share-1",
                        "share_code": "share-code",
                        "sharer_name": "테스터",
                        "birth_input": {"birth_solar": "1990-01-01"},
                        "reading_data": {"one_liner": "테스트"},
                        "created_at": "2026-03-06T00:00:00+00:00",
                        "expires_at": future_at,
                        "view_count": 3,
                    }
                ]
            )
        )
        shared_table.update.return_value.eq.return_value.execute.return_value = (
            MagicMock(data=[{"id": "share-1"}])
        )
        mock_share_supabase.table.return_value = shared_table

        response = client.get("/api/share/share-code")

        assert response.status_code == 200
        payload = response.json()
        assert payload["view_count"] == 4
        shared_table.update.assert_called_with({"view_count": 4})

    def test_get_share_consumes_profile_share_code_when_present(
        self,
        client,
        mock_share_supabase,
        mock_share_db_execute,
    ):
        future_at = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
        shared_table = MagicMock()
        shared_table.select.return_value.eq.return_value.execute.return_value = (
            MagicMock(
                data=[
                    {
                        "id": "share-1",
                        "share_code": "share-code",
                        "sharer_name": "테스터",
                        "birth_input": {"birth_solar": "1990-01-01"},
                        "reading_data": {"one_liner": "테스트"},
                        "created_at": "2026-03-06T00:00:00+00:00",
                        "expires_at": future_at,
                        "view_count": 0,
                    }
                ]
            )
        )
        shared_table.update.return_value.eq.return_value.execute.return_value = (
            MagicMock(data=[{"id": "share-1"}])
        )

        share_code_table = MagicMock()
        share_code_table.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{"id": "psc-1"}]
        )

        def table_side_effect(name: str):
            tables = {
                "shared_saju": shared_table,
                "profile_share_codes": share_code_table,
            }
            return tables[name]

        mock_share_supabase.table.side_effect = table_side_effect
        mock_share_supabase.rpc.return_value.execute.return_value = MagicMock(
            data=[{"success": True}]
        )

        response = client.get("/api/share/share-code")

        assert response.status_code == 200
        mock_share_supabase.rpc.assert_called_with(
            "increment_share_code_use_count", {"p_code": "share-code"}
        )

    def test_get_share_rejects_exhausted_profile_share_code(
        self,
        client,
        mock_share_supabase,
        mock_share_db_execute,
    ):
        shared_table = MagicMock()
        shared_table.select.return_value.eq.return_value.execute.return_value = (
            MagicMock(data=[])
        )

        share_code_table = MagicMock()
        share_code_table.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{"id": "psc-1"}]
        )

        def table_side_effect(name: str):
            tables = {
                "shared_saju": shared_table,
                "profile_share_codes": share_code_table,
            }
            return tables[name]

        mock_share_supabase.table.side_effect = table_side_effect
        mock_share_supabase.rpc.return_value.execute.return_value = MagicMock(
            data=[{"success": False, "error": "MAX_USES_EXCEEDED"}]
        )

        response = client.get("/api/share/share-code")

        assert response.status_code == 410
        assert response.json()["detail"] == "공유 링크가 만료되었습니다"
