import asyncio
import hashlib
import hmac
import json
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.admin import require_admin
from app.api.payment import cleanup_stale_pending_payments, router as payment_router
from app.api.webhook import router as webhook_router


payment_cleanup_app = FastAPI()
payment_cleanup_app.include_router(payment_router, prefix="/api")

webhook_test_app = FastAPI()
webhook_test_app.include_router(webhook_router, prefix="/api")


@pytest.fixture
def client():
    return TestClient(payment_cleanup_app)


@pytest.fixture
def webhook_client():
    return TestClient(webhook_test_app)


@pytest.fixture(autouse=True)
def reset_rate_limit_store():
    from app.api import deps as deps_module

    deps_module._rate_limit_store.clear()
    yield
    deps_module._rate_limit_store.clear()


class TestPaymentCleanup:
    def test_cleanup_stale_pending_payments_returns_updated_count(self):
        async def _mock_db_execute(fn):
            return fn()

        with (
            patch("app.api.payment.supabase") as mock_supabase,
            patch(
                "app.api.payment.db_execute",
                side_effect=_mock_db_execute,
            ),
        ):
            payments_table = MagicMock()
            payments_table.update.return_value.eq.return_value.lt.return_value.execute.return_value = MagicMock(
                data=[{"id": "payment-1"}, {"id": "payment-2"}]
            )
            mock_supabase.table.return_value = payments_table

            count = asyncio.run(cleanup_stale_pending_payments(max_age_hours=12))

        assert count == 2
        payments_table.update.assert_called_with({"status": "expired"})

    def test_admin_cleanup_pending_endpoint_returns_count(self, client):
        payment_cleanup_app.dependency_overrides[require_admin] = lambda: "admin-user"

        with patch(
            "app.api.payment.cleanup_stale_pending_payments",
            new=AsyncMock(return_value=3),
        ):
            response = client.post("/api/payment/admin/cleanup-pending")

        payment_cleanup_app.dependency_overrides.pop(require_admin, None)

        assert response.status_code == 200
        assert response.json() == {"cleaned": 3}

    def test_webhook_done_restores_expired_payment_before_credit(self):
        with (
            patch("app.api.webhook.supabase") as mock_supabase,
            patch(
                "app.api.webhook._claim_webhook_event", new=AsyncMock(return_value=True)
            ),
            patch(
                "app.api.webhook._release_webhook_claim",
                new=AsyncMock(return_value=None),
            ),
        ):
            from app.api.webhook import handle_payment_status_changed

            payments_table = MagicMock()
            payments_table.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=[{"status": "expired", "order_id": "late-order"}])
            )
            payments_table.update.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
                data=[{"status": "pending"}]
            )
            mock_supabase.table.return_value = payments_table

            mock_rpc = MagicMock()
            mock_rpc.execute.return_value = MagicMock(
                data=[{"success": True, "coin_amount": 100}]
            )
            mock_supabase.rpc.return_value = mock_rpc

            asyncio.run(
                handle_payment_status_changed(
                    {
                        "paymentKey": "pk_late",
                        "orderId": "late-order",
                        "status": "DONE",
                        "method": "카드",
                        "approvedAt": "2026-02-04T00:00:00Z",
                    }
                )
            )

        payments_table.update.assert_called_once()
        mock_supabase.rpc.assert_called_with(
            "complete_payment_v2",
            {
                "p_order_id": "late-order",
                "p_payment_key": "pk_late",
                "p_method": "카드",
                "p_approved_at": "2026-02-04T00:00:00Z",
                "p_receipt_url": None,
            },
        )


class TestWebhookRoute:
    def test_webhook_route_is_not_rate_limited(self, webhook_client):
        payload = {
            "eventType": "PAYMENT_STATUS_CHANGED",
            "createdAt": "2026-03-08T00:00:00+09:00",
            "data": {
                "orderId": "order-webhook-route",
                "paymentKey": "pk_webhook_route",
                "status": "DONE",
                "method": "카드",
                "approvedAt": "2026-03-08T00:00:00+09:00",
            },
        }
        body = json.dumps(payload).encode("utf-8")
        secret = "test_webhook_secret"
        signature = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()

        with (
            patch("app.api.webhook.get_settings") as mock_settings,
            patch(
                "app.api.webhook.config_service.get_payment_mode",
                new=AsyncMock(return_value="test"),
            ),
            patch(
                "app.api.webhook._resolve_mode_for_order",
                new=AsyncMock(return_value="test"),
            ),
            patch(
                "app.api.webhook.handle_payment_status_changed",
                new=AsyncMock(return_value=None),
            ),
        ):
            mock_settings.return_value = MagicMock(
                toss_test_secret_key=secret,
                toss_live_secret_key="live_secret",
                allow_unsigned_webhook_in_test=False,
            )

            statuses = []
            for _ in range(70):
                response = webhook_client.post(
                    "/api/webhook/toss",
                    content=body,
                    headers={
                        "Content-Type": "application/json",
                        "X-Tosspayments-Signature": signature,
                    },
                )
                statuses.append(response.status_code)

        assert all(status == 200 for status in statuses)

    def test_webhook_business_failure_notifies_ops(self, webhook_client):
        payload = {
            "eventType": "PAYMENT_STATUS_CHANGED",
            "createdAt": "2026-03-08T00:00:00+09:00",
            "data": {
                "orderId": "order-webhook-fail",
                "paymentKey": "pk_webhook_fail",
                "status": "DONE",
            },
        }
        body = json.dumps(payload).encode("utf-8")
        secret = "test_webhook_secret"
        signature = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()

        with (
            patch("app.api.webhook.get_settings") as mock_settings,
            patch(
                "app.api.webhook.config_service.get_payment_mode",
                new=AsyncMock(return_value="test"),
            ),
            patch(
                "app.api.webhook._resolve_mode_for_order",
                new=AsyncMock(return_value="test"),
            ),
            patch(
                "app.api.webhook.handle_payment_status_changed",
                new=AsyncMock(side_effect=RuntimeError("boom")),
            ),
            patch(
                "app.api.webhook.notifier.notify_webhook_processing_failure"
            ) as notify_failure,
        ):
            mock_settings.return_value = MagicMock(
                toss_test_secret_key=secret,
                toss_live_secret_key="live_secret",
                allow_unsigned_webhook_in_test=False,
            )

            response = webhook_client.post(
                "/api/webhook/toss",
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Tosspayments-Signature": signature,
                },
            )

        assert response.status_code == 500
        notify_failure.assert_called_once()
