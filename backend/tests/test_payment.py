# pyright: reportMissingImports=false
"""
Payment API 테스트 모듈

테스트 대상:
- POST /payment/prepare - 결제 준비
- POST /payment/confirm - 결제 승인
- POST /payment/spend - 코인 사용
- _internal_refund_coins() - 환불 (내부 함수)
"""

import base64
import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.deps import get_current_user_id
from app.api.payment import (
    _create_insufficient_balance_error,
    _fetch_toss_order_status,
    _internal_refund_coins,
    _mask_sensitive_value,
    refund_on_failure,
    router as payment_router,
)


def _async_mock_return(value):
    async def _mock(*args, **kwargs):
        return value

    return MagicMock(side_effect=_mock)


# === Fixtures ===

payment_test_app = FastAPI()
payment_test_app.include_router(payment_router, prefix="/api")


@pytest.fixture
def client():
    """FastAPI TestClient fixture"""
    return TestClient(payment_test_app)


@pytest.fixture
def mock_supabase():
    """Supabase client mock fixture"""
    with patch("app.api.payment.supabase") as mock:
        yield mock


@pytest.fixture
def mock_httpx():
    """httpx.AsyncClient mock fixture for Toss API"""
    with patch("app.api.payment.httpx.AsyncClient") as mock:
        yield mock


@pytest.fixture
def mock_get_current_user_id():
    """get_current_user_id dependency mock fixture"""
    payment_test_app.dependency_overrides[get_current_user_id] = lambda: "test-user-id"
    yield
    payment_test_app.dependency_overrides.pop(get_current_user_id, None)


@pytest.fixture
def mock_payment_db_execute():
    async def _mock_db_execute(fn):
        return fn()

    with patch("app.api.payment.db_execute", side_effect=_mock_db_execute):
        yield


@pytest.fixture
def mock_payment_config_service():
    with patch("app.api.payment.config_service") as mock:

        async def _get_feature_price(_feature_key, default_price):
            return default_price

        async def _get_payment_mode():
            return "test"

        mock.get_feature_price = MagicMock(side_effect=_get_feature_price)
        mock.get_payment_mode = MagicMock(side_effect=_get_payment_mode)
        yield mock


@pytest.fixture
def mock_payment_analytics():
    with patch("app.api.payment.analytics") as mock:
        mock.track_event = _async_mock_return(None)
        yield mock


@pytest.fixture
def mock_payment_rate_limiter():
    with patch("app.api.payment.rate_limit_dependency", return_value=lambda: None):
        yield


@pytest.fixture
def mock_webhook_db_execute():
    async def _mock_db_execute(fn):
        return fn()

    with patch("app.api.webhook.db_execute", side_effect=_mock_db_execute):
        yield


@pytest.fixture
def mock_webhook_dedup():
    async def _claim(*_args, **_kwargs):
        return True

    async def _release(*_args, **_kwargs):
        return None

    with (
        patch("app.api.webhook._claim_webhook_event", side_effect=_claim),
        patch("app.api.webhook._release_webhook_claim", side_effect=_release),
    ):
        yield


@pytest.fixture(autouse=True)
def reset_rate_limit_store():
    from app.api import deps as deps_module

    deps_module._rate_limit_store.clear()
    yield
    deps_module._rate_limit_store.clear()


# === Unit Tests for Helper Functions ===


class TestHelperFunctions:
    """헬퍼 함수 테스트"""

    def test_mask_sensitive_value_normal(self):
        """일반 값 마스킹 테스트"""
        result = _mask_sensitive_value("payment_key_12345", 4)
        assert result == "paym*************"

    def test_mask_sensitive_value_short(self):
        """짧은 값 마스킹 테스트"""
        result = _mask_sensitive_value("abc", 4)
        assert result == "***"

    def test_mask_sensitive_value_empty(self):
        """빈 값 마스킹 테스트"""
        result = _mask_sensitive_value("", 4)
        assert result == "***"

    def test_create_insufficient_balance_error(self):
        """잔액 부족 에러 메시지 생성 테스트"""
        result = _create_insufficient_balance_error(100, 50)
        assert "필요: 100" in result
        assert "보유: 50" in result

    def test_fetch_toss_order_status_returns_none_on_invalid_json(self, mock_httpx):
        mock_client = MagicMock()
        mock_httpx.return_value.__aenter__.return_value = mock_client

        status_response = MagicMock()
        status_response.status_code = 200
        status_response.json.side_effect = ValueError("invalid json")
        mock_client.get = _async_mock_return(status_response)

        result = asyncio.run(_fetch_toss_order_status("order-1", "auth-header"))

        assert result is None


# === API Endpoint Tests ===


