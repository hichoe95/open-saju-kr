import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api import deps as deps_module
from app.api.admin import (
    MANAGED_ADMIN_CONFIG_DEFAULTS,
    _is_admin_user,
    _sanitize_config_items,
    _validate_config_update_value,
    require_admin,
    sync_admin_users_from_env,
    router as admin_router,
)
from app.api.payment import router as payment_router
from app.api.profile import router as profile_router
from app.api.deps import get_current_user_id
from app.schemas.inputs import ModelSelection
from app.services.chat_service import ChatService
from app.services.config_service import ConfigService, config_service
from app.services.slack_service import SlackService


admin_test_app = FastAPI()
admin_test_app.include_router(admin_router, prefix="/api")

payment_test_app = FastAPI()
payment_test_app.include_router(payment_router, prefix="/api")

profile_test_app = FastAPI()
profile_test_app.include_router(profile_router, prefix="/api")


@pytest.fixture(autouse=True)
def reset_rate_limit_store():
    deps_module._rate_limit_store.clear()
    yield
    deps_module._rate_limit_store.clear()
    admin_test_app.dependency_overrides.clear()
    payment_test_app.dependency_overrides.clear()
    profile_test_app.dependency_overrides.clear()


@pytest.fixture
def admin_client():
    return TestClient(admin_test_app)


@pytest.fixture
def payment_client():
    return TestClient(payment_test_app)


@pytest.fixture
def profile_client():
    return TestClient(profile_test_app)


class TestAdminConfigValidation:
    def test_accepts_gpt_5_4_model_id(self):
        assert _validate_config_update_value("model_main", "gpt-5.4") == "gpt-5.4"

    def test_accepts_gpt_5_4_mini_model_id(self):
        assert (
            _validate_config_update_value("model_main", "gpt-5.4-mini")
            == "gpt-5.4-mini"
        )

    def test_accepts_gpt_5_4_nano_model_id(self):
        assert (
            _validate_config_update_value("model_main", "gpt-5.4-nano")
            == "gpt-5.4-nano"
        )

    def test_accepts_supported_model_id(self):
        assert _validate_config_update_value("model_main", "gpt-5.1") == "gpt-5.1"

    def test_rejects_unsupported_model_id(self):
        with pytest.raises(HTTPException) as exc_info:
            _validate_config_update_value("model_main", "gpt-bogus")

        assert exc_info.value.status_code == 400
        assert "지원하지 않는 모델 ID" in str(exc_info.value.detail)

    def test_normalizes_non_negative_pricing_value(self):
        assert _validate_config_update_value("tab_love", "60") == 60

    def test_rejects_negative_pricing_value(self):
        with pytest.raises(HTTPException) as exc_info:
            _validate_config_update_value("tab_love", "-10")

        assert exc_info.value.status_code == 400
        assert "0 이상의 정수" in str(exc_info.value.detail)


class TestConfigServiceGuards:
    def test_gpt_5_4_model_is_preserved(self, monkeypatch):
        service = ConfigService()

        async def fake_get(key, default=None):
            return "gpt-5.4"

        monkeypatch.setattr(service, "get", fake_get)

        model_id = asyncio.run(service.get_feature_model("main", "gpt-5.2"))

        assert model_id == "gpt-5.4"

    def test_model_main_default_is_gpt_5_4_nano(self, monkeypatch):
        service = ConfigService()

        async def fake_get(key, default=None):
            return default

        monkeypatch.setattr(service, "get", fake_get)

        model_id = asyncio.run(service.get_model_main())

        assert model_id == "gpt-5.4-nano"

    def test_negative_feature_price_falls_back_to_default(self, monkeypatch):
        service = ConfigService()

        async def fake_get(key, default=None):
            return "-25"

        monkeypatch.setattr(service, "get", fake_get)

        price = asyncio.run(service.get_feature_price("tab_love", 60))

        assert price == 60

    def test_invalid_model_falls_back_to_default(self, monkeypatch):
        service = ConfigService()

        async def fake_get(key, default=None):
            return "invalid-model"

        monkeypatch.setattr(service, "get", fake_get)

        model_id = asyncio.run(service.get_feature_model("main", "gpt-5.4-nano"))

        assert model_id == "gpt-5.4-nano"

    def test_invalid_persona_falls_back_to_classic(self, monkeypatch):
        service = ConfigService()

        async def fake_get(key, default=None):
            return "seonbi"

        monkeypatch.setattr(service, "get", fake_get)

        persona = asyncio.run(service.get_default_persona())

        assert persona == "classic"

    def test_decimal_feature_price_falls_back_to_default(self, monkeypatch):
        service = ConfigService()

        async def fake_get(key, default=None):
            return "60.9"

        monkeypatch.setattr(service, "get", fake_get)

        price = asyncio.run(service.get_feature_price("tab_love", 60))

        assert price == 60


