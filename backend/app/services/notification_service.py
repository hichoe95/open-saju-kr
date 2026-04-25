import asyncio
import logging
from datetime import datetime, timezone, timedelta

from .telegram_service import telegram_service, escape_markdown
from ..db.supabase_client import supabase, db_execute

logger = logging.getLogger(__name__)
_DEDUP_ALERT_WINDOW_SECONDS = 300


def _fire_and_forget(coro) -> None:
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(coro)
    except RuntimeError:
        logger.debug("[NOTIFY] No running event loop, skipping notification")


class NotificationService:
    def __init__(self) -> None:
        self._recent_ops_alerts: dict[str, datetime] = {}

    def _should_send_ops_alert(self, alert_key: str) -> bool:
        now = datetime.now(timezone.utc)
        last_sent = self._recent_ops_alerts.get(alert_key)
        if last_sent is not None:
            elapsed = (now - last_sent).total_seconds()
            if elapsed < _DEDUP_ALERT_WINDOW_SECONDS:
                return False
        self._recent_ops_alerts[alert_key] = now
        return True

    def _send_ops_alert(
        self, alert_key: str, title: str, body: str, severity: str
    ) -> None:
        if not self._should_send_ops_alert(alert_key):
            return
        _fire_and_forget(telegram_service.send_alert(title, body, severity=severity))

    # ── 결제 ──

    async def _get_today_revenue(self) -> tuple[int, int]:
        today_start = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        kst_offset = timedelta(hours=9)
        kst_now = datetime.now(timezone.utc) + kst_offset
        kst_today_start = (
            kst_now.replace(hour=0, minute=0, second=0, microsecond=0) - kst_offset
        )

        result = await db_execute(
            lambda: (
                supabase.table("payments")
                .select("amount")
                .eq("status", "done")
                .gte("created_at", kst_today_start.isoformat())
                .execute()
            )
        )
        rows = result.data or []
        amount_rows = [row for row in rows if isinstance(row, dict)]
        total = 0
        for row in amount_rows:
            amount = row.get("amount")
            if isinstance(amount, int):
                total += amount
        return total, len(amount_rows)

    async def _send_payment_success(
        self, amount: int, order_id: str, coin_amount: int
    ) -> None:
        try:
            today_revenue, today_count = await self._get_today_revenue()
            text = (
                f"💰 *결제 성공*\n"
                f"금액: ₩{amount:,} / {coin_amount}엽전\n"
                f"주문: {escape_markdown(order_id)}\n"
                f"──────────\n"
                f"📊 오늘 매출: ₩{today_revenue:,} ({today_count}건)"
            )
            await telegram_service.send_message(text)
        except Exception:
            logger.warning("[NOTIFY] Payment success notification failed")

    def notify_payment_success(
        self, amount: int, order_id: str, coin_amount: int
    ) -> None:
        _fire_and_forget(self._send_payment_success(amount, order_id, coin_amount))

    def notify_payment_canceled(self, order_id: str, amount: int) -> None:
        text = f"⚠️ *결제 취소*\n금액: ₩{amount:,}\n주문: {escape_markdown(order_id)}"
        _fire_and_forget(telegram_service.send_message(text))

    def notify_payment_mismatch(
        self,
        order_id: str,
        mismatch_type: str,
        details: str,
        user_id: str = "",
    ) -> None:
        user_line = (
            f"\n사용자: {escape_markdown(user_id[:8] + '...')}" if user_id else ""
        )
        body = (
            f"유형: {escape_markdown(mismatch_type)}\n"
            f"주문: {escape_markdown(order_id)}"
            f"{user_line}\n"
            f"상세: {escape_markdown(details[:400])}"
        )
        self._send_ops_alert(
            alert_key=f"payment_mismatch:{mismatch_type}:{order_id}",
            title="결제 상태 불일치",
            body=body,
            severity="critical",
        )

    def notify_webhook_processing_failure(
        self,
        event_type: str,
        order_id: str,
        error: str,
    ) -> None:
        body = (
            f"이벤트: {escape_markdown(event_type)}\n"
            f"주문: {escape_markdown(order_id or 'unknown')}\n"
            f"오류: {escape_markdown(error[:400])}"
        )
        self._send_ops_alert(
            alert_key=f"webhook_failure:{event_type}:{order_id or 'unknown'}",
            title="웹훅 처리 실패",
            body=body,
            severity="critical",
        )

    def notify_paid_feature_refund_issue(
        self,
        feature_key: str,
        user_id: str,
        transaction_id: str,
        reason: str,
        issue_type: str,
        error: str = "",
    ) -> None:
        body = (
            f"기능: {escape_markdown(feature_key)}\n"
            f"사용자: {escape_markdown(user_id[:8] + '...')}\n"
            f"거래: {escape_markdown(transaction_id or 'unknown')}\n"
            f"사유: {escape_markdown(reason[:200])}"
        )
        if error:
            body += f"\n상세: {escape_markdown(error[:300])}"
        self._send_ops_alert(
            alert_key=f"paid_feature_refund_issue:{issue_type}:{feature_key}:{transaction_id or user_id}",
            title="유료 AI 환불 이슈",
            body=body,
            severity="critical",
        )

    # ── 피드백/문의 ──

    def notify_feedback_submitted(
        self, feedback_id: str, category: str, content: str
    ) -> None:
        category_label = {
            "bug": "🐛 버그 신고",
            "feature": "💡 개선 제안",
            "payment": "💳 결제 문의",
            "account": "👤 계정 문의",
            "inquiry": "❓ 일반 문의",
            "other": "📝 기타",
        }.get(category, f"📝 {category}")

        preview = content[:100] + ("..." if len(content) > 100 else "")
        text = (
            f"📬 *새 피드백 접수*\n"
            f"유형: {escape_markdown(category_label)}\n"
            f"내용: {escape_markdown(preview)}\n"
            f"ID: {escape_markdown(feedback_id)}"
        )
        _fire_and_forget(telegram_service.send_message(text))

    # ── 관리자 액션 ──

    def notify_admin_refund(
        self, user_id: str, amount: int, reason: str, admin_id: str = ""
    ) -> None:
        text = (
            f"↩️ *관리자 환불*\n"
            f"대상: {escape_markdown(user_id[:8] + '...')}\n"
            f"금액: {amount}엽전\n"
            f"사유: {escape_markdown(reason)}"
        )
        if admin_id:
            text += f"\n처리자: {escape_markdown(admin_id[:8] + '...')}"
        _fire_and_forget(telegram_service.send_message(text))

    def notify_admin_balance_adjust(
        self,
        user_id: str,
        amount: int,
        reason: str,
        prev: int,
        new: int,
        admin_id: str = "",
    ) -> None:
        direction = "지급" if amount > 0 else "차감"
        text = (
            f"🔧 *잔액 {direction}*\n"
            f"대상: {escape_markdown(user_id[:8] + '...')}\n"
            f"변경: {prev} → {new} ({amount:+d})\n"
            f"사유: {escape_markdown(reason)}"
        )
        if admin_id:
            text += f"\n처리자: {escape_markdown(admin_id[:8] + '...')}"
        _fire_and_forget(telegram_service.send_message(text))

    def notify_user_banned(self, user_id: str, reason: str, admin_id: str = "") -> None:
        text = f"🚫 *사용자 정지*\n대상: {escape_markdown(user_id[:8] + '...')}\n사유: {escape_markdown(reason)}"
        if admin_id:
            text += f"\n처리자: {escape_markdown(admin_id[:8] + '...')}"
        _fire_and_forget(telegram_service.send_message(text))

    def notify_config_changed(self, key: str, admin_id: str, value: str = "") -> None:
        text = f"⚙️ *설정 변경*\n항목: {escape_markdown(key)}\n관리자: {escape_markdown(admin_id[:8] + '...')}"
        if value and key not in ("slack_webhook_url",):
            text += f"\n값: {escape_markdown(str(value)[:50])}"
        _fire_and_forget(telegram_service.send_message(text))

    # ── 가입자 마일스톤 ──

    async def _check_signup_milestone(self) -> None:
        try:
            result = await db_execute(
                lambda: supabase.table("users").select("id").execute()
            )
            user_rows = result.data or []
            total = len([row for row in user_rows if isinstance(row, dict)])
            is_milestone = (
                (total <= 500 and total % 50 == 0)
                or (500 < total <= 2000 and total % 100 == 0)
                or (total > 2000 and total % 500 == 0)
            )
            if is_milestone and total > 0:
                text = f"🎉 *가입자 마일스톤!*\n전체 회원: *{total:,}*명 돌파!"
                await telegram_service.send_message(text)
        except Exception:
            logger.warning("[NOTIFY] Milestone check failed")

    def check_signup_milestone(self) -> None:
        _fire_and_forget(self._check_signup_milestone())

    # ── 서버 이벤트 ──

    async def notify_server_start(self, env: str) -> None:
        try:
            await telegram_service.send_message(f"🚀 *서버 시작*\n환경: {env}")
        except Exception:
            logger.warning("[NOTIFY] Server start notification failed")


notifier = NotificationService()