class TestPaymentPrepare:
    """결제 준비 API 테스트"""

    def test_payment_prepare(
        self,
        client,
        mock_supabase,
        mock_get_current_user_id,
        mock_payment_db_execute,
        mock_payment_config_service,
        mock_payment_analytics,
        mock_payment_rate_limiter,
    ):
        """
        결제 준비 성공 테스트

        Given: 유효한 상품 ID와 인증된 사용자
        When: POST /payment/prepare 호출
        Then: order_id와 결제 정보 반환
        """
        # Given
        coin_products_table = MagicMock()
        coin_products_table.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[
                {
                    "id": "prod-1",
                    "name": "100엽전",
                    "coin_amount": 100,
                    "price": 1000,
                    "bonus_amount": 10,
                }
            ]
        )

        user_identities_table = MagicMock()
        user_identities_table.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[]
        )

        payments_table = MagicMock()
        payments_table.insert.return_value.execute.return_value = MagicMock(
            data=[{"id": "payment-1"}]
        )

        def table_side_effect(name):
            tables = {
                "coin_products": coin_products_table,
                "user_identities": user_identities_table,
                "payments": payments_table,
            }
            return tables[name]

        mock_supabase.table.side_effect = table_side_effect

        # When
        with patch("app.api.payment.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(
                toss_test_client_key="test_ck_123",
                toss_live_client_key="live_ck_123",
            )
            response = client.post(
                "/api/payment/prepare", json={"product_id": "prod-1"}
            )

        # Then
        assert response.status_code == 200
        payload = response.json()
        assert payload["amount"] == 1000
        assert payload["order_name"] == "마이사주 100엽전 충전"
        assert payload["order_id"].startswith("SAJU_")
        assert payload["client_key"] == "test_ck_123"
        assert payload["payment_mode"] == "test"

        inserted = payments_table.insert.call_args.args[0]
        assert inserted["user_id"] == "test-user-id"
        assert inserted["amount"] == 1000
        assert inserted["coin_amount"] == 110
        assert inserted["bonus_amount"] == 10
        assert inserted["status"] == "pending"
        assert inserted["payment_mode_snapshot"] == "test"

    def test_payment_prepare_fails_before_pending_insert_when_client_key_missing(
        self,
        client,
        mock_supabase,
        mock_get_current_user_id,
        mock_payment_db_execute,
        mock_payment_config_service,
        mock_payment_analytics,
        mock_payment_rate_limiter,
    ):
        coin_products_table = MagicMock()
        coin_products_table.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[
                {
                    "id": "prod-1",
                    "name": "100엽전",
                    "coin_amount": 100,
                    "price": 1000,
                    "bonus_amount": 10,
                }
            ]
        )

        user_identities_table = MagicMock()
        user_identities_table.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[]
        )

        payments_table = MagicMock()

        def table_side_effect(name):
            tables = {
                "coin_products": coin_products_table,
                "user_identities": user_identities_table,
                "payments": payments_table,
            }
            return tables[name]

        mock_supabase.table.side_effect = table_side_effect

        with patch("app.api.payment.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(
                toss_test_client_key="",
                toss_live_client_key="live_ck_123",
            )
            response = client.post(
                "/api/payment/prepare", json={"product_id": "prod-1"}
            )

        assert response.status_code == 500
        assert response.json()["detail"] == "결제 설정 오류"
        payments_table.insert.assert_not_called()