class TestModelSelectionValidation:
    def test_invalid_reasoning_effort_defers_to_admin_default(self):
        selection = ModelSelection(reasoning_effort="nonsense")

        assert selection.reasoning_effort is None


class TestChatStreamRollback:
    def test_free_stream_failure_cleans_messages_and_rolls_back_without_refund(self):
        service = ChatService()

        with (
            patch.object(
                service, "_cleanup_turn_messages", new=AsyncMock()
            ) as cleanup_mock,
            patch(
                "app.services.chat_service.refund_on_failure",
                new=AsyncMock(return_value=True),
            ) as refund_mock,
            patch(
                "app.services.chat_service.db_execute",
                new=AsyncMock(return_value=SimpleNamespace(data=[])),
            ) as db_execute_mock,
        ):
            refunded = asyncio.run(
                service._rollback_failed_stream_turn(
                    session_id="session-1",
                    user_id="user-1",
                    target_turn=3,
                    turn_reserved=True,
                    reserved_from_turn=2,
                    charged_transaction_id=None,
                    is_regenerate=False,
                    response_persisted=False,
                    refund_reason="스트리밍 실패",
                )
            )

        assert refunded is False
        cleanup_mock.assert_awaited_once_with("session-1", 3)
        refund_mock.assert_not_awaited()
        db_execute_mock.assert_awaited_once()

    def test_free_stream_failure_rolls_back_turn_only(self):
        service = ChatService()

        with (
            patch.object(
                service, "_cleanup_turn_messages", new=AsyncMock()
            ) as cleanup_mock,
            patch(
                "app.services.chat_service.refund_on_failure",
                new=AsyncMock(return_value=True),
            ) as refund_mock,
            patch(
                "app.services.chat_service.db_execute",
                new=AsyncMock(return_value=SimpleNamespace(data=[])),
            ) as db_execute_mock,
        ):
            refunded = asyncio.run(
                service._rollback_failed_stream_turn(
                    session_id="session-1",
                    user_id="user-1",
                    target_turn=1,
                    turn_reserved=True,
                    reserved_from_turn=0,
                    charged_transaction_id=None,
                    is_regenerate=False,
                    response_persisted=False,
                    refund_reason="스트리밍 실패",
                )
            )

        assert refunded is False
        cleanup_mock.assert_awaited_once_with("session-1", 1)
        refund_mock.assert_not_awaited()
        db_execute_mock.assert_awaited_once()

    def test_paid_stream_failure_still_refunds(self):
        service = ChatService()

        with (
            patch.object(
                service, "_cleanup_turn_messages", new=AsyncMock()
            ) as cleanup_mock,
            patch(
                "app.services.chat_service.refund_on_failure",
                new=AsyncMock(return_value=True),
            ) as refund_mock,
            patch(
                "app.services.chat_service.db_execute",
                new=AsyncMock(return_value=SimpleNamespace(data=[])),
            ) as db_execute_mock,
        ):
            refunded = asyncio.run(
                service._rollback_failed_stream_turn(
                    session_id="session-2",
                    user_id="user-2",
                    target_turn=4,
                    turn_reserved=True,
                    reserved_from_turn=3,
                    charged_transaction_id="tx-1",
                    is_regenerate=False,
                    response_persisted=False,
                    refund_reason="스트리밍 실패",
                )
            )

        assert refunded is True
        cleanup_mock.assert_awaited_once_with("session-2", 4)
        refund_mock.assert_awaited_once_with("user-2", "tx-1", "스트리밍 실패")
        db_execute_mock.assert_awaited_once()

    def test_regenerate_stream_failure_preserves_existing_turn_messages(self):
        service = ChatService()

        with (
            patch.object(
                service, "_cleanup_turn_messages", new=AsyncMock()
            ) as cleanup_mock,
            patch(
                "app.services.chat_service.refund_on_failure",
                new=AsyncMock(return_value=True),
            ) as refund_mock,
            patch(
                "app.services.chat_service.db_execute",
                new=AsyncMock(return_value=SimpleNamespace(data=[])),
            ) as db_execute_mock,
        ):
            refunded = asyncio.run(
                service._rollback_failed_stream_turn(
                    session_id="session-3",
                    user_id="user-3",
                    target_turn=5,
                    turn_reserved=False,
                    reserved_from_turn=None,
                    charged_transaction_id=None,
                    is_regenerate=True,
                    response_persisted=False,
                    refund_reason="재생성 실패",
                )
            )

        assert refunded is False
        cleanup_mock.assert_not_awaited()
        refund_mock.assert_not_awaited()
        db_execute_mock.assert_not_awaited()


