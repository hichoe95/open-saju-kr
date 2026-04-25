# pyright: reportMissingImports=false
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Any
from datetime import datetime, timedelta, timezone
import httpx
import base64
import uuid

from ..api.deps import get_current_user_id, rate_limit_dependency
from .admin import require_admin
from ..db.supabase_client import supabase, db_execute
from ..config import get_settings
from ..core.security import crypto_manager
from ..services.config_service import config_service
from ..services.analytics_service import analytics
from ..services.notification_service import notifier

logger = logging.getLogger(__name__)


def _mask_sensitive_value(value: str, visible_chars: int = 4) -> str:
    if not value or len(value) <= visible_chars:
        return "***"
    return f"{value[:visible_chars]}{'*' * (len(value) - visible_chars)}"


def _create_insufficient_balance_error(required: int, current: int) -> str:
    return f"엽전이 부족합니다. (필요: {required}, 보유: {current})"


def _extract_toss_total_amount(data: dict[str, Any]) -> Optional[int]:
    value = data.get("totalAmount", data.get("amount"))
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value) if value.is_integer() else None
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        try:
            return int(stripped)
        except ValueError:
            return None
    return None


async def _fetch_toss_order_status(
    order_id: str, auth_header: str
) -> Optional[dict[str, Any]]:
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(10.0, connect=5.0)
        ) as client:
            status_res = await client.get(
                f"https://api.tosspayments.com/v1/payments/orders/{order_id}",
                headers={"Authorization": f"Basic {auth_header}"},
            )
    except httpx.RequestError:
        return None

    if status_res.status_code != 200:
        return None

    try:
        payload = status_res.json()
    except ValueError:
        return None
    return payload if isinstance(payload, dict) else None


def _get_toss_status(data: Optional[dict[str, Any]]) -> str:
    if not isinstance(data, dict):
        return ""
    status = data.get("status")
    return status if isinstance(status, str) else ""


def _merge_reading_detail_entitlement_context(
    context_json: Optional[dict[str, Any]],
) -> dict[str, Any]:
    merged_context = dict(context_json) if isinstance(context_json, dict) else {}
    existing_access = merged_context.get("reading_access")
    reading_access = dict(existing_access) if isinstance(existing_access, dict) else {}
    reading_access["full_detail"] = True
    reading_access["source"] = "reading_reanalyze"
    merged_context["reading_access"] = reading_access
    return merged_context