class TestPaymentConfirm:
    """결제 승인 API 테스트"""

    def test_payment_confirm(
        self,
        client,
        mock_supabase,
        mock_httpx,
        mock_get_current_user_id,
        mock_payment_db_execute,
        mock_payment_config_service,
        mock_payment_analytics,
        mock_payment_rate_limiter,
    ):
        """
        결제 승인 성공 테스트 (Toss API 모킹)

        Given: 유효한 payment_key, order_id, amount
        When: POST /payment/confirm 호출
        Then: 결제 완료 및 코인 충전
        """
        # Given
        payments_table = MagicMock()
        payments_table.select.return_value.eq.return_value.execute.return_value = (
            MagicMock(
                data=[
                    {
                        "user_id": "test-user-id",
                        "amount": 1000,
                        "order_id": "order-1",
                        "status": "pending",
                    }
                ]
            )
        )
        mock_supabase.table.return_value = payments_table

        mock_supabase.rpc.return_value.execute.return_value = MagicMock(
            data=[{"success": True, "new_balance": 210, "coin_amount": 110}]
        )

        with patch("app.api.payment.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(
            toss_test_secret_key="toss-test-secret-for-unit-test",
                toss_live_secret_key="",
                toss_test_client_key="test_ck_123",
                toss_live_client_key="",
            )

            mock_client = MagicMock()
            mock_httpx.return_value.__aenter__.return_value = mock_client

            confirm_response = MagicMock()
            confirm_response.status_code = 200
            confirm_response.json.return_value = {
                "status": "DONE",
                "orderId": "order-1",
                "totalAmount": 1000,
                "paymentKey": "pk_test",
                "method": "카드",
                "approvedAt": "2026-02-04T00:00:00Z",
                "receipt": {"url": "https://receipt.test"},
            }
            mock_client.post = _async_mock_return(confirm_response)

            # When
            response = client.post(
                "/api/payment/confirm",
                json={"payment_key": "pk_test", "order_id": "order-1", "amount": 1000},
            )

        # Then
        assert response.status_code == 200
        payload = response.json()
        assert payload["success"] is True
        assert payload["balance"] == 210
        assert payload["charged"] == 110

        mock_supabase.rpc.assert_called_with(
            "complete_payment_v2",
            {
                "p_order_id": "order-1",
                "p_payment_key": "pk_test",
                "p_method": "카드",
                "p_approved_at": "2026-02-04T00:00:00Z",
                "p_receipt_url": "https://receipt.test",
            },
        )

    def test_payment_confirm_already_processed(
        self,
        client,
        mock_supabase,
        mock_httpx,
        mock_get_current_user_id,
        mock_payment_db_execute,
        mock_payment_config_service,
        mock_payment_analytics,
        mock_payment_rate_limiter,
    ):
        """
        이미 처리된 결제 멱등성 테스트

        Given: 이미 승인된 결제 정보
        When: POST /payment/confirm 재호출
        Then: ALREADY_PROCESSED_PAYMENT 처리 및 기존 결과 반환
        """
        # Given
        payments_table = MagicMock()
        payments_table.select.return_value.eq.return_value.execute.return_value = (
            MagicMock(
                data=[
                    {
                        "user_id": "test-user-id",
                        "amount": 1000,
                        "order_id": "order-2",
                        "status": "pending",
                    }
                ]
            )
        )
        mock_supabase.table.return_value = payments_table

        mock_supabase.rpc.return_value.execute.return_value = MagicMock(
            data=[{"success": True, "new_balance": 300, "coin_amount": 110}]
        )

        with patch("app.api.payment.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(
            toss_test_secret_key="toss-test-secret-for-unit-test",
                toss_live_secret_key="",
                toss_test_client_key="test_ck_123",
                toss_live_client_key="",
            )

            mock_client = MagicMock()
            mock_httpx.return_value.__aenter__.return_value = mock_client

            already_processed_response = MagicMock()
            already_processed_response.status_code = 400
            already_processed_response.json.return_value = {
                "code": "ALREADY_PROCESSED_PAYMENT",
                "message": "이미 처리된 결제입니다",
            }

            status_response = MagicMock()
            status_response.status_code = 200
            status_response.json.return_value = {
                "status": "DONE",
                "orderId": "order-2",
                "totalAmount": 1000,
                "paymentKey": "pk_done",
                "method": "카드",
                "approvedAt": "2026-02-04T00:00:00Z",
                "receipt": {"url": "https://receipt.done"},
            }

            mock_client.post = _async_mock_return(already_processed_response)
            mock_client.get = _async_mock_return(status_response)

            # When
            response = client.post(
                "/api/payment/confirm",
                json={"payment_key": "pk_test", "order_id": "order-2", "amount": 1000},
            )

        # Then
        assert response.status_code == 200
        payload = response.json()
        assert payload["success"] is True
        assert payload["charged"] == 110
        assert mock_client.get.call_count == 1

    def test_payment_confirm_uses_snapshot_mode_if_present(
        self,
        client,
        mock_supabase,
        mock_httpx,
        mock_get_current_user_id,
        mock_payment_db_execute,
        mock_payment_config_service,
        mock_payment_analytics,
        mock_payment_rate_limiter,
    ):
        payments_table = MagicMock()
        payments_table.select.return_value.eq.return_value.execute.return_value = (
            MagicMock(
                data=[
                    {
                        "user_id": "test-user-id",
                        "amount": 1000,
                        "order_id": "order-snapshot",
                        "status": "pending",
                        "payment_mode_snapshot": "live",
                    }
                ]
            )
        )
        mock_supabase.table.return_value = payments_table

        mock_supabase.rpc.return_value.execute.return_value = MagicMock(
            data=[{"success": True, "new_balance": 210, "coin_amount": 110}]
        )

        with patch("app.api.payment.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(
            toss_test_secret_key="toss-test-secret-for-unit-test",
            toss_live_secret_key="toss-live-secret-for-unit-test",
                toss_test_client_key="test_ck_123",
                toss_live_client_key="live_ck_123",
            )

            mock_client = MagicMock()
            mock_httpx.return_value.__aenter__.return_value = mock_client

            confirm_response = MagicMock()
            confirm_response.status_code = 200
            confirm_response.json.return_value = {
                "status": "DONE",
                "orderId": "order-snapshot",
                "totalAmount": 1000,
                "paymentKey": "pk_snapshot",
                "method": "카드",
                "approvedAt": "2026-02-04T00:00:00Z",
            }
            mock_client.post = _async_mock_return(confirm_response)

            response = client.post(
                "/api/payment/confirm",
                json={
                    "payment_key": "pk_snapshot",
                    "order_id": "order-snapshot",
                    "amount": 1000,
                },
            )

        assert response.status_code == 200
        expected_auth = f"Basic {base64.b64encode('toss-live-secret-for-unit-test:'.encode()).decode()}"
        assert (
            mock_client.post.call_args.kwargs["headers"]["Authorization"]
            == expected_auth
        )
        assert mock_payment_config_service.get_payment_mode.call_count == 0

    def test_payment_confirm_timeout_falls_back_to_status_check(
        self,
        client,
        mock_supabase,
        mock_httpx,
        mock_get_current_user_id,
        mock_payment_db_execute,
        mock_payment_config_service,
        mock_payment_analytics,
        mock_payment_rate_limiter,
    ):
        payments_table = MagicMock()
        payments_table.select.return_value.eq.return_value.execute.return_value = (
            MagicMock(
                data=[
                    {
                        "user_id": "test-user-id",
                        "amount": 1000,
                        "order_id": "order-timeout",
                        "status": "pending",
                    }
                ]
            )
        )
        mock_supabase.table.return_value = payments_table
        mock_supabase.rpc.return_value.execute.return_value = MagicMock(
            data=[{"success": True, "new_balance": 210, "coin_amount": 110}]
        )

        with patch("app.api.payment.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(
            toss_test_secret_key="toss-test-secret-for-unit-test",
                toss_live_secret_key="",
                toss_test_client_key="test_ck_123",
                toss_live_client_key="",
            )

            mock_client = MagicMock()
            mock_httpx.return_value.__aenter__.return_value = mock_client

            status_response = MagicMock()
            status_response.status_code = 200
            status_response.json.return_value = {
                "status": "DONE",
                "orderId": "order-timeout",
                "totalAmount": 1000,
                "paymentKey": "pk_timeout_done",
                "method": "카드",
                "approvedAt": "2026-02-04T00:00:00Z",
            }

            async def _post(*args, **kwargs):
                raise httpx.TimeoutException("timeout")

            mock_client.post = MagicMock(side_effect=_post)
            mock_client.get = _async_mock_return(status_response)

            response = client.post(
                "/api/payment/confirm",
                json={
                    "payment_key": "pk_timeout_done",
                    "order_id": "order-timeout",
                    "amount": 1000,
                },
            )

        assert response.status_code == 200
        assert response.json()["charged"] == 110
        assert mock_client.get.call_count == 1

    def test_payment_confirm_request_error_keeps_payment_reconcilable(
        self,
        client,
        mock_supabase,
        mock_httpx,
        mock_get_current_user_id,
        mock_payment_db_execute,
        mock_payment_config_service,
        mock_payment_analytics,
        mock_payment_rate_limiter,
    ):
        payments_table = MagicMock()
        payments_table.select.return_value.eq.return_value.execute.return_value = (
            MagicMock(
                data=[
                    {
                        "user_id": "test-user-id",
                        "amount": 1000,
                        "order_id": "order-request-error",
                        "status": "pending",
                    }
                ]
            )
        )
        mock_supabase.table.return_value = payments_table

        with patch("app.api.payment.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(
            toss_test_secret_key="toss-test-secret-for-unit-test",
                toss_live_secret_key="",
                toss_test_client_key="test_ck_123",
                toss_live_client_key="",
            )

            mock_client = MagicMock()
            mock_httpx.return_value.__aenter__.return_value = mock_client

            async def _post(*args, **kwargs):
                raise httpx.RequestError("network")

            mock_client.post = MagicMock(side_effect=_post)
            mock_client.get = _async_mock_return(MagicMock(status_code=503))

            response = client.post(
                "/api/payment/confirm",
                json={
                    "payment_key": "pk_request_error",
                    "order_id": "order-request-error",
                    "amount": 1000,
                },
            )

        assert response.status_code == 409
        assert "결제 상태 확인 중" in response.json()["detail"]
        rpc_names = [call.args[0] for call in mock_supabase.rpc.call_args_list]
        assert "fail_payment" not in rpc_names