class TestChatSendMessageRollback:
    def test_send_message_free_failure_passes_charge_context_to_rollback(self):
        service = ChatService()
        reserve_result = SimpleNamespace(data=[{"id": "session-1", "current_turn": 1}])

        with (
            patch.object(
                service,
                "_get_session_row",
                new=AsyncMock(
                    return_value={
                        "id": "session-1",
                        "user_id": "user-1",
                        "status": "active",
                        "current_turn": 0,
                        "max_turns": 20,
                        "persona": "classic",
                    }
                ),
            ),
            patch.object(
                service,
                "_charge_chat_turn",
                new=AsyncMock(return_value=(0, None)),
            ),
            patch.object(
                service,
                "_build_chat_messages",
                return_value=[{"role": "user", "content": "hello"}],
            ),
            patch.object(
                service,
                "_rollback_failed_stream_turn",
                new=AsyncMock(return_value=False),
            ) as rollback_mock,
            patch(
                "app.services.chat_service.db_execute",
                new=AsyncMock(return_value=reserve_result),
            ),
            patch(
                "app.services.chat_service.ProviderFactory.get_provider",
                return_value=MagicMock(generate=AsyncMock()),
            ),
            patch(
                "app.services.chat_service.llm_call_with_retry",
                new=AsyncMock(side_effect=RuntimeError("boom")),
            ),
            patch(
                "app.services.chat_service.config_service.get_model_decision",
                new=AsyncMock(return_value="gpt-5.2"),
            ),
            patch(
                "app.services.chat_service.config_service.get_reasoning_effort_decision",
                new=AsyncMock(return_value="low"),
            ),
        ):
            with pytest.raises(HTTPException) as exc_info:
                asyncio.run(service.send_message("user-1", "session-1", "hello"))

        assert exc_info.value.status_code == 500
        rollback_mock.assert_awaited_once()
        await_args = rollback_mock.await_args
        assert await_args is not None
        rollback_kwargs = cast(dict[str, Any], await_args.kwargs)
        assert "free_usage_feature_key" not in rollback_kwargs
        assert rollback_kwargs["charged_transaction_id"] is None


