import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .auth import require_auth
from .deps import rate_limit_dependency
from ..db.supabase_client import db_execute, supabase
from ..services.push_service import send_daily_reminders, send_push_to_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/push", tags=["push"])


class PushSubscriptionKeys(BaseModel):
    p256dh: Optional[str] = None
    auth: Optional[str] = None


class PushSubscribeRequest(BaseModel):
    endpoint: Optional[str] = None
    keys: Optional[PushSubscriptionKeys] = None


class PushUnsubscribeRequest(BaseModel):
    endpoint: Optional[str] = None


class PushStatusResponse(BaseModel):
    status: str


class PushSendTestResponse(BaseModel):
    sent_count: int


class PushSendReminderResponse(BaseModel):
    total_users: int
    eligible_users: int
    sent_users: int
    failed_users: int
    sent_notifications: int
    skipped_users: int


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _validate_subscription_payload(
    request: PushSubscribeRequest,
) -> tuple[str, str, str]:
    endpoint = (request.endpoint or "").strip()
    p256dh = (request.keys.p256dh if request.keys else "") or ""
    auth = (request.keys.auth if request.keys else "") or ""

    if not endpoint or not p256dh or not auth:
        raise HTTPException(
            status_code=400,
            detail="유효한 endpoint 및 keys(p256dh, auth)가 필요합니다.",
        )

    return endpoint, p256dh, auth


@router.post("/subscribe", response_model=PushStatusResponse)
async def subscribe_push(
    request: PushSubscribeRequest,
    current_user: dict = Depends(require_auth),
    _rate_limit: None = Depends(
        rate_limit_dependency(limit=5, window_seconds=60, scope="push_subscribe")
    ),
):
    user_id = current_user["user_id"]
    endpoint, p256dh, auth = _validate_subscription_payload(request)
    now_iso = _utc_now_iso()

    try:
        await db_execute(
            lambda: (
                supabase.table("push_subscriptions")
                .upsert(
                    {
                        "user_id": user_id,
                        "endpoint": endpoint,
                        "p256dh": p256dh,
                        "auth_key": auth,
                        "is_active": True,
                        "updated_at": now_iso,
                        "failure_count": 0,
                    },
                    on_conflict="user_id,endpoint",
                )
                .execute()
            )
        )
        return PushStatusResponse(status="subscribed")
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("[PUSH] subscribe failed user_id=%s: %s", user_id, exc)
        raise HTTPException(status_code=500, detail="푸시 구독 저장에 실패했습니다.")


@router.post("/unsubscribe", response_model=PushStatusResponse)
async def unsubscribe_push(
    request: PushUnsubscribeRequest,
    current_user: dict = Depends(require_auth),
    _rate_limit: None = Depends(
        rate_limit_dependency(limit=5, window_seconds=60, scope="push_unsubscribe")
    ),
):
    user_id = current_user["user_id"]
    endpoint = (request.endpoint or "").strip()
    if not endpoint:
        raise HTTPException(status_code=400, detail="endpoint가 필요합니다.")

    try:
        await db_execute(
            lambda: (
                supabase.table("push_subscriptions")
                .update({"is_active": False, "updated_at": _utc_now_iso()})
                .eq("user_id", user_id)
                .eq("endpoint", endpoint)
                .execute()
            )
        )
        return PushStatusResponse(status="unsubscribed")
    except Exception as exc:
        logger.exception("[PUSH] unsubscribe failed user_id=%s: %s", user_id, exc)
        raise HTTPException(status_code=500, detail="푸시 구독 해제에 실패했습니다.")


@router.post("/send-test", response_model=PushSendTestResponse)
async def send_test_push(
    current_user: dict = Depends(require_auth),
    _rate_limit: None = Depends(
        rate_limit_dependency(limit=3, window_seconds=60, scope="push_send_test")
    ),
):
    user_id = current_user["user_id"]
    try:
        sent_count = await send_push_to_user(
            user_id=user_id,
            title="테스트 알림",
            body="웹 푸시 연동이 정상 동작합니다.",
            url="/",
        )
        return PushSendTestResponse(sent_count=sent_count)
    except Exception as exc:
        logger.exception("[PUSH] send-test failed user_id=%s: %s", user_id, exc)
        raise HTTPException(status_code=500, detail="테스트 푸시 발송에 실패했습니다.")


@router.post("/send-reminder", response_model=PushSendReminderResponse)
async def send_reminder_push(
    current_user: dict = Depends(require_auth),
    _rate_limit: None = Depends(
        rate_limit_dependency(limit=2, window_seconds=300, scope="push_send_reminder")
    ),
):
    user_id = current_user["user_id"]
    try:
        summary = await send_daily_reminders()
        logger.info("[PUSH] reminder triggered by user_id=%s", user_id)
        return PushSendReminderResponse(**summary)
    except Exception as exc:
        logger.exception("[PUSH] send-reminder failed user_id=%s: %s", user_id, exc)
        raise HTTPException(status_code=500, detail="리마인더 발송에 실패했습니다.")