class TestSpendCoins:
    """코인 사용 API 테스트"""

    def test_spend_coins(
        self,
        client,
        mock_supabase,
        mock_get_current_user_id,
        mock_payment_db_execute,
        mock_payment_config_service,
        mock_payment_rate_limiter,
    ):
        """
        코인 사용 성공 테스트

        Given: 충분한 잔액과 유효한 feature_key
        When: POST /payment/spend 호출
        Then: 코인 차감 및 새 잔액 반환
        """
        # Given
        mock_supabase.rpc.return_value.execute.return_value = MagicMock(
            data=[{"new_balance": 900, "transaction_id": "tx-1"}]
        )

        # When
        response = client.post(
            "/api/payment/spend",
            json={"feature_key": "compatibility", "reference_id": "cmp-1"},
        )

        # Then
        assert response.status_code == 200
        payload = response.json()
        assert payload["success"] is True
        assert payload["spent"] == 50
        assert payload["balance"] == 900

    def test_spend_coins_insufficient(
        self,
        client,
        mock_supabase,
        mock_get_current_user_id,
        mock_payment_db_execute,
        mock_payment_config_service,
        mock_payment_rate_limiter,
    ):
        """
        잔액 부족 테스트

        Given: 부족한 잔액
        When: POST /payment/spend 호출
        Then: 400 에러 및 잔액 부족 메시지
        """
        # Given
        mock_supabase.rpc.return_value.execute.side_effect = [
            Exception("INSUFFICIENT_BALANCE: not enough"),
            MagicMock(data=[{"valid_balance": 50}]),
        ]

        # When
        response = client.post(
            "/api/payment/spend",
            json={"feature_key": "compatibility", "reference_id": "cmp-1"},
        )

        # Then
        assert response.status_code == 400
        assert "필요: 50" in response.json()["detail"]
        assert "보유: 50" in response.json()["detail"]

    def test_spend_reading_reanalyze_grants_entitlement_and_allows_detail_fetch(
        self,
        client,
        mock_supabase,
        mock_get_current_user_id,
        mock_payment_db_execute,
        mock_payment_config_service,
        mock_payment_rate_limiter,
    ):
        captured_context: dict[str, object] = {}

        user_readings_table = MagicMock()
        user_reading_row = {
            "id": "reading-1",
            "context_json": {"context": {"topic": "love"}},
        }

        select_query = MagicMock()
        select_query.eq.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[user_reading_row]
        )
        user_readings_table.select.return_value = select_query

        update_query = MagicMock()
        update_query.eq.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[]
        )

        def _capture_update(payload):
            captured_context["context_json"] = payload.get("context_json")
            return update_query

        user_readings_table.update.side_effect = _capture_update

        mock_supabase.table.side_effect = lambda table_name: user_readings_table
        mock_supabase.rpc.return_value.execute.return_value = MagicMock(
            data=[{"new_balance": 820, "transaction_id": "tx-reading-1"}]
        )

        response = client.post(
            "/api/payment/spend",
            json={"feature_key": "reading_reanalyze", "reference_id": "reading-1"},
        )

        assert response.status_code == 200
        payload = response.json()
        assert payload["success"] is True
        assert payload["spent"] == 150
        assert payload["all_tabs_included"] is True

        merged_context = captured_context["context_json"]
        assert isinstance(merged_context, dict)
        assert merged_context["context"] == {"topic": "love"}
        assert merged_context["reading_access"] == {
            "full_detail": True,
            "source": "reading_reanalyze",
        }

        from app.api.reading import cache_ops

        with (
            patch(
                "app.api.reading.cache_ops._get_owned_user_reading_row",
                return_value={
                    "id": "reading-1",
                    "cache_id": "cache-1",
                    "context_json": merged_context,
                },
            ),
            patch(
                "app.api.reading.cache_ops._get_cache_row_by_id",
                return_value={"id": "cache-1"},
            ),
            patch(
                "app.api.reading.cache_ops._build_full_cached_reading_response",
                return_value=SimpleNamespace(meta=SimpleNamespace(cache_id=None)),
            ),
            patch(
                "app.api.reading.cache_ops.resolve_reading_projection",
                return_value=MagicMock(),
            ),
            patch(
                "app.api.reading.cache_ops.project_reading_response",
                return_value={"ok": True},
            ),
        ):
            detail = asyncio.run(
                cache_ops.get_reading_detail(
                    "reading-1",
                    current_user={"user_id": "test-user-id"},
                    _rate_limit=None,
                )
            )

        assert detail == {"ok": True}

    def test_spend_reading_reanalyze_idempotent_replay_repairs_entitlement_without_redebit(
        self,
        client,
        mock_supabase,
        mock_get_current_user_id,
        mock_payment_db_execute,
        mock_payment_config_service,
        mock_payment_rate_limiter,
    ):
        captured_context: dict[str, object] = {}

        user_readings_table = MagicMock()
        user_reading_row = {
            "id": "reading-1",
            "context_json": {"context": {"topic": "career"}},
        }
        user_readings_select_query = MagicMock()
        user_readings_select_query.eq.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[user_reading_row]
        )
        user_readings_table.select.return_value = user_readings_select_query

        user_readings_update_query = MagicMock()
        user_readings_update_query.eq.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[]
        )

        def _capture_update(payload):
            captured_context["context_json"] = payload.get("context_json")
            return user_readings_update_query

        user_readings_table.update.side_effect = _capture_update

        coin_transactions_table = MagicMock()
        coin_transactions_table.select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{"id": "tx-existing-1", "type": "spend", "amount": -150}]
        )

        user_wallets_table = MagicMock()
        user_wallets_table.select.return_value.eq.return_value.execute.return_value = (
            MagicMock(data=[{"balance": 910}])
        )

        def _table_router(table_name: str):
            if table_name == "user_readings":
                return user_readings_table
            if table_name == "coin_transactions":
                return coin_transactions_table
            if table_name == "user_wallets":
                return user_wallets_table
            raise AssertionError(f"unexpected table access: {table_name}")

        mock_supabase.table.side_effect = _table_router

        response = client.post(
            "/api/payment/spend",
            json={
                "feature_key": "reading_reanalyze",
                "reference_id": "reading-1",
                "idempotency_key": "summary-hub-detail:reading-1:order-1",
            },
        )

        assert response.status_code == 200
        payload = response.json()
        assert payload["success"] is True
        assert payload["idempotent"] is True
        assert payload["spent"] == 0
        assert payload["all_tabs_included"] is True
        assert payload["transaction_id"] == "tx-existing-1"
        mock_supabase.rpc.assert_not_called()

        merged_context = captured_context["context_json"]
        assert isinstance(merged_context, dict)
        assert merged_context["context"] == {"topic": "career"}
        assert merged_context["reading_access"] == {
            "full_detail": True,
            "source": "reading_reanalyze",
        }

    @pytest.mark.parametrize(
        "payload,table_data,status_code,expected_detail",
        [
            (
                {"feature_key": "reading_reanalyze"},
                [{"id": "reading-1", "context_json": {}}],
                400,
                "상세 사주 대상 리딩 정보가 필요합니다",
            ),
            (
                {"feature_key": "reading_reanalyze", "reference_id": "foreign-reading"},
                [],
                404,
                "리딩 컨텍스트를 찾을 수 없습니다",
            ),
        ],
    )
    def test_spend_reading_reanalyze_invalid_reference_fails_before_debit(
        self,
        payload,
        table_data,
        status_code,
        expected_detail,
        client,
        mock_supabase,
        mock_get_current_user_id,
        mock_payment_db_execute,
        mock_payment_config_service,
        mock_payment_rate_limiter,
    ):
        user_readings_table = MagicMock()
        user_readings_table.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=table_data
        )
        mock_supabase.table.side_effect = lambda table_name: user_readings_table

        response = client.post("/api/payment/spend", json=payload)

        assert response.status_code == status_code
        assert response.json()["detail"] == expected_detail
        mock_supabase.rpc.assert_not_called()


