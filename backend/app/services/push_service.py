import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from starlette.concurrency import run_in_threadpool  # pyright: ignore[reportMissingImports]

try:
    _pywebpush = __import__("pywebpush")
    WebPushException = getattr(_pywebpush, "WebPushException")
    webpush = getattr(_pywebpush, "webpush")
except Exception:

    class WebPushException(Exception):
        pass

    def webpush(*args: Any, **kwargs: Any) -> None:
        raise RuntimeError("pywebpush is not installed")


from ..config import get_settings
from ..db.supabase_client import db_execute, supabase

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _extract_status_code(error: WebPushException) -> int | None:
    response = getattr(error, "response", None)
    if response is None:
        return None
    status_code = getattr(response, "status_code", None)
    return status_code if isinstance(status_code, int) else None


async def _deactivate_subscription(subscription_id: str) -> None:
    now_iso = _now_iso()
    await db_execute(
        lambda: (
            supabase.table("push_subscriptions")
            .update({"is_active": False, "updated_at": now_iso})
            .eq("id", subscription_id)
            .execute()
        )
    )


async def _register_failure(subscription_id: str, current_failure_count: int) -> None:
    now_iso = _now_iso()
    next_failure_count = current_failure_count + 1
    payload: dict[str, Any] = {
        "failure_count": next_failure_count,
        "updated_at": now_iso,
    }
    if next_failure_count >= 3:
        payload["is_active"] = False

    await db_execute(
        lambda: (
            supabase.table("push_subscriptions")
            .update(payload)
            .eq("id", subscription_id)
            .execute()
        )
    )


async def _register_success(subscription_id: str) -> None:
    now_iso = _now_iso()
    await db_execute(
        lambda: (
            supabase.table("push_subscriptions")
            .update(
                {
                    "last_sent_at": now_iso,
                    "updated_at": now_iso,
                    "failure_count": 0,
                    "is_active": True,
                }
            )
            .eq("id", subscription_id)
            .execute()
        )
    )


async def send_push_to_user(user_id: str, title: str, body: str, url: str = "/") -> int:
    settings = get_settings()
    if not settings.vapid_private_key:
        logger.info("[PUSH] vapid_private_key not configured; skip sending")
        return 0

    result = await db_execute(
        lambda: (
            supabase.table("push_subscriptions")
            .select("id, endpoint, p256dh, auth_key, failure_count")
            .eq("user_id", user_id)
            .eq("is_active", True)
            .execute()
        )
    )

    rows = [row for row in (result.data or []) if isinstance(row, dict)]
    if not rows:
        return 0

    payload = {
        "title": title,
        "body": body,
        "data": {"url": url},
    }

    sent_count = 0
    for row in rows:
        subscription_id = str(row.get("id") or "")
        if not subscription_id:
            continue

        subscription_info = {
            "endpoint": row.get("endpoint", ""),
            "keys": {
                "p256dh": row.get("p256dh", ""),
                "auth": row.get("auth_key", ""),
            },
        }

        try:
            await run_in_threadpool(
                webpush,
                subscription_info=subscription_info,
                data=json.dumps(payload, ensure_ascii=False),
                vapid_private_key=settings.vapid_private_key,
                vapid_claims={"sub": settings.vapid_email},
            )
            sent_count += 1
            await _register_success(subscription_id)
        except WebPushException as exc:
            status_code = _extract_status_code(exc)
            if status_code in (404, 410):
                await _deactivate_subscription(subscription_id)
            else:
                raw_failure_count = row.get("failure_count")
                failure_count = (
                    raw_failure_count if isinstance(raw_failure_count, int) else 0
                )
                await _register_failure(subscription_id, failure_count)
            logger.warning(
                "[PUSH] failed for subscription=%s status=%s",
                subscription_id,
                status_code,
            )
        except Exception:
            raw_failure_count = row.get("failure_count")
            failure_count = (
                raw_failure_count if isinstance(raw_failure_count, int) else 0
            )
            await _register_failure(subscription_id, failure_count)
            logger.exception(
                "[PUSH] unexpected error for subscription=%s", subscription_id
            )

    return sent_count


async def send_daily_reminders() -> dict[str, int]:
    result = await db_execute(
        lambda: (
            supabase.table("push_subscriptions")
            .select("user_id, last_sent_at")
            .eq("is_active", True)
            .execute()
        )
    )
    rows = [row for row in (result.data or []) if isinstance(row, dict)]

    threshold = datetime.now(timezone.utc) - timedelta(hours=20)
    latest_sent_by_user: dict[str, datetime | None] = {}
    for row in rows:
        user_id = str(row.get("user_id") or "")
        if not user_id:
            continue

        last_sent_raw = row.get("last_sent_at")
        parsed_last_sent: datetime | None = None
        if isinstance(last_sent_raw, str) and last_sent_raw:
            try:
                parsed_last_sent = datetime.fromisoformat(
                    last_sent_raw.replace("Z", "+00:00")
                )
            except ValueError:
                parsed_last_sent = None

        current = latest_sent_by_user.get(user_id)
        if current is None or (
            parsed_last_sent is not None and parsed_last_sent > current
        ):
            latest_sent_by_user[user_id] = parsed_last_sent

    eligible_users = [
        user_id
        for user_id, last_sent in latest_sent_by_user.items()
        if last_sent is None or last_sent < threshold
    ]

    sent_users = 0
    failed_users = 0
    sent_notifications = 0

    for user_id in eligible_users:
        sent_count = await send_push_to_user(
            user_id=user_id,
            title="오늘의 운세를 확인해보세요",
            body="지금 마이사주에서 오늘의 흐름과 행운 포인트를 확인할 수 있어요.",
            url="/",
        )
        if sent_count > 0:
            sent_users += 1
            sent_notifications += sent_count
        else:
            failed_users += 1

    return {
        "total_users": len(latest_sent_by_user),
        "eligible_users": len(eligible_users),
        "sent_users": sent_users,
        "failed_users": failed_users,
        "sent_notifications": sent_notifications,
        "skipped_users": max(len(latest_sent_by_user) - len(eligible_users), 0),
    }