async def _get_owned_user_reading_for_reanalyze(
    user_id: str, reading_id: str
) -> Optional[dict[str, Any]]:
    reading_id = reading_id.strip()
    if not reading_id:
        return None

    result = await db_execute(
        lambda: (
            supabase.table("user_readings")
            .select("id, context_json")
            .eq("id", reading_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
    )
    if isinstance(result.data, list) and result.data:
        row = result.data[0]
        if isinstance(row, dict):
            return row
    return None


async def _ensure_reanalyze_entitlement(
    user_id: str,
    reading_id: str,
    existing_row: Optional[dict[str, Any]] = None,
) -> None:
    reading_row = existing_row
    if not isinstance(reading_row, dict):
        reading_row = await _get_owned_user_reading_for_reanalyze(user_id, reading_id)

    if not isinstance(reading_row, dict):
        raise HTTPException(status_code=404, detail="리딩 컨텍스트를 찾을 수 없습니다")

    merged_context = _merge_reading_detail_entitlement_context(
        reading_row.get("context_json")
        if isinstance(reading_row.get("context_json"), dict)
        else None
    )
    try:
        await db_execute(
            lambda: (
                supabase.table("user_readings")
                .update({"context_json": merged_context})
                .eq("id", reading_id)
                .eq("user_id", user_id)
                .execute()
            )
        )
    except Exception as e:
        logger.exception(
            "[SPEND] reading_reanalyze entitlement update failed: user_id=%s, reading_id=%s, error=%s",
            user_id,
            reading_id,
            e,
        )
        raise HTTPException(
            status_code=500, detail="상세 사주 권한 갱신 중 오류가 발생했습니다"
        )


router = APIRouter(prefix="/payment", tags=["payment"])

# === Schemas ===


class WalletResponse(BaseModel):
    balance: int
    total_charged: int
    total_spent: int


class CoinProductResponse(BaseModel):
    id: str
    name: str
    coin_amount: int
    price: int
    bonus_amount: int


class TransactionResponse(BaseModel):
    id: str
    type: str
    amount: int
    balance_after: int
    description: Optional[str]
    created_at: str


class PaymentPrepareRequest(BaseModel):
    product_id: str = Field(..., max_length=100)


class PaymentPrepareResponse(BaseModel):
    order_id: str
    amount: int
    order_name: str
    customer_name: Optional[str]
    customer_email: Optional[str]
    client_key: str
    payment_mode: str


def _get_toss_client_key_for_mode(mode: str) -> str:
    settings = get_settings()
    client_key = (
        settings.toss_live_client_key
        if mode == "live"
        else settings.toss_test_client_key
    )
    if not client_key:
        raise HTTPException(status_code=500, detail="결제 설정 오류")
    return client_key


class PaymentConfirmRequest(BaseModel):
    payment_key: str = Field(..., max_length=200)
    order_id: str = Field(..., max_length=200)
    amount: int = Field(..., gt=0)


class SpendRequest(BaseModel):
    feature_key: str = Field(..., max_length=100)
    reference_id: Optional[str] = Field(None, max_length=200)
    idempotency_key: Optional[str] = Field(None, max_length=200)


# 유료 기능 가격표 (단위: 엽전)
FEATURE_PRICES = {
    "reading_reanalyze": 150,
    "ai_chat": 10,
    "ai_chat_followup": 10,
    "compatibility": 50,
    "flow_ai_advice": 20,
    "saju_image": 50,
}


# === Endpoints ===


@router.get("/wallet", response_model=WalletResponse)
async def get_wallet(
    user_id: str = Depends(get_current_user_id),
    _rl: None = Depends(
        rate_limit_dependency(limit=30, window_seconds=60, scope="payment_wallet")
    ),
):
    """사용자 지갑 조회 (없으면 자동 생성)"""
    res = await db_execute(
        lambda: (
            supabase.table("user_wallets").select("*").eq("user_id", user_id).execute()
        )
    )

    if not res.data:
        # 지갑 자동 생성
        await db_execute(
            lambda: (
                supabase.table("user_wallets")
                .insert(
                    {
                        "user_id": user_id,
                        "balance": 0,
                        "total_charged": 0,
                        "total_spent": 0,
                    }
                )
                .execute()
            )
        )
        return WalletResponse(balance=0, total_charged=0, total_spent=0)

    wallet = res.data[0]
    valid_balance_result = await db_execute(
        lambda: supabase.rpc("get_valid_balance", {"p_user_id": user_id}).execute()
    )
    valid_balance = wallet["balance"]
    if (
        valid_balance_result.data
        and isinstance(valid_balance_result.data, list)
        and isinstance(valid_balance_result.data[0], dict)
    ):
        valid_balance = int(
            valid_balance_result.data[0].get("valid_balance", wallet["balance"])
        )

    return WalletResponse(
        balance=valid_balance,
        total_charged=wallet["total_charged"],
        total_spent=wallet["total_spent"],
    )


@router.get("/products", response_model=List[CoinProductResponse])
async def get_products(
    _rl: None = Depends(
        rate_limit_dependency(limit=60, window_seconds=60, scope="payment_products")
    ),
):
    """충전 상품 목록"""
    res = await db_execute(
        lambda: (
            supabase.table("coin_products")
            .select("*")
            .eq("is_active", True)
            .order("sort_order")
            .execute()
        )
    )
    return [
        CoinProductResponse(
            id=str(p["id"]),
            name=p["name"],
            coin_amount=p["coin_amount"],
            price=p["price"],
            bonus_amount=p["bonus_amount"],
        )
        for p in res.data
    ]


@router.get("/transactions", response_model=List[TransactionResponse])
async def get_transactions(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user_id: str = Depends(get_current_user_id),
    _rl: None = Depends(
        rate_limit_dependency(limit=30, window_seconds=60, scope="payment_transactions")
    ),
):
    """거래 내역 조회"""
    res = await db_execute(
        lambda: (
            supabase.table("coin_transactions")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
    )

    return [
        TransactionResponse(
            id=str(t["id"]),
            type=t["type"],
            amount=t["amount"],
            balance_after=t["balance_after"],
            description=t.get("description"),
            created_at=t["created_at"],
        )
        for t in res.data
    ]


@router.post("/prepare", response_model=PaymentPrepareResponse)
async def prepare_payment(
    request: PaymentPrepareRequest,
    user_id: str = Depends(get_current_user_id),
    _rl: None = Depends(
        rate_limit_dependency(limit=10, window_seconds=60, scope="payment_prepare")
    ),
):
    """결제 준비 (order_id 생성)"""
    # 상품 조회
    product_res = await db_execute(
        lambda: (
            supabase.table("coin_products")
            .select("*")
            .eq("id", request.product_id)
            .eq("is_active", True)
            .execute()
        )
    )
    if not product_res.data:
        raise HTTPException(status_code=404, detail="상품을 찾을 수 없습니다")

    product = product_res.data[0]

    # 1회 충전 한도 검증 (토스페이먼츠 심사 요구사항: 10만원)
    if product["price"] > 100000:
        raise HTTPException(status_code=400, detail="1회 충전 한도는 10만원입니다")

    # 사용자 정보 조회 (암호화된 필드 복호화)
    user_res = await db_execute(
        lambda: (
            supabase.table("user_identities")
            .select("name_ct, name_iv, name_tag, email_ct, email_iv, email_tag, key_id")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
    )

    user_info = {}
    if user_res.data:
        ident = user_res.data[0]
        key_id = ident.get("key_id", "v1")

        if ident.get("name_ct") and ident.get("name_iv") and ident.get("name_tag"):
            try:
                user_info["name"] = crypto_manager.decrypt_field(
                    "user_identities",
                    "name",
                    ident["name_iv"],
                    ident["name_ct"],
                    ident["name_tag"],
                    key_id,
                )
            except Exception:
                user_info["name"] = ""

        if ident.get("email_ct") and ident.get("email_iv") and ident.get("email_tag"):
            try:
                user_info["email"] = crypto_manager.decrypt_field(
                    "user_identities",
                    "email",
                    ident["email_iv"],
                    ident["email_ct"],
                    ident["email_tag"],
                    key_id,
                )
            except Exception:
                user_info["email"] = ""

    # 주문 ID 생성
    order_id = f"SAJU_{uuid.uuid4().hex.upper()}"
    payment_mode_snapshot = await config_service.get_payment_mode()
    if payment_mode_snapshot not in ("test", "live"):
        logger.warning(
            "[PAYMENT] invalid payment mode snapshot '%s'; falling back to test",
            payment_mode_snapshot,
        )
        payment_mode_snapshot = "test"

    client_key = _get_toss_client_key_for_mode(payment_mode_snapshot)

    # 결제 레코드 생성 (기본 엽전 + 보너스 분리 저장)
    await db_execute(
        lambda: (
            supabase.table("payments")
            .insert(
                {
                    "user_id": user_id,
                    "order_id": order_id,
                    "amount": product["price"],
                    "coin_amount": product["coin_amount"] + product["bonus_amount"],
                    "bonus_amount": product[
                        "bonus_amount"
                    ],  # 보너스 분리 저장 (만료 관리용)
                    "product_name": f"{product['name']} 충전",
                    "status": "pending",
                    "payment_mode_snapshot": payment_mode_snapshot,
                }
            )
            .execute()
        )
    )

    return PaymentPrepareResponse(
        order_id=order_id,
        amount=product["price"],
        order_name=f"마이사주 {product['name']} 충전",
        customer_name=user_info.get("name"),
        customer_email=user_info.get("email"),
        client_key=client_key,
        payment_mode=payment_mode_snapshot,
    )


@router.post("/confirm")
async def confirm_payment(
    request: PaymentConfirmRequest,
    user_id: str = Depends(get_current_user_id),
    _rl: None = Depends(
        rate_limit_dependency(limit=5, window_seconds=60, scope="payment_confirm")
    ),
):
    async def _track_payment_error(error_type: str) -> None:
        try:
            await analytics.track_event(
                event_type="payment_error",
                event_data={"error_type": error_type, "order_id": request.order_id},
                user_id=user_id,
            )
        except Exception:
            logger.warning("[PAYMENT] Failed to track payment_error event")

    async def _mark_payment_failed(error_code: str, error_message: str) -> None:
        await db_execute(
            lambda: supabase.rpc(
                "fail_payment",
                {
                    "p_order_id": request.order_id,
                    "p_failure_code": error_code,
                    "p_failure_message": error_message,
                },
            ).execute()
        )

    payment_res = await db_execute(
        lambda: (
            supabase.table("payments")
            .select("*")
            .eq("order_id", request.order_id)
            .execute()
        )
    )
    if not payment_res.data:
        await _track_payment_error("order_not_found")
        raise HTTPException(status_code=404, detail="주문을 찾을 수 없습니다")

    payment = payment_res.data[0]

    if payment["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="권한이 없습니다")

    # 상태 게이트: pending만 승인 시도, done은 멱등 반환
    current_status = payment.get("status")
    if current_status == "done":
        logger.info(
            f"[PAYMENT] Already completed (idempotent): order_id={request.order_id}"
        )
        wallet_res = await db_execute(
            lambda: (
                supabase.table("user_wallets")
                .select("balance")
                .eq("user_id", user_id)
                .execute()
            )
        )
        balance = wallet_res.data[0]["balance"] if wallet_res.data else 0
        return {
            "success": True,
            "balance": balance,
            "charged": payment.get("coin_amount", 0),
        }
    if current_status not in ("pending",):
        raise HTTPException(
            status_code=400,
            detail=f"이 주문은 처리할 수 없는 상태입니다 ({current_status})",
        )

    if payment["amount"] != request.amount:
        raise HTTPException(status_code=400, detail="결제 금액이 일치하지 않습니다")

    settings = get_settings()
    snapshot_mode = (
        payment.get("payment_mode_snapshot") if isinstance(payment, dict) else None
    )
    mode = (
        snapshot_mode
        if snapshot_mode in ("test", "live")
        else await config_service.get_payment_mode()
    )
    secret_key = (
        settings.toss_live_secret_key
        if mode == "live"
        else settings.toss_test_secret_key
    )

    if not secret_key:
        raise HTTPException(status_code=500, detail="결제 설정 오류")

    auth_header = base64.b64encode(f"{secret_key}:".encode()).decode()

    max_retries = 3
    toss_res = None
    toss_data: Optional[dict[str, Any]] = None
    transport_error: Optional[str] = None

    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(30.0, connect=10.0)
            ) as client:
                toss_res = await client.post(
                    "https://api.tosspayments.com/v1/payments/confirm",
                    headers={
                        "Authorization": f"Basic {auth_header}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "paymentKey": request.payment_key,
                        "orderId": request.order_id,
                        "amount": request.amount,
                    },
                )
                break
        except httpx.TimeoutException:
            if attempt < max_retries - 1:
                import asyncio

                await asyncio.sleep(1 * (attempt + 1))
                continue
            await _track_payment_error("confirm_timeout")
            transport_error = "timeout"
            break
        except httpx.RequestError:
            if attempt < max_retries - 1:
                import asyncio

                await asyncio.sleep(1 * (attempt + 1))
                continue
            await _track_payment_error("confirm_request_error")
            transport_error = "request_error"
            break

    if toss_res is None:
        status_data = await _fetch_toss_order_status(request.order_id, auth_header)
        fallback_status = _get_toss_status(status_data)
        if fallback_status == "DONE":
            toss_data = status_data
        elif fallback_status in {"IN_PROGRESS", "READY", "WAITING_FOR_DEPOSIT"}:
            await _track_payment_error("payment_still_processing")
            raise HTTPException(
                status_code=409,
                detail="결제가 아직 처리 중입니다. 잠시 후 다시 시도해주세요.",
            )
        elif fallback_status in {"ABORTED", "EXPIRED", "CANCELED"}:
            await _mark_payment_failed(
                "PAYMENT_NOT_DONE",
                f"결제 상태: {fallback_status}",
            )
            await _track_payment_error("payment_not_done")
            raise HTTPException(status_code=400, detail="결제가 완료되지 않았습니다")
        elif transport_error:
            raise HTTPException(
                status_code=409,
                detail="결제 상태 확인 중입니다. 잠시 후 다시 시도하거나 잔액을 확인해주세요.",
            )

    if toss_data is None and toss_res is None:
        masked_payment_key = _mask_sensitive_value(request.payment_key)
        logger.error(
            f"[PAYMENT ERROR] Toss API failed after {max_retries} retries, order_id={request.order_id}, payment_key={masked_payment_key}"
        )
        await _track_payment_error("confirm_response_missing")
        raise HTTPException(
            status_code=502,
            detail="결제 서버와 연결할 수 없습니다. 네트워크 상태를 확인하고 다시 시도해주세요.",
        )

    if toss_data is None:
        assert toss_res is not None
        try:
            parsed_toss_data = toss_res.json()
        except ValueError:
            await _track_payment_error("confirm_invalid_json")
            raise HTTPException(
                status_code=502,
                detail="결제 서버 응답을 해석할 수 없습니다. 잠시 후 다시 시도해주세요.",
            )
        toss_data = parsed_toss_data if isinstance(parsed_toss_data, dict) else {}

    assert isinstance(toss_data, dict)

    if toss_res is not None and toss_res.status_code != 200:
        error_code = toss_data.get("code")

        if error_code == "ALREADY_PROCESSED_PAYMENT":
            logger.info(
                f"[PAYMENT] Already processed, checking status: order_id={request.order_id}"
            )
            try:
                async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
                    status_res = await client.get(
                        f"https://api.tosspayments.com/v1/payments/orders/{request.order_id}",
                        headers={"Authorization": f"Basic {auth_header}"},
                    )
                    if status_res.status_code == 200:
                        status_payload = status_res.json()
                        status_data = (
                            status_payload if isinstance(status_payload, dict) else None
                        )
                        status_value = _get_toss_status(status_data)
                        if status_value == "DONE":
                            toss_data = status_data
                        elif status_value in (
                            "IN_PROGRESS",
                            "WAITING_FOR_DEPOSIT",
                            "READY",
                        ):
                            await _track_payment_error("payment_still_processing")
                            raise HTTPException(
                                status_code=409,
                                detail="결제가 아직 처리 중입니다. 잠시 후 다시 시도해주세요.",
                            )
                        else:
                            await _mark_payment_failed(
                                "PAYMENT_NOT_DONE",
                                f"결제 상태: {status_value or 'UNKNOWN'}",
                            )
                            await _track_payment_error("payment_not_done")
                            raise HTTPException(
                                status_code=400, detail="결제가 완료되지 않았습니다"
                            )
                    else:
                        await _track_payment_error("status_check_failed")
                        raise HTTPException(
                            status_code=400, detail="결제 상태 확인 실패"
                        )
            except (httpx.RequestError, ValueError):
                await _track_payment_error("status_check_request_error")
                raise HTTPException(
                    status_code=502, detail="결제 상태 확인 중 오류 발생"
                )
        elif error_code == "ALREADY_PROCESSING_REQUEST":
            logger.info(
                f"[PAYMENT] Already processing, waiting before status check: order_id={request.order_id}"
            )
            try:
                import asyncio

                await asyncio.sleep(3)
                async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
                    status_res = await client.get(
                        f"https://api.tosspayments.com/v1/payments/orders/{request.order_id}",
                        headers={"Authorization": f"Basic {auth_header}"},
                    )
                    if status_res.status_code == 200:
                        status_payload = status_res.json()
                        status_data = (
                            status_payload if isinstance(status_payload, dict) else None
                        )
                        status_value = _get_toss_status(status_data)
                        if status_value == "DONE":
                            toss_data = status_data
                        elif status_value in (
                            "IN_PROGRESS",
                            "WAITING_FOR_DEPOSIT",
                            "READY",
                        ):
                            await _track_payment_error("payment_still_processing")
                            raise HTTPException(
                                status_code=409,
                                detail="결제가 아직 처리 중입니다. 잠시 후 다시 시도해주세요.",
                            )
                        else:
                            await _mark_payment_failed(
                                "PAYMENT_NOT_DONE",
                                f"결제 상태: {status_value or 'UNKNOWN'}",
                            )
                            await _track_payment_error("payment_not_done")
                            raise HTTPException(
                                status_code=400, detail="결제가 완료되지 않았습니다"
                            )
                    else:
                        await _track_payment_error("status_check_failed")
                        raise HTTPException(
                            status_code=400, detail="결제 상태 확인 실패"
                        )
            except (httpx.RequestError, ValueError):
                await _track_payment_error("status_check_request_error")
                raise HTTPException(
                    status_code=502, detail="결제 상태 확인 중 오류 발생"
                )
        else:
            await _mark_payment_failed(
                str(error_code or "CONFIRM_FAILED"),
                str(toss_data.get("message") or "결제 승인 실패"),
            )
            logger.warning(
                f"[PAYMENT FAILED] order_id={request.order_id}, code={error_code}"
            )
            await _track_payment_error("confirmation_failed")
            raise HTTPException(
                status_code=400, detail=toss_data.get("message", "결제 승인 실패")
            )

    assert isinstance(toss_data, dict)

    response_order_id = str(toss_data.get("orderId") or "")
    if response_order_id != request.order_id:
        await _track_payment_error("order_id_mismatch")
        notifier.notify_payment_mismatch(
            order_id=request.order_id,
            mismatch_type="order_id_mismatch",
            details=f"confirmed_order_id={response_order_id or 'missing'}",
            user_id=user_id,
        )
        raise HTTPException(
            status_code=400, detail="결제 주문 정보가 일치하지 않습니다"
        )

    response_amount = _extract_toss_total_amount(toss_data)
    if response_amount is None:
        await _track_payment_error("missing_total_amount")
        raise HTTPException(
            status_code=400, detail="결제 승인 금액을 확인할 수 없습니다"
        )
    if response_amount != payment["amount"]:
        await _track_payment_error("confirmed_amount_mismatch")
        notifier.notify_payment_mismatch(
            order_id=request.order_id,
            mismatch_type="amount_mismatch",
            details=f"expected={payment['amount']} confirmed={response_amount}",
            user_id=user_id,
        )
        raise HTTPException(
            status_code=400, detail="승인된 결제 금액이 주문 금액과 일치하지 않습니다"
        )

    response_status = str(toss_data.get("status") or "")
    if response_status != "DONE":
        if response_status in {"WAITING_FOR_DEPOSIT", "READY", "IN_PROGRESS"}:
            await _track_payment_error("payment_still_processing")
            raise HTTPException(
                status_code=409,
                detail="결제가 아직 최종 완료되지 않았습니다. 잠시 후 다시 확인해주세요.",
            )
        await _mark_payment_failed(
            "PAYMENT_NOT_DONE",
            f"결제 상태: {response_status or 'UNKNOWN'}",
        )
        await _track_payment_error("payment_not_done")
        notifier.notify_payment_mismatch(
            order_id=request.order_id,
            mismatch_type="status_mismatch",
            details=f"confirmed_status={response_status or 'UNKNOWN'}",
            user_id=user_id,
        )
        raise HTTPException(status_code=400, detail="결제가 완료되지 않았습니다")

    verified_payment_key = toss_data.get("paymentKey", request.payment_key)
    toss_secret = toss_data.get("secret")

    if isinstance(toss_secret, str) and toss_secret:
        try:
            await db_execute(
                lambda: (
                    supabase.table("payments")
                    .update({"toss_secret": toss_secret})
                    .eq("order_id", request.order_id)
                    .eq("user_id", user_id)
                    .execute()
                )
            )
        except Exception as e:
            logger.exception(
                "[PAYMENT] failed to persist toss secret: order_id=%s, error=%s",
                request.order_id,
                e,
            )
            raise HTTPException(
                status_code=500,
                detail="결제 검증 데이터 저장에 실패했습니다. 잠시 후 다시 시도해주세요.",
            )

        try:
            secret_verify_res = await db_execute(
                lambda: (
                    supabase.table("payments")
                    .select("toss_secret")
                    .eq("order_id", request.order_id)
                    .eq("user_id", user_id)
                    .limit(1)
                    .execute()
                )
            )
        except Exception as e:
            logger.exception(
                "[PAYMENT] failed to verify toss secret persistence: order_id=%s, error=%s",
                request.order_id,
                e,
            )
            raise HTTPException(
                status_code=500,
                detail="결제 검증 데이터 확인에 실패했습니다. 잠시 후 다시 시도해주세요.",
            )

        persisted_rows = (
            secret_verify_res.data if isinstance(secret_verify_res.data, list) else []
        )
        persisted_secret = ""
        if persisted_rows and isinstance(persisted_rows[0], dict):
            persisted_secret = str(persisted_rows[0].get("toss_secret") or "")

        if persisted_secret != toss_secret:
            logger.error(
                "[PAYMENT] toss secret mismatch after persist: order_id=%s user_id=%s",
                request.order_id,
                user_id,
            )
            notifier.notify_payment_mismatch(
                order_id=request.order_id,
                mismatch_type="secret_persistence_mismatch",
                details="persisted toss secret did not match confirmed secret",
                user_id=user_id,
            )
            raise HTTPException(
                status_code=500,
                detail="결제 검증 데이터 저장 검증에 실패했습니다. 잠시 후 다시 시도해주세요.",
            )

    rpc_params = {
        "p_order_id": request.order_id,
        "p_payment_key": verified_payment_key,
        "p_method": toss_data.get("method"),
        "p_approved_at": toss_data.get("approvedAt"),
        "p_receipt_url": toss_data.get("receipt", {}).get("url")
        if toss_data.get("receipt")
        else None,
    }

    rpc_max_retries = 3
    result = None
    last_rpc_error = None

    for rpc_attempt in range(rpc_max_retries):
        try:
            result = await db_execute(
                lambda: supabase.rpc("complete_payment_v2", rpc_params).execute()
            )
            break
        except Exception as e:
            last_rpc_error = e
            logger.warning(
                f"[PAYMENT RPC RETRY] order_id={request.order_id}, attempt={rpc_attempt + 1}/{rpc_max_retries}, error={e}"
            )
            if rpc_attempt < rpc_max_retries - 1:
                import asyncio

                await asyncio.sleep(1 * (rpc_attempt + 1))
                continue

    if result is None:
        logger.error(
            f"[PAYMENT RPC FAILED] order_id={request.order_id}, error={last_rpc_error}"
        )
        await _track_payment_error("payment_complete_rpc_failed")
        notifier.notify_payment_mismatch(
            order_id=request.order_id,
            mismatch_type="complete_payment_rpc_failed",
            details=str(last_rpc_error or "unknown rpc failure"),
            user_id=user_id,
        )
        raise HTTPException(
            status_code=500,
            detail="결제가 승인되었으나 코인 지급에 실패했습니다. 고객센터로 문의해주세요. (주문번호: "
            + request.order_id
            + ")",
        )

    if result.data and len(result.data) > 0:
        row = result.data[0]
        if row.get("success"):
            await analytics.track_event(
                event_type="coin_purchased",
                event_data={"amount": request.amount, "method": "tosspayments"},
                user_id=user_id,
            )
            logger.info(f"[PAYMENT SUCCESS] order_id={request.order_id}")

            notifier.notify_payment_success(
                amount=request.amount,
                order_id=request.order_id,
                coin_amount=row.get("coin_amount", 0),
            )

            return {
                "success": True,
                "balance": row.get("new_balance"),
                "charged": row.get("coin_amount"),
            }
        else:
            error_msg = row.get("error_message", "결제 처리 실패")
            logger.error(
                f"[PAYMENT ERROR] order_id={request.order_id}, error={error_msg}"
            )
            await _track_payment_error("confirmation_failed")
            notifier.notify_payment_mismatch(
                order_id=request.order_id,
                mismatch_type="complete_payment_failed",
                details=str(error_msg),
                user_id=user_id,
            )
            raise HTTPException(status_code=400, detail=error_msg)

    logger.error(
        f"[PAYMENT ERROR] Unexpected RPC result for order_id={request.order_id}"
    )
    await _track_payment_error("unexpected_rpc_result")
    raise HTTPException(status_code=500, detail="결제 처리 중 오류가 발생했습니다")


@router.post("/spend")
async def spend_coins(
    request: SpendRequest,
    user_id: str = Depends(get_current_user_id),
    _rl: None = Depends(
        rate_limit_dependency(limit=20, window_seconds=60, scope="payment_spend")
    ),
):
    feature_key = request.feature_key
    reanalyze_reading_id: Optional[str] = None
    reanalyze_reading_row: Optional[dict[str, Any]] = None

    if feature_key == "reading_reanalyze":
        reanalyze_reading_id = (request.reference_id or "").strip()
        if not reanalyze_reading_id:
            raise HTTPException(
                status_code=400, detail="상세 사주 대상 리딩 정보가 필요합니다"
            )

        reanalyze_reading_row = await _get_owned_user_reading_for_reanalyze(
            user_id, reanalyze_reading_id
        )
        if not reanalyze_reading_row:
            raise HTTPException(
                status_code=404, detail="리딩 컨텍스트를 찾을 수 없습니다"
            )

    if request.idempotency_key:
        existing = await db_execute(
            lambda: (
                supabase.table("coin_transactions")
                .select("id, type, amount, reference_type")
                .eq("user_id", user_id)
                .eq("reference_type", feature_key)
                .eq("type", "spend")
                .eq("reference_id", request.idempotency_key)
                .limit(1)
                .execute()
            )
        )
        if existing.data:
            logger.info(
                f"[SPEND] Idempotent replay: user_id={user_id}, key={request.idempotency_key}"
            )
            wallet_res = await db_execute(
                lambda: (
                    supabase.table("user_wallets")
                    .select("balance")
                    .eq("user_id", user_id)
                    .execute()
                )
            )
            balance = wallet_res.data[0]["balance"] if wallet_res.data else 0
            tx_row = (
                existing.data[0]
                if isinstance(existing.data, list) and existing.data
                else {}
            )
            tx_id = (
                str(tx_row.get("id"))
                if isinstance(tx_row, dict) and tx_row.get("id")
                else None
            )
            response = {
                "success": True,
                "balance": balance,
                "spent": 0,
                "idempotent": True,
                "transaction_id": tx_id,
            }
            if feature_key == "reading_reanalyze":
                await _ensure_reanalyze_entitlement(
                    user_id,
                    reanalyze_reading_id or "",
                    existing_row=reanalyze_reading_row,
                )
                response["all_tabs_included"] = True
            return response

    if feature_key not in FEATURE_PRICES:
        raise HTTPException(status_code=400, detail="알 수 없는 기능입니다")

    default_price = FEATURE_PRICES.get(feature_key, 0)
    price = await config_service.get_feature_price(feature_key, default_price)

    description_map = {
        "reading_reanalyze": "사주 재분석",
        "ai_chat": "AI 도사 상담",
        "ai_chat_followup": "AI 도사 상담 후속 질문",
        "compatibility": "AI 궁합 분석",
        "flow_ai_advice": "기운 캘린더 AI 조언",
        "saju_image": "사주 이미지 생성",
    }
    charge_reference_id = request.idempotency_key or request.reference_id
    if feature_key == "reading_reanalyze" and reanalyze_reading_id:
        charge_reference_id = request.idempotency_key or reanalyze_reading_id

    try:
        result = await db_execute(
            lambda: supabase.rpc(
                "debit_coins_v2",
                {
                    "p_user_id": user_id,
                    "p_amount": price,
                    "p_description": description_map.get(feature_key, feature_key),
                    "p_reference_type": feature_key,
                    "p_reference_id": charge_reference_id,
                },
            ).execute()
        )

        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=500, detail="코인 차감 처리 실패")

        row = result.data[0]
        new_balance = row.get("new_balance")
        tx_id = row.get("transaction_id")

    except HTTPException:
        raise
    except Exception as e:
        error_str = str(e)
        if "WALLET_NOT_FOUND" in error_str:
            raise HTTPException(
                status_code=400, detail="지갑이 없습니다. 먼저 충전해주세요."
            )
        elif "INSUFFICIENT_BALANCE" in error_str:
            valid_balance_res = await db_execute(
                lambda: supabase.rpc(
                    "get_valid_balance", {"p_user_id": user_id}
                ).execute()
            )
            current_balance = 0
            if (
                valid_balance_res.data
                and isinstance(valid_balance_res.data, list)
                and isinstance(valid_balance_res.data[0], dict)
            ):
                current_balance = int(
                    valid_balance_res.data[0].get("valid_balance") or 0
                )
            raise HTTPException(
                status_code=400,
                detail=_create_insufficient_balance_error(price, current_balance),
            )
        logger.error(
            f"[SPEND ERROR] user_id={user_id}, feature={feature_key}, error={error_str}"
        )
        raise HTTPException(
            status_code=500, detail="코인 차감 처리 중 오류가 발생했습니다"
        )

    logger.info(f"[SPEND] user_id={user_id}, feature={feature_key}, amount={price}")
    if feature_key == "reading_reanalyze":
        await _ensure_reanalyze_entitlement(
            user_id,
            reanalyze_reading_id or "",
            existing_row=reanalyze_reading_row,
        )

    response = {
        "success": True,
        "balance": new_balance,
        "spent": price,
        "transaction_id": str(tx_id) if tx_id else None,
    }
    if feature_key == "reading_reanalyze":
        response["all_tabs_included"] = True
    return response


@router.get("/prices")
async def get_prices(
    _rl: None = Depends(
        rate_limit_dependency(limit=60, window_seconds=60, scope="payment_prices")
    ),
):
    prices = {}
    for feature_key, default_price in FEATURE_PRICES.items():
        prices[feature_key] = await config_service.get_feature_price(
            feature_key, default_price
        )
    return prices


def _internal_refund_coins(
    user_id: str, transaction_id: str, reason: str, revoke_access: bool = True
) -> dict[str, Any]:
    """
    내부 전용 환불 함수 - API 엔드포인트로 노출하지 않음
    서버가 서비스 실패를 감지했을 때만 호출
    revoke_access=True: 환불 후 해당 기능 접근도 취소 (기본)
    """
    try:
        tx_res = (
            supabase.table("coin_transactions")
            .select("*")
            .eq("id", transaction_id)
            .eq("user_id", user_id)
            .execute()
        )

        if not tx_res.data:
            logger.warning(f"[REFUND SKIP] Transaction not found: {transaction_id}")
            return {"success": False, "reason": "transaction_not_found"}

        tx = tx_res.data[0]

        if tx["type"] != "spend":
            logger.warning(f"[REFUND SKIP] Not a spend transaction: {transaction_id}")
            return {"success": False, "reason": "not_spend_type"}

        refund_amount = abs(tx["amount"])

        result = supabase.rpc(
            "refund_coins",
            {
                "p_user_id": user_id,
                "p_amount": refund_amount,
                "p_original_tx_id": transaction_id,
                "p_reason": reason,
            },
        ).execute()

        if result.data and len(result.data) > 0:
            row = result.data[0]
            logger.info(f"[REFUND SUCCESS] user_id={user_id}, amount={refund_amount}")
            partial_failure = False

            if revoke_access:
                try:
                    update_payload = {
                        "description": f"{tx.get('description', '')} [refunded: {reason}]"
                    }
                    if "metadata" in tx:
                        update_payload = {
                            "metadata": {
                                "refunded": True,
                                "refund_tx_id": str(row.get("refund_tx_id")),
                                "refund_reason": reason,
                            }
                        }

                    # Mark original transaction as refunded to prevent re-use
                    supabase.table("coin_transactions").update(update_payload).eq(
                        "id", transaction_id
                    ).execute()
                except Exception as e:
                    partial_failure = True
                    logger.exception(
                        f"[REFUND] CRITICAL: Refund succeeded but access revocation failed: {e}"
                    )

            return {
                "success": True,
                "refunded": refund_amount,
                "new_balance": row.get("new_balance"),
                "refund_tx_id": str(row.get("refund_tx_id")),
                "manual_review_required": partial_failure,
            }

        return {"success": False, "reason": "rpc_failed"}

    except Exception as e:
        error_str = str(e)
        if "ALREADY_REFUNDED" in error_str:
            logger.warning(f"[REFUND SKIP] Already refunded: {transaction_id}")
            return {"success": False, "reason": "already_refunded"}
        logger.exception(f"[REFUND ERROR] user_id={user_id}, error={error_str}")
        return {"success": False, "reason": str(e)}


class PaymentResult:
    def __init__(
        self,
        success: bool,
        transaction_id: Optional[str] = None,
        is_free: bool = False,
        error: Optional[str] = None,
    ):
        self.success = success
        self.transaction_id = transaction_id
        self.is_free = is_free
        self.error = error


async def charge_for_paid_feature(
    user_id: str,
    feature_key: str,
    price: int,
    description: str,
    reference_id: Optional[str] = None,
) -> PaymentResult:
    try:
        # reference_id를 명시한 호출만 멱등 처리한다.
        # 기본값은 충돌 방지를 위해 항상 유니크하게 생성한다.
        idempotency_ref = (
            reference_id
            or f"{user_id}:{feature_key}:{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}:{uuid.uuid4().hex}"
        )

        result = await db_execute(
            lambda: supabase.rpc(
                "charge_for_feature",
                {
                    "p_user_id": user_id,
                    "p_feature_key": feature_key,
                    "p_price": price,
                    "p_description": description,
                    "p_reference_id": idempotency_ref,
                },
            ).execute()
        )

        if not result.data or len(result.data) == 0:
            return PaymentResult(success=False, error="결제 처리 실패")

        row = result.data[0]

        if row.get("is_free"):
            logger.info(f"[PAID FEATURE FREE] user_id={user_id}, feature={feature_key}")
            return PaymentResult(success=True, is_free=True)

        if row.get("error_message"):
            return PaymentResult(success=False, error=row["error_message"])

        if row.get("success"):
            tx_id = row.get("transaction_id")
            logger.info(
                f"[PAID FEATURE CHARGED] user_id={user_id}, feature={feature_key}, tx={tx_id}"
            )
            return PaymentResult(
                success=True, transaction_id=str(tx_id) if tx_id else None
            )

        return PaymentResult(success=False, error="결제 처리 실패")

    except Exception as e:
        error_str = str(e)
        logger.error(
            f"[PAID FEATURE ERROR] user_id={user_id}, feature={feature_key}, error={error_str}"
        )

        if "WALLET_NOT_FOUND" in error_str:
            return PaymentResult(
                success=False, error="지갑이 없습니다. 먼저 충전해주세요."
            )
        elif "INSUFFICIENT_BALANCE" in error_str:
            return PaymentResult(success=False, error="엽전이 부족합니다.")

        return PaymentResult(success=False, error="결제 처리 중 오류가 발생했습니다")


async def refund_on_failure(
    user_id: str,
    transaction_id: str,
    reason: str,
    feature_key: str = "unknown",
) -> bool:
    if not transaction_id:
        return False
    result = _internal_refund_coins(user_id, transaction_id, reason)
    success = result.get("success", False)
    if not success:
        logger.error(
            f"[REFUND FAILED] user_id={user_id}, tx={transaction_id}, reason={reason}, result={result}"
        )
        notifier.notify_paid_feature_refund_issue(
            feature_key=feature_key,
            user_id=user_id,
            transaction_id=transaction_id,
            reason=reason,
            issue_type="refund_failed",
            error=str(result.get("reason", "unknown")),
        )
    elif result.get("manual_review_required"):
        logger.error(
            f"[REFUND PARTIAL] Refund succeeded but access revocation failed. Manual review needed: user_id={user_id}, tx={transaction_id}"
        )
        notifier.notify_paid_feature_refund_issue(
            feature_key=feature_key,
            user_id=user_id,
            transaction_id=transaction_id,
            reason=reason,
            issue_type="manual_review_required",
            error="refund succeeded but access revocation failed",
        )
    return success


async def cleanup_stale_pending_payments(max_age_hours: int = 24) -> int:
    """
    정리: max_age_hours 이상 된 pending 결제 레코드를 expired로 변경.
    스케줄러 또는 admin에서 호출.
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=max_age_hours)).isoformat()
    try:
        result = await db_execute(
            lambda: (
                supabase.table("payments")
                .update({"status": "expired"})
                .eq("status", "pending")
                .lt("created_at", cutoff)
                .execute()
            )
        )
        count = len(result.data) if result.data else 0
        if count > 0:
            logger.info(
                f"[PAYMENT CLEANUP] Expired {count} stale pending payments older than {max_age_hours}h"
            )
        return count
    except Exception as e:
        logger.exception(f"[PAYMENT CLEANUP] Error: {e}")
        return 0


@router.get("/config")
async def get_payment_config(
    _rl: None = Depends(
        rate_limit_dependency(limit=60, window_seconds=60, scope="payment_config")
    ),
):
    mode = await config_service.get_payment_mode()
    return {"client_key": _get_toss_client_key_for_mode(mode), "mode": mode}


@router.post("/admin/cleanup-pending")
async def admin_cleanup_pending(
    admin: str = Depends(require_admin),
    _rl: None = Depends(
        rate_limit_dependency(limit=5, window_seconds=60, scope="admin_cleanup")
    ),
):
    """관리자용: 오래된 pending 결제 레코드 정리"""
    count = await cleanup_stale_pending_payments()
    return {"cleaned": count}


class WalletExpirationResponse(BaseModel):
    total_balance: int
    valid_balance: int
    expired_balance: int
    expiring_soon_balance: int
    expiring_soon_date: Optional[str] = None


@router.get("/wallet/expiration", response_model=WalletExpirationResponse)
async def get_wallet_expiration(user_id: str = Depends(get_current_user_id)):
    result = await db_execute(
        lambda: supabase.rpc("get_valid_balance", {"p_user_id": user_id}).execute()
    )

    if not result.data or len(result.data) == 0:
        return WalletExpirationResponse(
            total_balance=0,
            valid_balance=0,
            expired_balance=0,
            expiring_soon_balance=0,
            expiring_soon_date=None,
        )

    row = result.data[0]
    return WalletExpirationResponse(
        total_balance=row.get("total_balance", 0),
        valid_balance=row.get("valid_balance", 0),
        expired_balance=row.get("expired_balance", 0),
        expiring_soon_balance=row.get("expiring_soon_balance", 0),
        expiring_soon_date=row.get("expiring_soon_date"),
    )