class TestRefund:
    """환불 테스트"""

    def test_double_refund_prevention(self, mock_supabase):
        """
        더블 환불 방지 테스트

        Given: 이미 환불된 트랜잭션
        When: _internal_refund_coins 재호출
        Then: ALREADY_REFUNDED 에러 반환
        """
        # Given
        tx_table = MagicMock()
        tx_table.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[{"id": "tx-1", "type": "spend", "amount": -30}]
        )
        mock_supabase.table.return_value = tx_table

        mock_supabase.rpc.return_value.execute.side_effect = Exception(
            "ALREADY_REFUNDED"
        )

        # When
        result = _internal_refund_coins("test-user-id", "tx-1", "테스트 환불")

        # Then
        assert result == {"success": False, "reason": "already_refunded"}

    def test_refund_on_failure_alerts_when_refund_fails(self):
        with (
            patch(
                "app.api.payment._internal_refund_coins",
                return_value={"success": False, "reason": "rpc_failed"},
            ),
            patch(
                "app.api.payment.notifier.notify_paid_feature_refund_issue"
            ) as notify_issue,
        ):
            refunded = asyncio.run(
                refund_on_failure(
                    "test-user-id",
                    "tx-1",
                    "서비스 오류",
                    feature_key="ai_chat",
                )
            )

        assert refunded is False
        notify_issue.assert_called_once()

    def test_refund_on_failure_alerts_when_manual_review_required(self):
        with (
            patch(
                "app.api.payment._internal_refund_coins",
                return_value={
                    "success": True,
                    "manual_review_required": True,
                    "refund_tx_id": "refund-1",
                },
            ),
            patch(
                "app.api.payment.notifier.notify_paid_feature_refund_issue"
            ) as notify_issue,
        ):
            refunded = asyncio.run(
                refund_on_failure(
                    "test-user-id",
                    "tx-1",
                    "서비스 오류",
                    feature_key="flow_ai_advice",
                )
            )

        assert refunded is True
        notify_issue.assert_called_once()


