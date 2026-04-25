import asyncio
import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

os.environ.setdefault("TESTING", "1")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-with-minimum-length")
os.environ.setdefault("FRONTEND_URL", "https://example.com")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.deps import get_current_user_required
from app.api.referral import process_referral_reward, router as referral_router


referral_test_app = FastAPI()
referral_test_app.include_router(referral_router, prefix="/api")


@pytest.fixture
def client() -> TestClient:
    referral_test_app.dependency_overrides[get_current_user_required] = lambda: {
        "user_id": "user-1"
    }
    test_client = TestClient(referral_test_app)
    yield test_client
    referral_test_app.dependency_overrides.clear()


def test_create_referral_link(client: TestClient):
    with (
        patch(
            "app.api.referral._get_active_referral_link_by_user",
            new=AsyncMock(return_value=None),
        ),
        patch("app.api.referral._generate_referral_code", return_value="AB12CD34"),
        patch(
            "app.api.referral.db_execute",
            new=AsyncMock(
                return_value=MagicMock(
                    data=[
                        {
                            "referral_code": "AB12CD34",
                            "created_at": "2026-03-22T00:00:00+00:00",
                        }
                    ]
                )
            ),
        ),
    ):
        response = client.post("/api/referrals/create")

    assert response.status_code == 200
    payload = response.json()
    assert payload["referral_code"] == "AB12CD34"
    assert payload["share_url"] == "https://example.com/?ref=AB12CD34"


def test_create_referral_existing(client: TestClient):
    with patch(
        "app.api.referral._get_active_referral_link_by_user",
        new=AsyncMock(
            return_value={
                "referral_code": "EXIST123",
                "created_at": "2026-03-22T00:00:00+00:00",
            }
        ),
    ):
        response = client.post("/api/referrals/create")

    assert response.status_code == 200
    payload = response.json()
    assert payload["referral_code"] == "EXIST123"
    assert payload["share_url"] == "https://example.com/?ref=EXIST123"


def test_signup_completion_reward():
    referral_redemptions_table = MagicMock()
    referral_redemptions_table.insert.return_value.execute.return_value = MagicMock(
        data=[{}]
    )
    (
        referral_redemptions_table.update.return_value.eq.return_value.execute.return_value
    ) = MagicMock(data=[{}])

    def table_side_effect(name: str):
        if name == "referral_redemptions":
            return referral_redemptions_table
        raise AssertionError(f"Unexpected table: {name}")

    mock_supabase = MagicMock()
    mock_supabase.table.side_effect = table_side_effect
    mock_supabase.rpc.return_value.execute.return_value = MagicMock(
        data=[{"transaction_id": "tx-1", "new_balance": 120}]
    )

    async def run_db(fn):
        return fn()

    with (
        patch(
            "app.api.referral._get_active_referral_link_by_code",
            new=AsyncMock(
                return_value={"id": "link-1", "referrer_user_id": "referrer-1"}
            ),
        ),
        patch("app.api.referral.supabase", mock_supabase),
        patch("app.api.referral.db_execute", new=AsyncMock(side_effect=run_db)),
    ):
        result = asyncio.run(process_referral_reward("AB12CD34", "referred-1"))

    assert result["success"] is True
    assert result["reward_amount"] == 20
    mock_supabase.rpc.assert_called_once_with(
        "grant_bonus_coins",
        {
            "p_user_id": "referrer-1",
            "p_amount": 20,
            "p_description": "리퍼럴 보너스 - 친구 가입 완료",
            "p_reference_type": "referral_bonus",
        },
    )


def test_self_referral_blocked():
    with patch(
        "app.api.referral._get_active_referral_link_by_code",
        new=AsyncMock(return_value={"id": "link-1", "referrer_user_id": "same-user"}),
    ):
        with pytest.raises(Exception) as exc_info:
            asyncio.run(process_referral_reward("AB12CD34", "same-user"))

    assert getattr(exc_info.value, "status_code", None) == 400


