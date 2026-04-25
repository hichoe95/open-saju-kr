import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.deps import get_current_user_id
from app.api.received_profiles import router as received_profiles_router


received_profiles_test_app = FastAPI()
received_profiles_test_app.include_router(received_profiles_router, prefix="/api")


def test_receive_profile_consumes_share_code_and_returns_analysis_data():
    received_profiles_test_app.dependency_overrides[get_current_user_id] = lambda: (
        "receiver-user"
    )
    client = TestClient(received_profiles_test_app)

    profile_share_codes_table = MagicMock()
    profile_share_codes_table.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[{"profile_id": "profile-1"}]
    )

    shared_saju_table = MagicMock()
    shared_saju_table.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[
            {
                "share_code": "ABC123",
                "user_id": "11111111-1111-1111-1111-111111111111",
                "sharer_name": "공유자",
                "birth_input": {
                    "birth_solar": "1990-01-15",
                    "birth_jiji": "子",
                    "calendar_type": "solar",
                    "gender": "male",
                    "persona": "classic",
                },
                "reading_data": {"one_liner": "테스트 분석"},
                "expires_at": "2099-01-01T00:00:00+00:00",
            }
        ]
    )

    received_profiles_table = MagicMock()
    received_profiles_table.insert.return_value.execute.return_value = MagicMock(
        data=[
            {
                "id": "received-1",
                "sharer_name": "공유자",
                "persona": "classic",
                "created_at": "2026-03-19T00:00:00+00:00",
            }
        ]
    )

    with (
        patch("app.api.received_profiles.supabase") as mock_supabase,
        patch("app.api.received_profiles.db_execute", side_effect=lambda fn: fn()),
        patch(
            "app.api.received_profiles._consume_share_code", new_callable=AsyncMock
        ) as mock_consume,
        patch(
            "app.api.received_profiles._get_profile_share_snapshot",
            new_callable=AsyncMock,
            return_value={
                "sharer_name": "공유자",
                "birth_input": {
                    "birth_solar": "1990-01-15",
                    "birth_jiji": "子",
                    "calendar_type": "solar",
                    "gender": "male",
                    "persona": "classic",
                },
                "reading_data": {"one_liner": "테스트 분석"},
            },
        ),
        patch("app.api.received_profiles.crypto_manager") as mock_crypto_manager,
    ):
        mock_supabase.table.side_effect = lambda name: {
            "profile_share_codes": profile_share_codes_table,
            "shared_saju": shared_saju_table,
            "received_profiles": received_profiles_table,
        }[name]
        mock_crypto_manager.aesgcm = object()
        mock_crypto_manager.encrypt.side_effect = lambda value: {
            "ciphertext": f"ct:{value}",
            "iv": "iv",
            "tag": "tag",
        }

        response = client.post("/api/profile/received", json={"share_code": "abc123"})

    received_profiles_test_app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["source_profile_id"] == "profile-1"
    assert payload["analysis_data"]["one_liner"] == "테스트 분석"
    mock_consume.assert_awaited_once_with("ABC123")


def test_list_received_profiles_includes_recovered_analysis_data():
    received_profiles_test_app.dependency_overrides[get_current_user_id] = lambda: (
        "receiver-user"
    )
    client = TestClient(received_profiles_test_app)

    received_profiles_table = MagicMock()
    received_profiles_table.select.return_value.eq.return_value.order.return_value.execute.return_value = MagicMock(
        data=[
            {
                "id": "received-1",
                "receiver_user_id": "receiver-user",
                "sharer_name": "공유자",
                "key_id": "v1",
                "birth_date_iv": "iv1",
                "birth_date_ct": "ct1",
                "birth_date_tag": "tag1",
                "hour_branch_iv": "iv2",
                "hour_branch_ct": "ct2",
                "hour_branch_tag": "tag2",
                "calendar_type_iv": "iv3",
                "calendar_type_ct": "ct3",
                "calendar_type_tag": "tag3",
                "gender_iv": "iv4",
                "gender_ct": "ct4",
                "gender_tag": "tag4",
                "persona": "classic",
                "source_profile_id": "profile-1",
                "source_share_code": "ABC123",
                "created_at": "2026-03-19T00:00:00+00:00",
            }
        ]
    )

    with (
        patch("app.api.received_profiles.supabase") as mock_supabase,
        patch("app.api.received_profiles.db_execute", side_effect=lambda fn: fn()),
        patch("app.api.received_profiles.crypto_manager") as mock_crypto_manager,
        patch(
            "app.api.received_profiles._get_profile_share_snapshot",
            new_callable=AsyncMock,
            return_value={"reading_data": {"one_liner": "복구됨"}},
        ),
    ):
        mock_supabase.table.side_effect = lambda name: {
            "received_profiles": received_profiles_table,
        }[name]

        values = iter(["1990-01-15", "子", "solar", "male"])
        mock_crypto_manager.decrypt.side_effect = lambda *_args, **_kwargs: next(values)

        response = client.get("/api/profile/received")

    received_profiles_test_app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 1
    assert payload[0]["source_profile_id"] == "profile-1"
    assert payload[0]["analysis_data"]["one_liner"] == "복구됨"