class TestWebhookIdempotency:
    """Webhook + Confirm 멱등성 테스트 (P0 Critical)"""

    def test_webhook_first_then_confirm(
        self,
        client,
        mock_supabase,
        mock_httpx,
        mock_get_current_user_id,
        mock_payment_db_execute,
        mock_payment_config_service,
        mock_payment_analytics,
        mock_payment_rate_limiter,
    ):
        """
        Webhook이 먼저 도착 후 Confirm 호출되는 케이스

        Given: Webhook으로 결제가 완료된 상태 (status='done')
        When: /payment/confirm 호출
        Then: 멱등적으로 성공 반환, 이중 크레딧 없음
        """
        # Given: complete_payment_v2 RPC가 이미 done 상태 감지
        payments_table = MagicMock()
        payments_table.select.return_value.eq.return_value.execute.return_value = (
            MagicMock(
                data=[
                    {
                        "user_id": "test-user-id",
                        "amount": 1000,
                        "order_id": "order-webhook-first",
                        "status": "pending",
                    }
                ]
            )
        )
        mock_supabase.table.return_value = payments_table

        mock_supabase.rpc.return_value.execute.return_value = MagicMock(
            data=[{"success": True, "new_balance": 100, "coin_amount": 0}]
        )

        with patch("app.api.payment.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(
            toss_test_secret_key="toss-test-secret-for-unit-test",
                toss_live_secret_key="",
                toss_test_client_key="test_ck_123",
                toss_live_client_key="",
            )

            mock_client = MagicMock()
            mock_httpx.return_value.__aenter__.return_value = mock_client

            confirm_response = MagicMock()
            confirm_response.status_code = 200
            confirm_response.json.return_value = {
                "status": "DONE",
                "orderId": "order-webhook-first",
                "totalAmount": 1000,
                "paymentKey": "pk_after_webhook",
                "method": "카드",
                "approvedAt": "2026-02-04T00:00:00Z",
            }
            mock_client.post = _async_mock_return(confirm_response)

            # When
            response = client.post(
                "/api/payment/confirm",
                json={
                    "payment_key": "pk_after_webhook",
                    "order_id": "order-webhook-first",
                    "amount": 1000,
                },
            )

        # Then
        assert response.status_code == 200
        payload = response.json()
        assert payload["success"] is True
        assert payload["charged"] == 0

    def test_confirm_first_then_webhook(
        self, mock_supabase, mock_webhook_db_execute, mock_webhook_dedup
    ):
        """
        Confirm이 먼저 완료 후 Webhook 도착하는 케이스

        Given: Confirm으로 결제가 완료된 상태 (status='done')
        When: Webhook이 PAYMENT_STATUS_CHANGED (DONE) 수신
        Then: Webhook은 이미 done인 결제를 스킵 (current_status != 'pending' 체크)
        """
        # Given
        with patch("app.api.webhook.supabase") as mock_webhook_supabase:
            mock_table = MagicMock()
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=[{"status": "done", "order_id": "test-order"}])
            )
            mock_webhook_supabase.table.return_value = mock_table

            from app.api.webhook import handle_payment_status_changed
            import asyncio

            # When
            asyncio.run(
                handle_payment_status_changed(
                    {
                        "paymentKey": "pk_test",
                        "orderId": "test-order",
                        "status": "DONE",
                        "method": "카드",
                        "approvedAt": "2026-02-04T00:00:00Z",
                    }
                )
            )

            # Then
            mock_webhook_supabase.rpc.assert_not_called()

    def test_concurrent_webhook_and_confirm(
        self,
        client,
        mock_supabase,
        mock_httpx,
        mock_get_current_user_id,
        mock_payment_db_execute,
        mock_payment_config_service,
        mock_payment_analytics,
        mock_payment_rate_limiter,
    ):
        """
        Webhook과 Confirm이 동시에 호출되는 케이스

        Given: pending 상태의 결제
        When: Webhook과 Confirm이 거의 동시에 complete_payment_v2 호출
        Then: 하나만 크레딧 지급 (DB-level idempotency via status check)

        검증 방법:
        - complete_payment_v2 RPC 내부에서 status='done' 체크 후 early return
        - coin_transactions에 중복 charge 트랜잭션 없음
        """
        # Given
        payments_table = MagicMock()
        payments_table.select.return_value.eq.return_value.execute.return_value = (
            MagicMock(
                data=[
                    {
                        "user_id": "test-user-id",
                        "amount": 1000,
                        "order_id": "order-concurrent",
                        "status": "pending",
                    }
                ]
            )
        )
        mock_supabase.table.return_value = payments_table

        mock_supabase.rpc.return_value.execute.side_effect = [
            MagicMock(data=[{"success": True, "new_balance": 200, "coin_amount": 100}]),
            MagicMock(data=[{"success": True, "new_balance": 200, "coin_amount": 0}]),
        ]

        with patch("app.api.payment.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(
            toss_test_secret_key="toss-test-secret-for-unit-test",
                toss_live_secret_key="",
                toss_test_client_key="test_ck_123",
                toss_live_client_key="",
            )

            mock_client = MagicMock()
            mock_httpx.return_value.__aenter__.return_value = mock_client

            confirm_response = MagicMock()
            confirm_response.status_code = 200
            confirm_response.json.return_value = {
                "status": "DONE",
                "orderId": "order-concurrent",
                "totalAmount": 1000,
                "paymentKey": "pk_concurrent",
                "method": "카드",
                "approvedAt": "2026-02-04T00:00:00Z",
            }
            mock_client.post = _async_mock_return(confirm_response)

            # When
            first = client.post(
                "/api/payment/confirm",
                json={
                    "payment_key": "pk_concurrent",
                    "order_id": "order-concurrent",
                    "amount": 1000,
                },
            )
            second = client.post(
                "/api/payment/confirm",
                json={
                    "payment_key": "pk_concurrent",
                    "order_id": "order-concurrent",
                    "amount": 1000,
                },
            )

        # Then
        assert first.status_code == 200
        assert second.status_code == 200
        charged_values = {first.json()["charged"], second.json()["charged"]}
        assert charged_values == {0, 100}

    def test_webhook_payment_key_mismatch(
        self, mock_supabase, mock_webhook_db_execute, mock_webhook_dedup
    ):
        """
        Webhook의 payment_key가 Confirm과 다른 케이스 (토스 재시도 시나리오)

        Given: Confirm으로 payment_key_1로 결제 완료
        When: Webhook이 payment_key_2로 도착
        Then: payment_key는 업데이트되지 않음 (이미 done이므로 스킵)
        """
        with patch("app.api.webhook.supabase") as mock_webhook_supabase:
            mock_table = MagicMock()
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=[{"status": "done", "order_id": "test-order"}])
            )
            mock_webhook_supabase.table.return_value = mock_table

            from app.api.webhook import handle_payment_status_changed
            import asyncio

            asyncio.run(
                handle_payment_status_changed(
                    {
                        "paymentKey": "payment_key_2",
                        "orderId": "test-order",
                        "status": "DONE",
                        "method": "카드",
                        "approvedAt": "2026-02-04T00:00:00Z",
                    }
                )
            )

            mock_webhook_supabase.rpc.assert_not_called()


