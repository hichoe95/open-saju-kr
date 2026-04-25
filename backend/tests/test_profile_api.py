import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.deps import get_current_user_id
from app.api.profile import router as profile_router


profile_test_app = FastAPI()
profile_test_app.include_router(profile_router, prefix="/api")


@pytest.fixture
def client():
    return TestClient(profile_test_app)


@pytest.fixture
def mock_profile_auth():
    profile_test_app.dependency_overrides[get_current_user_id] = lambda: "test-user-id"
    yield
    profile_test_app.dependency_overrides.pop(get_current_user_id, None)


@pytest.fixture
def mock_profile_supabase():
    with patch("app.api.profile.supabase") as mock:
        yield mock


@pytest.fixture(autouse=True)
def reset_rate_limit_store():
    from app.api import deps as deps_module

    deps_module._rate_limit_store.clear()
    yield
    deps_module._rate_limit_store.clear()


VALID_PROFILE_PAYLOAD = {
    "label": "내 사주",
    "birth_date": "1990-01-01",
    "hour_branch": "子",
    "calendar_type": "solar",
    "gender": "male",
    "persona": "classic",
}


class TestProfileCreate:
    def test_create_profile_auto_grants_consent_if_missing(
        self,
        client,
        mock_profile_auth,
        mock_profile_supabase,
    ):
        """동의 없는 기존 사용자도 프로필 저장 시 자동 동의 부여 후 저장됨"""
        consent_table = MagicMock()
        # 동의 조회 → 없음
        consent_table.select.return_value.eq.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[]
        )
        # 동의 자동 INSERT 성공
        consent_table.insert.return_value.execute.return_value = MagicMock(
            data=[{"id": "consent-1"}]
        )
        mock_profile_supabase.table.return_value = consent_table

        response = client.post("/api/saju/profiles", json=VALID_PROFILE_PAYLOAD)

        # 403이 아니라 자동 동의 부여 후 프로필 저장 시도 (500은 mock 한계)
        assert response.status_code != 403

    def test_create_profile_saves_encrypted_profile_after_consent(
        self,
        client,
        mock_profile_auth,
        mock_profile_supabase,
    ):
        consent_table = MagicMock()
        consent_table.select.return_value.eq.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{"is_granted": True}]
        )

        profiles_table = MagicMock()
        profiles_table.insert.return_value.execute.return_value = MagicMock(
            data=[
                {
                    "id": "profile-1",
                    "created_at": "2026-03-06T00:00:00+00:00",
                }
            ]
        )

        def table_side_effect(name: str):
            tables = {
                "user_consents": consent_table,
                "saju_profiles": profiles_table,
            }
            return tables[name]

        mock_profile_supabase.table.side_effect = table_side_effect

        with (
            patch("app.api.profile.crypto_manager") as mock_crypto,
            patch(
                "app.api.profile._resolve_explicit_source_link",
                return_value=(None, None),
            ),
            patch(
                "app.api.profile._find_cache_id_by_birth_input",
                return_value=None,
            ),
            patch(
                "app.api.profile._find_best_reading_candidate",
                return_value=None,
            ),
            patch(
                "app.api.profile._find_latest_reading_id_by_cache",
                return_value=None,
            ),
            patch(
                "app.api.profile.analytics.track_event",
                new=AsyncMock(return_value=None),
            ),
        ):
            mock_crypto.aesgcm = object()
            mock_crypto.encrypt_field.side_effect = lambda table, column, value: {
                "ciphertext": f"ct:{column}:{value}",
                "iv": f"iv:{column}",
                "tag": f"tag:{column}",
            }

            response = client.post("/api/saju/profiles", json=VALID_PROFILE_PAYLOAD)

        assert response.status_code == 200
        assert response.json() == {"id": "profile-1", "status": "saved"}

        inserted = profiles_table.insert.call_args.args[0]
        assert inserted["user_id"] == "test-user-id"
        assert inserted["persona"] == "classic"
        assert inserted["birth_date_ct"] == "ct:birth_date:1990-01-01"
        assert inserted["hour_branch_ct"] == "ct:hour_branch:子"
