import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.profile_share import router as profile_share_router
from app.api.deps import get_current_user_id


profile_share_test_app = FastAPI()
profile_share_test_app.include_router(profile_share_router, prefix="/api")


def test_get_profile_by_code_returns_masked_birth_date():
    client = TestClient(profile_share_test_app)

    share_codes_table = MagicMock()
    share_codes_table.select.return_value.eq.return_value.execute.return_value = (
        MagicMock(
            data=[
                {
                    "profile_id": "profile-1",
                    "code": "ABC123",
                    "expires_at": "2099-01-01T00:00:00+00:00",
                    "use_count": 0,
                    "max_uses": 1,
                }
            ]
        )
    )

    profiles_table = MagicMock()
    profiles_table.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[
            {
                "label": "공유 프로필",
                "cache_id": "cache-1",
                "key_id": "v1",
                "birth_date_iv": "iv1",
                "birth_date_ct": "ct1",
                "birth_date_tag": "tag1",
                "hour_branch_iv": "iv2",
                "hour_branch_ct": "ct2",
                "hour_branch_tag": "tag2",
                "calendar_type_iv": "iv4",
                "calendar_type_ct": "ct4",
                "calendar_type_tag": "tag4",
                "gender_iv": "iv3",
                "gender_ct": "ct3",
                "gender_tag": "tag3",
            }
        ]
    )

    def table_side_effect(name: str):
        tables = {
            "profile_share_codes": share_codes_table,
            "saju_profiles": profiles_table,
        }
        return tables[name]

    with (
        patch("app.api.profile_share.supabase") as mock_supabase,
        patch("app.api.profile_share.db_execute", side_effect=lambda fn: fn()),
        patch("app.api.profile_share.crypto_manager") as mock_crypto_manager,
        patch(
            "app.api.profile_share._get_cache_row_by_id",
            return_value={
                "one_liner": "",
                "pillars_json": {},
                "card_json": {},
                "tabs_json": {},
                "advanced_json": {},
                "extras_json": {},
                "model_version": "cached",
            },
        ),
    ):
        mock_supabase.table.side_effect = table_side_effect
        mock_supabase.rpc.return_value.execute.return_value = MagicMock(
            data=[{"success": True}]
        )
        mock_crypto_manager.aesgcm = object()

        def decrypt_side_effect(_table: str, column: str, *_args, **_kwargs):
            values = {
                "birth_date": "1990-01-15",
                "hour_branch": "子",
                "calendar_type": "solar",
                "gender": "male",
            }
            return values[column]

        mock_crypto_manager.decrypt_field.side_effect = decrypt_side_effect

        response = client.get("/api/profile/by-code/ABC123")

    assert response.status_code == 200
    payload = response.json()
    assert payload["birth_date"] == "1990-01-**"
    assert payload["hour_branch"] == "子"
    assert payload["gender"] == "male"


def test_get_profile_by_code_rejects_expired_code():
    client = TestClient(profile_share_test_app)

    share_codes_table = MagicMock()
    share_codes_table.select.return_value.eq.return_value.execute.return_value = (
        MagicMock(
            data=[
                {
                    "profile_id": "profile-1",
                    "code": "ABC123",
                    "expires_at": "2000-01-01T00:00:00+00:00",
                    "use_count": 0,
                    "max_uses": 1,
                }
            ]
        )
    )

    with (
        patch("app.api.profile_share.supabase") as mock_supabase,
        patch("app.api.profile_share.db_execute", side_effect=lambda fn: fn()),
    ):
        mock_supabase.table.side_effect = lambda name: {
            "profile_share_codes": share_codes_table
        }[name]
        response = client.get("/api/profile/by-code/ABC123")

    assert response.status_code == 410


def test_get_profile_by_code_rejects_exhausted_code():
    client = TestClient(profile_share_test_app)

    share_codes_table = MagicMock()
    share_codes_table.select.return_value.eq.return_value.execute.return_value = (
        MagicMock(
            data=[
                {
                    "profile_id": "profile-1",
                    "code": "ABC123",
                    "expires_at": "2099-01-01T00:00:00+00:00",
                    "use_count": 1,
                    "max_uses": 1,
                }
            ]
        )
    )

    with (
        patch("app.api.profile_share.supabase") as mock_supabase,
        patch("app.api.profile_share.db_execute", side_effect=lambda fn: fn()),
    ):
        mock_supabase.table.side_effect = lambda name: {
            "profile_share_codes": share_codes_table
        }[name]
        response = client.get("/api/profile/by-code/ABC123")

    assert response.status_code == 410