class TestWebhookRpcConsistency:
    """Webhook이 올바른 RPC 함수를 호출하는지 검증 (P0 Critical)"""

    def test_webhook_uses_complete_payment_v2(
        self, mock_webhook_db_execute, mock_webhook_dedup
    ):
        """
        Webhook이 complete_payment_v2를 호출하는지 검증

        Given: pending 결제가 존재
        When: Webhook PAYMENT_STATUS_CHANGED (DONE) 수신
        Then: complete_payment_v2 RPC 호출 (NOT complete_payment)

        이유: complete_payment_v2만 coin_balances 테이블에 기록함
        """
        with patch("app.api.webhook.supabase") as mock_webhook_supabase:
            from app.api.webhook import handle_payment_status_changed
            import asyncio

            mock_table = MagicMock()
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=[{"status": "pending", "order_id": "test-order"}])
            )
            mock_webhook_supabase.table.return_value = mock_table

            mock_rpc = MagicMock()
            mock_rpc.execute.return_value = MagicMock(data=[{"success": True}])
            mock_webhook_supabase.rpc.return_value = mock_rpc

            asyncio.run(
                handle_payment_status_changed(
                    {
                        "paymentKey": "pk_test",
                        "orderId": "test-order",
                        "status": "DONE",
                        "method": "카드",
                        "approvedAt": "2026-02-04T00:00:00Z",
                    }
                )
            )

            mock_webhook_supabase.rpc.assert_called_with(
                "complete_payment_v2",
                {
                    "p_order_id": "test-order",
                    "p_payment_key": "pk_test",
                    "p_method": "카드",
                    "p_approved_at": "2026-02-04T00:00:00Z",
                    "p_receipt_url": None,
                },
            )

    def test_payment_confirm_rejects_toss_amount_mismatch(
        self,
        client,
        mock_supabase,
        mock_httpx,
        mock_get_current_user_id,
        mock_payment_db_execute,
        mock_payment_config_service,
        mock_payment_analytics,
        mock_payment_rate_limiter,
    ):
        payments_table = MagicMock()
        payments_table.select.return_value.eq.return_value.execute.return_value = (
            MagicMock(
                data=[
                    {
                        "user_id": "test-user-id",
                        "amount": 1000,
                        "order_id": "order-mismatch",
                        "status": "pending",
                    }
                ]
            )
        )
        mock_supabase.table.return_value = payments_table

        with (
            patch("app.api.payment.get_settings") as mock_settings,
            patch(
                "app.api.payment.notifier.notify_payment_mismatch"
            ) as notify_mismatch,
        ):
            mock_settings.return_value = MagicMock(
            toss_test_secret_key="toss-test-secret-for-unit-test",
                toss_live_secret_key="",
                toss_test_client_key="test_ck_123",
                toss_live_client_key="",
            )

            mock_client = MagicMock()
            mock_httpx.return_value.__aenter__.return_value = mock_client

            confirm_response = MagicMock()
            confirm_response.status_code = 200
            confirm_response.json.return_value = {
                "status": "DONE",
                "orderId": "order-mismatch",
                "totalAmount": 900,
                "paymentKey": "pk_test",
                "method": "카드",
                "approvedAt": "2026-02-04T00:00:00Z",
            }
            mock_client.post = _async_mock_return(confirm_response)

            response = client.post(
                "/api/payment/confirm",
                json={
                    "payment_key": "pk_test",
                    "order_id": "order-mismatch",
                    "amount": 1000,
                },
            )

            notify_mismatch.assert_called_once()

        assert response.status_code == 400
        assert "주문 금액" in response.json()["detail"]

    def test_deposit_callback_uses_complete_payment_v2(
        self, mock_webhook_db_execute, mock_webhook_dedup
    ):
        """
        가상계좌 입금 콜백도 complete_payment_v2를 호출하는지 검증

        Given: pending 가상계좌 결제가 존재
        When: Webhook DEPOSIT_CALLBACK (DONE) 수신
        Then: complete_payment_v2 RPC 호출
        """
        with patch("app.api.webhook.supabase") as mock_webhook_supabase:
            from app.api.webhook import handle_deposit_callback
            import asyncio

            mock_table = MagicMock()
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=[{"status": "pending", "order_id": "test-order"}])
            )
            mock_webhook_supabase.table.return_value = mock_table

            mock_rpc = MagicMock()
            mock_rpc.execute.return_value = MagicMock(data=[{"success": True}])
            mock_webhook_supabase.rpc.return_value = mock_rpc

            asyncio.run(
                handle_deposit_callback(
                    {
                        "paymentKey": "pk_va_test",
                        "orderId": "test-order",
                        "status": "DONE",
                        "approvedAt": "2026-02-04T00:00:00Z",
                    }
                )
            )

            mock_webhook_supabase.rpc.assert_called_with(
                "complete_payment_v2",
                {
                    "p_order_id": "test-order",
                    "p_payment_key": "pk_va_test",
                    "p_method": "가상계좌",
                    "p_approved_at": "2026-02-04T00:00:00Z",
                    "p_receipt_url": None,
                },
            )

    def test_webhook_canceled_uses_refund_payment_by_order_v1(
        self, mock_webhook_db_execute, mock_webhook_dedup
    ):
        with (
            patch("app.api.webhook.supabase") as mock_webhook_supabase,
            patch(
                "app.services.notification_service.notifier.notify_payment_canceled"
            ) as mock_notify,
        ):
            from app.api.webhook import handle_payment_status_changed
            import asyncio

            mock_table = MagicMock()
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(
                    data=[
                        {
                            "status": "done",
                            "order_id": "cancel-order",
                            "user_id": "test-user",
                            "amount": 1000,
                            "coin_amount": 110,
                        }
                    ]
                )
            )
            mock_webhook_supabase.table.return_value = mock_table

            mock_rpc = MagicMock()
            mock_rpc.execute.return_value = MagicMock(
                data=[
                    {
                        "success": True,
                        "clawed_back_amount": 110,
                        "remaining_unclawed_amount": 0,
                        "transaction_id": "tx-clawback",
                        "manual_review_required": False,
                    }
                ]
            )
            mock_webhook_supabase.rpc.return_value = mock_rpc

            asyncio.run(
                handle_payment_status_changed(
                    {
                        "paymentKey": "pk_cancel",
                        "orderId": "cancel-order",
                        "status": "CANCELED",
                    }
                )
            )

            mock_webhook_supabase.rpc.assert_called_with(
                "refund_payment_by_order_v1",
                {
                    "p_order_id": "cancel-order",
                    "p_reason": "결제 취소 (PAYMENT_STATUS_CHANGED, order_id=cancel-order)",
                    "p_event_type": "PAYMENT_STATUS_CHANGED",
                },
            )
            mock_notify.assert_called_once_with(order_id="cancel-order", amount=1000)

    def test_cancel_status_done_uses_refund_payment_by_order_v1(
        self, mock_webhook_db_execute, mock_webhook_dedup
    ):
        with patch("app.api.webhook.supabase") as mock_webhook_supabase:
            from app.api.webhook import handle_cancel_status_changed
            import asyncio

            mock_table = MagicMock()
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(
                    data=[
                        {"status": "done", "user_id": "test-user", "coin_amount": 110}
                    ]
                )
            )
            mock_webhook_supabase.table.return_value = mock_table

            mock_rpc = MagicMock()
            mock_rpc.execute.return_value = MagicMock(
                data=[
                    {
                        "success": True,
                        "clawed_back_amount": 110,
                        "remaining_unclawed_amount": 0,
                        "transaction_id": "tx-clawback",
                        "manual_review_required": False,
                    }
                ]
            )
            mock_webhook_supabase.rpc.return_value = mock_rpc

            asyncio.run(
                handle_cancel_status_changed(
                    {
                        "orderId": "cancel-order",
                        "cancelStatus": "DONE",
                    }
                )
            )

            mock_webhook_supabase.rpc.assert_called_with(
                "refund_payment_by_order_v1",
                {
                    "p_order_id": "cancel-order",
                    "p_reason": "결제 취소 (CANCEL_STATUS_CHANGED, order_id=cancel-order)",
                    "p_event_type": "CANCEL_STATUS_CHANGED",
                },
            )