class TestRateLimitCoverage:
    def test_is_admin_user_reads_database_flag(self):
        with patch(
            "app.api.admin.db_execute",
            new=AsyncMock(return_value=SimpleNamespace(data=[{"is_admin": True}])),
        ):
            is_admin = asyncio.run(_is_admin_user("admin-user"))

        assert is_admin is True

    def test_require_admin_rejects_non_admin_even_if_env_contains_user(self):
        admin_test_app.dependency_overrides[get_current_user_id] = lambda: "user-1"
        client = TestClient(admin_test_app)

        with (
            patch("app.api.admin.settings") as mock_settings,
            patch(
                "app.api.admin.db_execute",
                new=AsyncMock(return_value=SimpleNamespace(data=[{"is_admin": False}])),
            ),
        ):
            mock_settings.admin_user_ids = "user-1"
            response = client.get("/api/admin/check")

        assert response.status_code == 200
        assert response.json()["is_admin"] is False

        with patch(
            "app.api.admin.db_execute",
            new=AsyncMock(return_value=SimpleNamespace(data=[{"is_admin": False}])),
        ):
            with pytest.raises(HTTPException) as exc_info:
                asyncio.run(require_admin("user-1"))

        assert exc_info.value.status_code == 403

    def test_sync_admin_users_from_env_bootstraps_db_flag(self):
        with (
            patch("app.api.admin.settings") as mock_settings,
            patch(
                "app.api.admin.db_execute",
                new=AsyncMock(return_value=SimpleNamespace(data=[])),
            ) as db_execute_mock,
        ):
            mock_settings.admin_user_ids = "admin-1,admin-2"
            asyncio.run(sync_admin_users_from_env())

        assert db_execute_mock.await_count == 2

    def test_share_create_requires_redis_when_protected(self, admin_client):
        route = deps_module.rate_limit_dependency(limit=1, scope="share_create")
        request = MagicMock()
        request.headers = {}
        request.cookies = {}
        request.client = SimpleNamespace(host="127.0.0.1")

        with (
            patch("app.api.deps.get_settings") as mock_settings,
            patch("app.api.deps._get_redis_client", return_value=None),
            patch("app.api.deps._extract_user_id_from_request", return_value=None),
            patch("app.api.deps._get_client_ip", return_value="127.0.0.1"),
        ):
            mock_settings.return_value = SimpleNamespace(
                require_redis_for_payment_rate_limit=True,
            )

            with pytest.raises(HTTPException) as exc_info:
                asyncio.run(route(request))

        assert exc_info.value.status_code == 503
        assert exc_info.value.detail == "Rate limit backend unavailable"

    def test_admin_model_update_invalidates_config_cache(self, admin_client):
        admin_test_app.dependency_overrides[require_admin] = lambda: "admin-user"

        with (
            patch(
                "app.api.admin.db_execute",
                new=AsyncMock(
                    return_value=SimpleNamespace(data=[{"key": "model_main"}])
                ),
            ),
            patch("app.api.admin.log_admin_action", new=AsyncMock()),
            patch("app.services.notification_service.notifier.notify_config_changed"),
            patch.object(config_service, "invalidate") as invalidate_mock,
        ):
            response = admin_client.put(
                "/api/admin/config/model_main", json={"value": "gpt-5.4"}
            )

        assert response.status_code == 200
        assert response.json()["value"] == "gpt-5.4"
        invalidate_mock.assert_called_once()

    def test_admin_config_update_creates_missing_managed_key(self, admin_client):
        admin_test_app.dependency_overrides[require_admin] = lambda: "admin-user"

        mock_results = [
            SimpleNamespace(data=[]),
            SimpleNamespace(data=[{"key": "review_login_code", "value": "TEST-CODE"}]),
        ]

        async def fake_db_execute(_fn):
            return mock_results.pop(0)

        with (
            patch("app.api.admin.db_execute", side_effect=fake_db_execute),
            patch("app.api.admin.log_admin_action", new=AsyncMock()),
            patch("app.services.notification_service.notifier.notify_config_changed"),
            patch.object(config_service, "invalidate") as invalidate_mock,
        ):
            response = admin_client.put(
                "/api/admin/config/review_login_code", json={"value": "TEST-CODE"}
            )

        assert response.status_code == 200
        assert response.json()["value"] == "TEST-CODE"
        invalidate_mock.assert_called_once()

    def test_admin_config_update_is_rate_limited(self, admin_client):
        admin_test_app.dependency_overrides[require_admin] = lambda: "admin-user"

        with (
            patch(
                "app.api.admin.db_execute",
                new=AsyncMock(return_value=SimpleNamespace(data=[{"key": "tab_love"}])),
            ),
            patch("app.api.admin.log_admin_action", new=AsyncMock()),
            patch("app.services.notification_service.notifier.notify_config_changed"),
        ):
            for _ in range(20):
                response = admin_client.put(
                    "/api/admin/config/tab_love", json={"value": "60"}
                )
                assert response.status_code == 200

            blocked = admin_client.put(
                "/api/admin/config/tab_love", json={"value": "60"}
            )

        assert blocked.status_code == 429