def test_duplicate_redemption_blocked():
    referral_redemptions_table = MagicMock()
    referral_redemptions_table.insert.return_value.execute.side_effect = Exception(
        "duplicate key value violates unique constraint"
    )

    mock_supabase = MagicMock()
    mock_supabase.table.return_value = referral_redemptions_table

    async def run_db(fn):
        return fn()

    with (
        patch(
            "app.api.referral._get_active_referral_link_by_code",
            new=AsyncMock(
                return_value={"id": "link-1", "referrer_user_id": "referrer-1"}
            ),
        ),
        patch("app.api.referral.supabase", mock_supabase),
        patch("app.api.referral.db_execute", new=AsyncMock(side_effect=run_db)),
    ):
        with pytest.raises(Exception) as exc_info:
            asyncio.run(process_referral_reward("AB12CD34", "referred-1"))

    assert getattr(exc_info.value, "status_code", None) == 409


def test_concurrent_redemption():
    referral_redemptions_table = MagicMock()
    referral_redemptions_table.insert.return_value.execute.side_effect = [
        MagicMock(data=[{"id": "row-1"}]),
        Exception("duplicate key value violates unique constraint"),
    ]
    (
        referral_redemptions_table.update.return_value.eq.return_value.execute.return_value
    ) = MagicMock(data=[{}])

    def table_side_effect(name: str):
        if name == "referral_redemptions":
            return referral_redemptions_table
        raise AssertionError(f"Unexpected table: {name}")

    mock_supabase = MagicMock()
    mock_supabase.table.side_effect = table_side_effect
    mock_supabase.rpc.return_value.execute.return_value = MagicMock(
        data=[{"transaction_id": "tx-1"}]
    )

    async def run_db(fn):
        return fn()

    async def run_concurrent_calls():
        return await asyncio.gather(
            process_referral_reward("AB12CD34", "referred-1"),
            process_referral_reward("AB12CD34", "referred-1"),
            return_exceptions=True,
        )

    with (
        patch(
            "app.api.referral._get_active_referral_link_by_code",
            new=AsyncMock(
                return_value={"id": "link-1", "referrer_user_id": "referrer-1"}
            ),
        ),
        patch("app.api.referral.supabase", mock_supabase),
        patch("app.api.referral.db_execute", new=AsyncMock(side_effect=run_db)),
    ):
        results = asyncio.run(run_concurrent_calls())

    success_count = sum(
        1 for item in results if isinstance(item, dict) and item.get("success") is True
    )
    conflict_count = sum(
        1 for item in results if getattr(item, "status_code", None) == 409
    )

    assert success_count == 1
    assert conflict_count == 1
    assert mock_supabase.rpc.call_count == 1


def test_invalid_referral_code():
    with patch(
        "app.api.referral._get_active_referral_link_by_code",
        new=AsyncMock(return_value=None),
    ):
        with pytest.raises(Exception) as exc_info:
            asyncio.run(process_referral_reward("INVALID", "referred-1"))

    assert getattr(exc_info.value, "status_code", None) == 404


def test_referral_status(client: TestClient):
    redemptions = [
        {
            "referred_user_id": "a",
            "status": "completed",
            "reward_amount": 20,
            "created_at": "2026-03-22T01:00:00+00:00",
            "completed_at": "2026-03-22T01:10:00+00:00",
        },
        {
            "referred_user_id": "b",
            "status": "pending",
            "reward_amount": 20,
            "created_at": "2026-03-22T02:00:00+00:00",
            "completed_at": None,
        },
    ]
    with (
        patch(
            "app.api.referral._get_active_referral_link_by_user",
            new=AsyncMock(return_value={"referral_code": "AB12CD34"}),
        ),
        patch(
            "app.api.referral.db_execute",
            new=AsyncMock(return_value=MagicMock(data=redemptions)),
        ),
    ):
        response = client.get("/api/referrals/status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["referral_code"] == "AB12CD34"
    assert payload["total_referred"] == 2
    assert payload["total_completed"] == 1
    assert payload["total_coins_earned"] == 20
    assert len(payload["recent_redemptions"]) == 2