def test_create_profile_share_code_stores_shared_snapshot_with_same_code():
    profile_share_test_app.dependency_overrides[get_current_user_id] = lambda: (
        "owner-user"
    )
    client = TestClient(profile_share_test_app)

    profile_table = MagicMock()
    profile_table.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": "profile-1", "user_id": "owner-user"}]
    )
    profile_share_codes_table = MagicMock()
    profile_share_codes_table.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[]
    )
    profile_share_codes_table.delete.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[]
    )
    profile_share_codes_table.insert.return_value.execute.return_value = MagicMock(
        data=[{"code": "ABC123"}]
    )
    shared_saju_table = MagicMock()
    shared_saju_table.delete.return_value.eq.return_value.execute.return_value = (
        MagicMock(data=[])
    )
    shared_saju_table.insert.return_value.execute.return_value = MagicMock(
        data=[{"share_code": "ABC123"}]
    )
    consent_table = MagicMock()
    consent_table.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[{"is_granted": True}]
    )

    def table_side_effect(name: str):
        tables = {
            "saju_profiles": profile_table,
            "profile_share_codes": profile_share_codes_table,
            "shared_saju": shared_saju_table,
            "user_consents": consent_table,
        }
        return tables[name]

    with (
        patch("app.api.profile_share.supabase") as mock_supabase,
        patch("app.api.profile_share.db_execute", side_effect=lambda fn: fn()),
        patch("app.api.profile_share._generate_unique_code", return_value="ABC123"),
        patch(
            "app.api.profile_share._get_profile_share_snapshot",
            return_value={
                "sharer_name": "공유 프로필",
                "birth_input": {"birth_solar": "1990-01-15"},
                "reading_data": {"one_liner": "한 줄 요약"},
            },
        ),
    ):
        mock_supabase.table.side_effect = table_side_effect

        response = client.post("/api/profile/profile-1/share-code")

    profile_share_test_app.dependency_overrides.clear()

    assert response.status_code == 200
    shared_insert_payload = shared_saju_table.insert.call_args.args[0]
    assert shared_insert_payload["share_code"] == "ABC123"
    assert shared_insert_payload["user_id"] == "owner-user"
    assert shared_insert_payload["birth_input"]["birth_solar"] == "1990-01-15"
    assert shared_insert_payload["reading_data"]["one_liner"] == "한 줄 요약"


def test_redeem_profile_by_code_returns_full_birth_date():
    profile_share_test_app.dependency_overrides[get_current_user_id] = lambda: (
        "recipient-user"
    )
    client = TestClient(profile_share_test_app)

    share_codes_table = MagicMock()
    share_codes_table.select.return_value.eq.return_value.execute.return_value = (
        MagicMock(data=[{"id": "psc-1"}])
    )

    shared_saju_table = MagicMock()
    shared_saju_table.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[
            {
                "share_code": "ABC123",
                "sharer_name": "공유 프로필",
                "birth_input": {
                    "name": "공유 프로필",
                    "birth_solar": "1990-01-15",
                    "birth_time": "00:00",
                    "timezone": "Asia/Seoul",
                    "birth_place": "대한민국",
                    "calendar_type": "solar",
                    "gender": "male",
                    "persona": "classic",
                },
                "reading_data": {"one_liner": ""},
                "expires_at": "2099-01-01T00:00:00+00:00",
            }
        ]
    )

    def table_side_effect(name: str):
        tables = {
            "profile_share_codes": share_codes_table,
            "shared_saju": shared_saju_table,
        }
        return tables[name]

    with (
        patch("app.api.profile_share.supabase") as mock_supabase,
        patch("app.api.profile_share.db_execute", side_effect=lambda fn: fn()),
    ):
        mock_supabase.table.side_effect = table_side_effect
        mock_supabase.rpc.return_value.execute.return_value = MagicMock(
            data=[{"success": True}]
        )

        response = client.post("/api/profile/by-code/ABC123/redeem")

    profile_share_test_app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["sharer_name"] == "공유 프로필"
    assert payload["birth_input"]["birth_solar"] == "1990-01-15"
    assert payload["birth_input"]["gender"] == "male"
    assert payload["reading_data"]["one_liner"] == ""