class TestAdminPaymentHardening:
    def test_admin_config_synthesizes_managed_system_keys(self):
        rows = [
            {
                "key": "tab_love",
                "value": 60,
                "description": "연애 탭",
                "updated_at": "2026-03-18T00:00:00Z",
            }
        ]

        items = _sanitize_config_items(rows)
        keys = {item["key"] for item in items}

        assert "tab_love" in keys
        assert set(MANAGED_ADMIN_CONFIG_DEFAULTS).issubset(keys)

    def test_get_payment_issues_omits_sensitive_fields(self, admin_client):
        admin_test_app.dependency_overrides[require_admin] = lambda: "admin-user"

        async def mock_db_execute(fn):
            return fn()

        with (
            patch("app.api.admin.db_execute", side_effect=mock_db_execute),
            patch("app.api.admin.supabase") as mock_supabase,
        ):
            payments_table = MagicMock()
            payments_table.select.return_value.in_.return_value.order.return_value.range.return_value.execute.return_value = SimpleNamespace(
                data=[
                    {
                        "id": "payment-1",
                        "user_id": "user-1",
                        "amount": 1000,
                        "failure_code": "PAYMENT_FAILED",
                        "failure_message": "실패",
                        "created_at": "2026-03-06T00:00:00Z",
                        "payment_key": "should-not-leak",
                        "toss_secret": "should-not-leak",
                    }
                ],
                count=1,
            )
            refunds_table = MagicMock()
            refunds_table.select.return_value.in_.return_value.order.return_value.limit.return_value.execute.return_value = SimpleNamespace(
                data=[]
            )

            def table_side_effect(name: str):
                if name == "payments":
                    return payments_table
                if name == "coin_transactions":
                    return refunds_table
                raise AssertionError(name)

            mock_supabase.table.side_effect = table_side_effect

            response = admin_client.get("/api/admin/payments/issues")

        assert response.status_code == 200
        failed_payment = response.json()["failed_payments"][0]
        assert "payment_key" not in failed_payment
        assert "toss_secret" not in failed_payment

    def test_admin_config_hides_slack_webhook(self, admin_client):
        admin_test_app.dependency_overrides[require_admin] = lambda: "admin-user"

        async def mock_db_execute(fn):
            return fn()

        with (
            patch("app.api.admin.db_execute", side_effect=mock_db_execute),
            patch("app.api.admin.supabase") as mock_supabase,
        ):
            config_table = MagicMock()
            config_table.select.return_value.order.return_value.execute.return_value = (
                SimpleNamespace(
                    data=[
                        {"key": "tab_love", "value": 60},
                        {
                            "key": "slack_webhook_url",
                            "value": "https://hooks.slack.com/services/secret",
                        },
                    ]
                )
            )
            mock_supabase.table.return_value = config_table

            response = admin_client.get("/api/admin/config")

        assert response.status_code == 200
        keys = {item["key"] for item in response.json()}
        assert "tab_love" in keys
        assert "slack_webhook_url" not in keys

    def test_admin_config_rejects_generic_slack_webhook_update(self, admin_client):
        admin_test_app.dependency_overrides[require_admin] = lambda: "admin-user"

        response = admin_client.put(
            "/api/admin/config/slack_webhook_url",
            json={"value": "https://hooks.slack.com/services/secret"},
        )

        assert response.status_code == 400
        assert "/admin/config/alerts" in response.json()["detail"]

    def test_alert_config_allows_clearing_slack_webhook(self, admin_client):
        admin_test_app.dependency_overrides[require_admin] = lambda: "admin-user"

        async def mock_db_execute(fn):
            return fn()

        with (
            patch("app.api.admin.db_execute", side_effect=mock_db_execute),
            patch("app.api.admin.supabase") as mock_supabase,
            patch("app.api.admin.log_admin_action", new=AsyncMock()) as log_mock,
        ):
            app_config_table = MagicMock()
            app_config_table.upsert.return_value.execute.return_value = SimpleNamespace(
                data=[{"key": "slack_webhook_url"}]
            )
            mock_supabase.table.return_value = app_config_table

            response = admin_client.put(
                "/api/admin/config/alerts",
                json={"slack_webhook_url": ""},
            )

        assert response.status_code == 200
        upsert_payload = app_config_table.upsert.call_args.args[0]
        assert upsert_payload["key"] == "slack_webhook_url"
        assert upsert_payload["value"] == ""
        assert log_mock.await_count == 1


class TestSlackConfigBehavior:
    def test_db_empty_webhook_disables_env_fallback(self):
        service = SlackService()

        async def mock_db_execute(fn):
            return fn()

        with (
            patch("app.services.slack_service.get_settings") as mock_settings,
            patch("app.db.supabase_client.db_execute", side_effect=mock_db_execute),
            patch("app.db.supabase_client.supabase") as mock_supabase,
        ):
            mock_settings.return_value = SimpleNamespace(
                slack_webhook_url="https://hooks.slack.com/services/env-fallback"
            )
            config_table = MagicMock()
            config_table.select.return_value.eq.return_value.single.return_value.execute.return_value = SimpleNamespace(
                data={"value": ""}
            )
            mock_supabase.table.return_value = config_table

            result = asyncio.run(service._get_configured_url())

        assert result is None

    def test_payment_wallet_is_rate_limited(self, payment_client):
        payment_test_app.dependency_overrides[get_current_user_id] = lambda: "user-1"

        async def mock_db_execute(fn):
            return fn()

        with (
            patch("app.api.payment.db_execute", side_effect=mock_db_execute),
            patch("app.api.payment.supabase") as mock_supabase,
        ):
            mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = SimpleNamespace(
                data=[{"balance": 10, "total_charged": 20, "total_spent": 5}]
            )

            for _ in range(30):
                response = payment_client.get("/api/payment/wallet")
                assert response.status_code == 200

            blocked = payment_client.get("/api/payment/wallet")

        assert blocked.status_code == 429

    def test_profile_list_is_rate_limited(self, profile_client):
        profile_test_app.dependency_overrides[get_current_user_id] = lambda: "user-1"

        with patch("app.api.profile.supabase") as mock_supabase:
            mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = SimpleNamespace(
                data=[]
            )

            for _ in range(30):
                response = profile_client.get("/api/saju/profiles")
                assert response.status_code == 200

            blocked = profile_client.get("/api/saju/profiles")

        assert blocked.status_code == 429
