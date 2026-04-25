import logging
import hmac
import hashlib
from datetime import datetime, timezone
from fastapi import APIRouter, Request, HTTPException, Header, Depends
from .deps import rate_limit_dependency
from pydantic import BaseModel
from typing import Optional

from ..db.supabase_client import supabase, db_execute
from ..config import get_settings
from ..services.config_service import config_service
from ..services.notification_service import notifier

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhook", tags=["webhook"])


class TossWebhookPayload(BaseModel):
    eventType: str
    createdAt: str
    data: dict


def verify_webhook_signature(payload: bytes, signature: str, secret_key: str) -> bool:
    expected = hmac.new(secret_key.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


async def _resolve_mode_for_order(order_id: str) -> str:
    mode = await config_service.get_payment_mode()
    if not order_id:
        return mode

    try:
        payment_res = await db_execute(
            lambda: (
                supabase.table("payments")
                .select("*")
                .eq("order_id", order_id)
                .limit(1)
                .execute()
            )
        )
        rows = payment_res.data if isinstance(payment_res.data, list) else []
        payment_row = rows[0] if rows and isinstance(rows[0], dict) else {}
        snapshot_mode = payment_row.get("payment_mode_snapshot")
        if snapshot_mode in ("test", "live"):
            return str(snapshot_mode)
    except Exception as e:
        logger.warning(
            "[WEBHOOK] Failed to resolve payment mode snapshot: order_id=%s error=%s",
            order_id,
            e,
        )

    return mode


async def _clawback_payment_by_order(order_id: str, event_type: str) -> dict:
    reason = f"결제 취소 ({event_type}, order_id={order_id})"
    result = await db_execute(
        lambda: supabase.rpc(
            "refund_payment_by_order_v1",
            {
                "p_order_id": order_id,
                "p_reason": reason,
                "p_event_type": event_type,
            },
        ).execute()
    )

    rows = result.data if isinstance(result.data, list) else []
    if not rows or not isinstance(rows[0], dict):
        raise RuntimeError(
            f"refund_payment_by_order_v1 returned empty result: order_id={order_id}"
        )

    row = rows[0]
    if not row.get("success"):
        raise RuntimeError(
            f"refund_payment_by_order_v1 failed: order_id={order_id}, message={row.get('message')}"
        )

    return row


async def _verify_deposit_callback_secret(data: dict) -> None:
    order_id = str(data.get("orderId") or "")
    webhook_secret = str(data.get("secret") or "")

    if not order_id:
        raise HTTPException(status_code=400, detail="Missing orderId")
    if not webhook_secret:
        raise HTTPException(status_code=401, detail="Missing deposit secret")

    payment_res = await db_execute(
        lambda: (
            supabase.table("payments")
            .select("toss_secret,created_at")
            .eq("order_id", order_id)
            .limit(1)
            .execute()
        )
    )
    rows = payment_res.data if isinstance(payment_res.data, list) else []
    payment_row = rows[0] if rows and isinstance(rows[0], dict) else {}
    expected_secret = str(payment_row.get("toss_secret") or "")

    if not expected_secret:
        created_at_raw = payment_row.get("created_at")
        legacy_cutoff = datetime(2026, 2, 28, tzinfo=timezone.utc)
        created_at: datetime | None = None
        if isinstance(created_at_raw, str) and created_at_raw:
            try:
                created_at = datetime.fromisoformat(
                    created_at_raw.replace("Z", "+00:00")
                )
            except ValueError:
                created_at = None

        if created_at and created_at < legacy_cutoff:
            logger.warning(
                "[WEBHOOK] Legacy payment without toss_secret accepted: order_id=%s created_at=%s",
                order_id,
                created_at_raw,
            )
            return

        logger.warning("[WEBHOOK] Missing stored toss_secret: order_id=%s", order_id)
        raise HTTPException(status_code=401, detail="Unverified deposit callback")

    if not hmac.compare_digest(expected_secret, webhook_secret):
        logger.warning("[WEBHOOK] Deposit secret mismatch: order_id=%s", order_id)
        raise HTTPException(status_code=401, detail="Invalid deposit callback")


async def _claim_webhook_event(event_type: str, order_id: str, status: str) -> bool:
    try:
        await db_execute(
            lambda: (
                supabase.table("webhook_events")
                .insert(
                    {
                        "event_type": event_type,
                        "order_id": order_id,
                        "status": status,
                    }
                )
                .execute()
            )
        )
        return True
    except Exception as e:
        message = str(e).lower()
        if "duplicate key" in message or "unique" in message:
            logger.info(
                f"[WEBHOOK DEDUP] Duplicate event skipped: {event_type} order={order_id} status={status}"
            )
            return False
        logger.warning(f"[WEBHOOK DEDUP] Claim error: {e}")
        raise


async def _release_webhook_claim(event_type: str, order_id: str, status: str) -> None:
    try:
        await db_execute(
            lambda: (
                supabase.table("webhook_events")
                .delete()
                .eq("event_type", event_type)
                .eq("order_id", order_id)
                .eq("status", status)
                .execute()
            )
        )
    except Exception as e:
        logger.warning(f"[WEBHOOK DEDUP] Release error: {e}")


async def _restore_expired_payment(order_id: str) -> bool:
    result = await db_execute(
        lambda: (
            supabase.table("payments")
            .update(
                {
                    "status": "pending",
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            .eq("order_id", order_id)
            .eq("status", "expired")
            .execute()
        )
    )
    return bool(result.data)


@router.post("/toss")
async def handle_toss_webhook(
    request: Request,
    x_tosspayments_signature: Optional[str] = Header(
        None, alias="X-Tosspayments-Signature"
    ),
    _rl: None = Depends(
        rate_limit_dependency(limit=30, window_seconds=60, scope="webhook_toss")
    ),
):
    settings = get_settings()
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > 65536:
                raise HTTPException(status_code=413, detail="Payload too large")
        except ValueError:
            logger.warning(f"[WEBHOOK] Invalid content-length header: {content_length}")

    body = await request.body()

    try:
        payload = TossWebhookPayload.model_validate_json(body)
    except Exception as e:
        logger.error(f"[WEBHOOK] Invalid payload: {e}")
        raise HTTPException(status_code=400, detail="Invalid payload")

    event_type = payload.eventType
    data = payload.data
    order_id = str(data.get("orderId") or "") if isinstance(data, dict) else ""

    global_mode = await config_service.get_payment_mode()
    mode = await _resolve_mode_for_order(order_id)
    secret_key = (
        settings.toss_live_secret_key
        if mode == "live"
        else settings.toss_test_secret_key
    )
    allow_unsigned_in_test = settings.allow_unsigned_webhook_in_test
    is_live_mode = mode == "live"

    if not secret_key:
        logger.error("[WEBHOOK] toss secret key is not configured for current mode")
        raise HTTPException(status_code=500, detail="Server configuration error")

    if not x_tosspayments_signature:
        if not is_live_mode and allow_unsigned_in_test:
            logger.warning(
                "[WEBHOOK] Missing signature (allowed in non-live mode by config)"
            )
        else:
            logger.warning(
                "[WEBHOOK] Missing signature: mode=%s global_mode=%s", mode, global_mode
            )
            raise HTTPException(status_code=401, detail="Missing signature")
    elif not verify_webhook_signature(body, x_tosspayments_signature, secret_key):
        logger.warning(f"[WEBHOOK] Invalid signature for mode={mode}")
        raise HTTPException(status_code=401, detail="Invalid signature")

    if event_type == "DEPOSIT_CALLBACK":
        try:
            await _verify_deposit_callback_secret(data)
        except Exception as e:
            notifier.notify_webhook_processing_failure(
                event_type="DEPOSIT_CALLBACK_SECRET",
                order_id=str(data.get("orderId") or ""),
                error=str(e),
            )
            raise

    logger.info(f"[WEBHOOK] Received event: {event_type}")

    try:
        if event_type == "PAYMENT_STATUS_CHANGED":
            await handle_payment_status_changed(data)
        elif event_type == "DEPOSIT_CALLBACK":
            await handle_deposit_callback(data)
        elif event_type == "CANCEL_STATUS_CHANGED":
            await handle_cancel_status_changed(data)
        else:
            logger.info(f"[WEBHOOK] Unhandled event type: {event_type}")
    except Exception as e:
        logger.error(f"[WEBHOOK] Business logic failed for {event_type}: {e}")
        notifier.notify_webhook_processing_failure(
            event_type=event_type,
            order_id=str(data.get("orderId") or ""),
            error=str(e),
        )
        raise HTTPException(status_code=500, detail="Webhook processing failed")

    return {"success": True}


async def handle_payment_status_changed(data: dict):
    payment_key = data.get("paymentKey")
    order_id = data.get("orderId", "")
    status = data.get("status", "")

    if not order_id:
        logger.warning("[WEBHOOK] Missing orderId in payment status changed event")
        return

    if status not in {"DONE", "CANCELED", "ABORTED", "EXPIRED"}:
        logger.info(
            f"[WEBHOOK] Ignoring payment status event: order_id={order_id}, status={status}"
        )
        return

    if not await _claim_webhook_event("PAYMENT_STATUS_CHANGED", order_id, status):
        return

    logger.info(
        f"[WEBHOOK] Payment status changed: order_id={order_id}, status={status}"
    )

    try:
        payment_res = await db_execute(
            lambda: (
                supabase.table("payments")
                .select("*")
                .eq("order_id", order_id)
                .execute()
            )
        )
        if not payment_res.data:
            logger.warning(f"[WEBHOOK] Payment not found: order_id={order_id}")
            await _release_webhook_claim("PAYMENT_STATUS_CHANGED", order_id, status)
            return

        payment = payment_res.data[0]
        if not isinstance(payment, dict):
            logger.error(f"[WEBHOOK] Invalid payment row shape: order_id={order_id}")
            raise RuntimeError("Invalid payment row shape")

        current_status = payment.get("status")

        if status == "DONE" and current_status in {"pending", "expired"}:
            if current_status == "expired":
                restored = await _restore_expired_payment(order_id)
                if not restored:
                    logger.warning(
                        "[WEBHOOK] Expired payment could not be restored for completion: order_id=%s",
                        order_id,
                    )
                    return
                logger.warning(
                    "[WEBHOOK] Restored expired payment for late success webhook: order_id=%s",
                    order_id,
                )
            logger.info(f"[WEBHOOK] Processing confirmed payment: order_id={order_id}")
            receipt = data.get("receipt")
            receipt_url = receipt.get("url") if isinstance(receipt, dict) else None

            result = await db_execute(
                lambda: supabase.rpc(
                    "complete_payment_v2",
                    {
                        "p_order_id": order_id,
                        "p_payment_key": payment_key,
                        "p_method": data.get("method"),
                        "p_approved_at": data.get("approvedAt"),
                        "p_receipt_url": receipt_url,
                    },
                ).execute()
            )

            if isinstance(result.data, list) and len(result.data) > 0:
                row = result.data[0]
                if not isinstance(row, dict):
                    error_msg = f"Payment completion failed: order_id={order_id}, invalid RPC row shape"
                    logger.error(f"[WEBHOOK] {error_msg}")
                    raise RuntimeError(error_msg)

                if row.get("success"):
                    logger.info(
                        f"[WEBHOOK] Payment completed via webhook: order_id={order_id}, credited={row.get('coin_amount')} coins"
                    )
                else:
                    error_msg = f"Payment completion failed: order_id={order_id}, error={row.get('error_message')}"
                    logger.error(f"[WEBHOOK] {error_msg}")
                    raise RuntimeError(error_msg)
            else:
                error_msg = (
                    f"Payment completion failed: order_id={order_id}, empty RPC result"
                )
                logger.error(f"[WEBHOOK] {error_msg}")
                raise RuntimeError(error_msg)

        elif status == "CANCELED":
            if current_status == "done":
                clawback = await _clawback_payment_by_order(
                    order_id, "PAYMENT_STATUS_CHANGED"
                )
                clawed_back_raw = clawback.get("clawed_back_amount", 0)
                clawed_back = clawed_back_raw if isinstance(clawed_back_raw, int) else 0
                remaining_raw = clawback.get("remaining_unclawed_amount", 0)
                remaining = remaining_raw if isinstance(remaining_raw, int) else 0
                manual_review_required = bool(clawback.get("manual_review_required"))
                if manual_review_required:
                    logger.warning(
                        "[WEBHOOK] Partial clawback requires manual review: order_id=%s clawed_back=%s remaining=%s",
                        order_id,
                        clawed_back,
                        remaining,
                    )
                else:
                    logger.info(
                        "[WEBHOOK] Coins clawed back for canceled done payment: order_id=%s, coins=%s",
                        order_id,
                        clawed_back,
                    )

                from ..services.notification_service import notifier

                amount_raw = payment.get("amount", 0)
                amount = amount_raw if isinstance(amount_raw, int) else 0
                notifier.notify_payment_canceled(order_id=order_id, amount=amount)
                return

            elif current_status == "failed":
                logger.warning(
                    f"[WEBHOOK] Ignoring CANCELED for already failed payment: order_id={order_id}"
                )
            else:
                logger.info(f"[WEBHOOK] Payment canceled: order_id={order_id}")
                result = await db_execute(
                    lambda: (
                        supabase.table("payments")
                        .update(
                            {
                                "status": "canceled",
                                "updated_at": datetime.utcnow().isoformat(),
                            }
                        )
                        .eq("order_id", order_id)
                        .eq("status", current_status)
                        .execute()
                    )
                )
                if not result.data:
                    logger.warning(
                        f"[WEBHOOK] Status already changed, skipping update: order_id={order_id}"
                    )
                    return

                from ..services.notification_service import notifier

                amount_raw = payment.get("amount", 0)
                amount = amount_raw if isinstance(amount_raw, int) else 0
                notifier.notify_payment_canceled(order_id=order_id, amount=amount)

        elif status == "ABORTED":
            logger.info(f"[WEBHOOK] Payment aborted: order_id={order_id}")
            await db_execute(
                lambda: supabase.rpc(
                    "fail_payment",
                    {
                        "p_order_id": order_id,
                        "p_failure_code": "PAYMENT_ABORTED",
                        "p_failure_message": "결제가 중단되었습니다",
                    },
                ).execute()
            )

        elif status == "EXPIRED":
            logger.info(f"[WEBHOOK] Payment expired: order_id={order_id}")
            await db_execute(
                lambda: supabase.rpc(
                    "fail_payment",
                    {
                        "p_order_id": order_id,
                        "p_failure_code": "PAYMENT_EXPIRED",
                        "p_failure_message": "결제 시간이 만료되었습니다",
                    },
                ).execute()
            )
    except Exception as e:
        await _release_webhook_claim("PAYMENT_STATUS_CHANGED", order_id, status)
        logger.error(
            f"[WEBHOOK] Error processing payment status: order_id={order_id}, status={status}, error={e}"
        )
        raise


async def handle_deposit_callback(data: dict):
    order_id = data.get("orderId", "")
    status = data.get("status", "")

    logger.info(f"[WEBHOOK] Deposit callback: order_id={order_id}, status={status}")

    if status != "DONE":
        return

    if not order_id:
        logger.warning("[WEBHOOK] Missing orderId in deposit callback")
        return

    if not await _claim_webhook_event("DEPOSIT_CALLBACK", order_id, status):
        return

    try:
        payment_res = await db_execute(
            lambda: (
                supabase.table("payments")
                .select("*")
                .eq("order_id", order_id)
                .execute()
            )
        )
        if not payment_res.data:
            logger.warning(
                f"[WEBHOOK] Payment not found in deposit callback: order_id={order_id}"
            )
            await _release_webhook_claim("DEPOSIT_CALLBACK", order_id, status)
            return

        payment = payment_res.data[0]
        if not isinstance(payment, dict):
            logger.error(
                f"[WEBHOOK] Invalid payment row shape in deposit callback: order_id={order_id}"
            )
            raise RuntimeError("Invalid payment row shape")

        current_status = str(payment.get("status") or "")
        if current_status in {"pending", "expired"}:
            if current_status == "expired":
                restored = await _restore_expired_payment(order_id)
                if not restored:
                    logger.warning(
                        "[WEBHOOK] Expired deposit payment could not be restored: order_id=%s",
                        order_id,
                    )
                    return
                logger.warning(
                    "[WEBHOOK] Restored expired payment for late deposit callback: order_id=%s",
                    order_id,
                )
            result = await db_execute(
                lambda: supabase.rpc(
                    "complete_payment_v2",
                    {
                        "p_order_id": order_id,
                        "p_payment_key": data.get("paymentKey"),
                        "p_method": "가상계좌",
                        "p_approved_at": data.get("approvedAt"),
                        "p_receipt_url": None,
                    },
                ).execute()
            )

            if isinstance(result.data, list) and len(result.data) > 0:
                row = result.data[0]
                if not isinstance(row, dict):
                    error_msg = f"Deposit completion failed: order_id={order_id}, invalid RPC row shape"
                    logger.error(f"[WEBHOOK] {error_msg}")
                    raise RuntimeError(error_msg)

                if row.get("success"):
                    logger.info(
                        f"[WEBHOOK] Virtual account deposit completed: order_id={order_id}, credited={row.get('coin_amount')} coins"
                    )
                else:
                    error_msg = f"Deposit completion failed: order_id={order_id}, error={row.get('error_message')}"
                    logger.error(f"[WEBHOOK] {error_msg}")
                    raise RuntimeError(error_msg)
            else:
                error_msg = (
                    f"Deposit completion failed: order_id={order_id}, empty RPC result"
                )
                logger.error(f"[WEBHOOK] {error_msg}")
                raise RuntimeError(error_msg)
        else:
            logger.info(
                "[WEBHOOK] Ignoring deposit callback for already processed payment: order_id=%s status=%s",
                order_id,
                current_status,
            )
    except Exception as e:
        await _release_webhook_claim("DEPOSIT_CALLBACK", order_id, status)
        logger.error(
            f"[WEBHOOK] Error processing deposit: order_id={order_id}, error={e}"
        )
        raise


async def handle_cancel_status_changed(data: dict):
    order_id = data.get("orderId", "")
    cancel_status = data.get("cancelStatus", "")

    logger.info(
        f"[WEBHOOK] Cancel status changed: order_id={order_id}, status={cancel_status}"
    )

    if cancel_status != "DONE":
        return

    if not order_id:
        logger.warning("[WEBHOOK] Missing orderId in cancel status changed event")
        return

    if not await _claim_webhook_event("CANCEL_STATUS_CHANGED", order_id, cancel_status):
        return

    try:
        payment_res = await db_execute(
            lambda: (
                supabase.table("payments")
                .select("status,user_id,coin_amount")
                .eq("order_id", order_id)
                .execute()
            )
        )
        if payment_res.data:
            payment = payment_res.data[0]
            if not isinstance(payment, dict):
                logger.error(
                    f"[WEBHOOK] Invalid payment row shape in cancel callback: order_id={order_id}"
                )
                raise RuntimeError("Invalid payment row shape")

            current_status = payment.get("status")

            if current_status == "done":
                clawback = await _clawback_payment_by_order(
                    order_id, "CANCEL_STATUS_CHANGED"
                )
                clawed_back_raw = clawback.get("clawed_back_amount", 0)
                clawed_back = clawed_back_raw if isinstance(clawed_back_raw, int) else 0
                remaining_raw = clawback.get("remaining_unclawed_amount", 0)
                remaining = remaining_raw if isinstance(remaining_raw, int) else 0
                manual_review_required = bool(clawback.get("manual_review_required"))
                if manual_review_required:
                    logger.warning(
                        "[WEBHOOK] Partial cancel clawback requires manual review: order_id=%s clawed_back=%s remaining=%s",
                        order_id,
                        clawed_back,
                        remaining,
                    )
                else:
                    logger.info(
                        "[WEBHOOK] Coins clawed back for cancel done payment: order_id=%s, coins=%s",
                        order_id,
                        clawed_back,
                    )

                logger.info(
                    f"[WEBHOOK] Payment cancel completed from done status: order_id={order_id}"
                )
                return

            if current_status == "failed":
                logger.warning(
                    f"[WEBHOOK] Ignoring cancel for already failed payment: order_id={order_id}"
                )
                return

            result = await db_execute(
                lambda: (
                    supabase.table("payments")
                    .update(
                        {
                            "status": "canceled",
                            "updated_at": datetime.utcnow().isoformat(),
                        }
                    )
                    .eq("order_id", order_id)
                    .eq("status", current_status)
                    .execute()
                )
            )
            if not result.data:
                logger.warning(
                    f"[WEBHOOK] Status already changed, skipping update: order_id={order_id}"
                )
                return

            logger.info(f"[WEBHOOK] Payment cancel completed: order_id={order_id}")
            return

        result = await db_execute(
            lambda: (
                supabase.table("payments")
                .update(
                    {"status": "canceled", "updated_at": datetime.utcnow().isoformat()}
                )
                .eq("order_id", order_id)
                .eq("status", "pending")
                .execute()
            )
        )
        if not result.data:
            logger.warning(
                f"[WEBHOOK] Status already changed, skipping update: order_id={order_id}"
            )
            return

        logger.info(f"[WEBHOOK] Payment cancel completed: order_id={order_id}")
    except Exception as e:
        await _release_webhook_claim("CANCEL_STATUS_CHANGED", order_id, cancel_status)
        logger.error(
            f"[WEBHOOK] Error processing cancel status: order_id={order_id}, status={cancel_status}, error={e}"
        )
        raise
