import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional

from ..db.supabase_client import supabase, db_execute
from .slack_service import slack_service
from .telegram_service import telegram_service

logger = logging.getLogger(__name__)
KST = timezone(timedelta(hours=9))


def _kst_day_bounds(target_date) -> tuple[str, str]:
    start_kst = datetime.combine(target_date, datetime.min.time(), tzinfo=KST)
    end_kst = start_kst + timedelta(days=1)
    return start_kst.astimezone(timezone.utc).isoformat(), end_kst.astimezone(
        timezone.utc
    ).isoformat()


class AlertService:
    _last_alerts: Dict[str, datetime] = {}

    # TODO OPS-8: Alert cooldowns are in-memory only, reset on restart.
    # TODO OPS-8: Consider persisting cooldown state to Redis or DB to prevent alert storms.
    # TODO OPS-9: Alert thresholds should be configurable via app_config table.
    # TODO OPS-9: Currently hardcoded-like behavior relies on DB reads with static defaults, no runtime fallback UI.
    COOLDOWN_MINUTES = 60

    async def _get_threshold(self, key: str, default: float) -> float:
        try:
            result = await db_execute(
                lambda: (
                    supabase.table("app_config")
                    .select("value")
                    .eq("key", key)
                    .single()
                    .execute()
                )
            )
            if result.data:
                return float(result.data["value"])
        except Exception:
            logger.exception("Failed to load alert threshold from app_config")
        return default

    def _can_alert(self, alert_type: str) -> bool:
        last = self._last_alerts.get(alert_type)
        if last is None:
            return True
        elapsed = (datetime.now(timezone.utc) - last).total_seconds() / 60
        return elapsed >= self.COOLDOWN_MINUTES

    def _mark_alerted(self, alert_type: str) -> None:
        self._last_alerts[alert_type] = datetime.now(timezone.utc)

    async def check_error_rate(self) -> Optional[Dict[str, Any]]:
        threshold = await self._get_threshold("alert_error_rate_threshold", 5.0)

        one_hour_ago = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()

        started_result = await db_execute(
            lambda: (
                supabase.table("analytics_events")
                .select("id", count="exact")
                .eq("event_type", "analysis_started")
                .gte("created_at", one_hour_ago)
                .execute()
            )
        )

        failed_result = await db_execute(
            lambda: (
                supabase.table("analytics_events")
                .select("id", count="exact")
                .eq("event_type", "analysis_failed")
                .gte("created_at", one_hour_ago)
                .execute()
            )
        )

        started = started_result.count or 0
        failed = failed_result.count or 0

        if started == 0:
            return None

        error_rate = (failed / started) * 100

        if error_rate > threshold and self._can_alert("error_rate"):
            self._mark_alerted("error_rate")
            severity = "critical" if error_rate > threshold * 2 else "warning"
            message = (
                f"현재 에러율: {error_rate:.1f}% (임계치: {threshold}%)\n"
                f"최근 1시간: {started}건 시작, {failed}건 실패"
            )
            await asyncio.gather(
                slack_service.send_alert("에러율 초과", message, severity=severity),
                telegram_service.send_alert("에러율 초과", message, severity=severity),
                return_exceptions=True,
            )
            return {"type": "error_rate", "current": error_rate, "threshold": threshold}

        return None

    async def check_payment_failures(self) -> Optional[Dict[str, Any]]:
        threshold = await self._get_threshold("alert_payment_failure_threshold", 3)

        result = await db_execute(
            lambda: (
                supabase.table("payments")
                .select("status")
                .order("created_at", desc=True)
                .limit(int(threshold) + 2)
                .execute()
            )
        )

        statuses = [p["status"] for p in (result.data or []) if p.get("status")]

        consecutive_fails = 0
        for status in statuses:
            if status == "failed":
                consecutive_fails += 1
            else:
                break

        if consecutive_fails >= threshold and self._can_alert("payment_failure"):
            self._mark_alerted("payment_failure")
            message = f"최근 {consecutive_fails}건 연속 결제 실패 (임계치: {int(threshold)}건)"
            await asyncio.gather(
                slack_service.send_alert(
                    "연속 결제 실패", message, severity="critical"
                ),
                telegram_service.send_alert(
                    "연속 결제 실패", message, severity="critical"
                ),
                return_exceptions=True,
            )
            return {
                "type": "payment_failure",
                "consecutive": consecutive_fails,
                "threshold": int(threshold),
            }

        return None

    async def check_refund_spike(self) -> Optional[Dict[str, Any]]:
        threshold = await self._get_threshold("alert_refund_spike_threshold", 200.0)

        today = datetime.now(KST).date()
        yesterday = today - timedelta(days=1)
        today_start, today_end = _kst_day_bounds(today)
        yesterday_start, yesterday_end = _kst_day_bounds(yesterday)

        today_result = await db_execute(
            lambda: (
                supabase.table("coin_transactions")
                .select("id", count="exact")
                .in_("type", ["refund", "admin_refund"])
                .gte("created_at", today_start)
                .lt("created_at", today_end)
                .execute()
            )
        )

        yesterday_result = await db_execute(
            lambda: (
                supabase.table("coin_transactions")
                .select("id", count="exact")
                .in_("type", ["refund", "admin_refund"])
                .gte("created_at", yesterday_start)
                .lt("created_at", yesterday_end)
                .execute()
            )
        )

        today_count = today_result.count or 0
        yesterday_count = yesterday_result.count or 0

        if yesterday_count == 0:
            return None

        spike_percent = (today_count / yesterday_count) * 100

        if spike_percent > threshold and self._can_alert("refund_spike"):
            self._mark_alerted("refund_spike")
            message = (
                f"오늘 환불: {today_count}건 (어제: {yesterday_count}건, {spike_percent:.0f}% 증가)\n"
                f"임계치: {threshold}%"
            )
            await asyncio.gather(
                slack_service.send_alert("환불 급증", message, severity="warning"),
                telegram_service.send_alert("환불 급증", message, severity="warning"),
                return_exceptions=True,
            )
            return {
                "type": "refund_spike",
                "today": today_count,
                "yesterday": yesterday_count,
                "percent": spike_percent,
            }

        return None

    async def check_all_thresholds(self) -> List[Dict[str, Any]]:
        results = []
        for checker in [
            self.check_error_rate,
            self.check_payment_failures,
            self.check_refund_spike,
        ]:
            try:
                result = await checker()
                if result:
                    results.append(result)
            except Exception:
                logger.exception("Alert check failed")
        return results

    async def send_daily_report(self) -> bool:
        today_kst = datetime.now(KST).date()
        yesterday = today_kst - timedelta(days=1)
        yesterday_start, yesterday_end = _kst_day_bounds(yesterday)

        try:
            import asyncio

            (
                new_users,
                total_users,
                total_readings,
                revenue,
                failed,
                refunds,
                analysis_started,
                analysis_failed,
                coin_spend,
                pending_feedbacks,
            ) = await asyncio.gather(
                # 신규 가입
                db_execute(
                    lambda: (
                        supabase.table("users")
                        .select("id", count="exact")
                        .gte("created_at", yesterday_start)
                        .lt("created_at", yesterday_end)
                        .execute()
                    )
                ),
                # 누적 사용자
                db_execute(
                    lambda: (
                        supabase.table("users").select("id", count="exact").execute()
                    )
                ),
                # 분석 완료
                db_execute(
                    lambda: (
                        supabase.table("user_readings")
                        .select("id", count="exact")
                        .gte("created_at", yesterday_start)
                        .lt("created_at", yesterday_end)
                        .execute()
                    )
                ),
                # 매출
                db_execute(
                    lambda: (
                        supabase.table("payments")
                        .select("amount")
                        .eq("status", "done")
                        .gte("created_at", yesterday_start)
                        .lt("created_at", yesterday_end)
                        .execute()
                    )
                ),
                # 결제 실패
                db_execute(
                    lambda: (
                        supabase.table("payments")
                        .select("id", count="exact")
                        .eq("status", "failed")
                        .gte("created_at", yesterday_start)
                        .lt("created_at", yesterday_end)
                        .execute()
                    )
                ),
                # 환불
                db_execute(
                    lambda: (
                        supabase.table("coin_transactions")
                        .select("id", count="exact")
                        .in_("type", ["refund", "admin_refund"])
                        .gte("created_at", yesterday_start)
                        .lt("created_at", yesterday_end)
                        .execute()
                    )
                ),
                # 분석 시작 (성공률 계산용)
                db_execute(
                    lambda: (
                        supabase.table("analytics_events")
                        .select("id", count="exact")
                        .eq("event_type", "analysis_started")
                        .gte("created_at", yesterday_start)
                        .lt("created_at", yesterday_end)
                        .execute()
                    )
                ),
                # 분석 실패 (성공률 계산용)
                db_execute(
                    lambda: (
                        supabase.table("analytics_events")
                        .select("id", count="exact")
                        .eq("event_type", "analysis_failed")
                        .gte("created_at", yesterday_start)
                        .lt("created_at", yesterday_end)
                        .execute()
                    )
                ),
                # 기능별 코인 소비
                db_execute(
                    lambda: (
                        supabase.table("coin_transactions")
                        .select("type, amount")
                        .eq("type", "spend")
                        .gte("created_at", yesterday_start)
                        .lt("created_at", yesterday_end)
                        .execute()
                    )
                ),
                # 미처리 피드백
                db_execute(
                    lambda: (
                        supabase.table("user_feedbacks")
                        .select("id", count="exact")
                        .eq("status", "pending")
                        .execute()
                    )
                ),
            )

            revenue_sum = sum(p.get("amount", 0) for p in (revenue.data or []))
            started_cnt = analysis_started.count or 0
            failed_cnt_analysis = analysis_failed.count or 0
            success_rate = (
                f"{((started_cnt - failed_cnt_analysis) / started_cnt * 100):.1f}%"
                if started_cnt > 0
                else "N/A"
            )

            coin_total = sum(abs(t.get("amount", 0)) for t in (coin_spend.data or []))
            coin_count = len(coin_spend.data or [])

            message = (
                f"📊 *일일 요약 리포트* ({yesterday.strftime('%Y-%m-%d')})\n\n"
                f"👤 신규 가입: *{new_users.count or 0}*명 (누적: {total_users.count or 0:,}명)\n"
                f"📖 분석: *{total_readings.count or 0}*건 (성공률: {success_rate})\n"
                f"💰 매출: *₩{revenue_sum:,}*\n"
                f"🪙 코인 소비: *{coin_total:,}*엽전 ({coin_count}건)\n"
                f"❌ 결제 실패: *{failed.count or 0}*건\n"
                f"↩️ 환불: *{refunds.count or 0}*건\n"
                f"📬 미처리 피드백: *{pending_feedbacks.count or 0}*건"
            )

            results = await asyncio.gather(
                slack_service.send_message(
                    title="📊 일일 요약 리포트",
                    text=message,
                    color="#36a64f",
                    fields=[
                        {"title": "신규 가입", "value": f"{new_users.count or 0}명"},
                        {
                            "title": "분석 완료",
                            "value": f"{total_readings.count or 0}건",
                        },
                        {"title": "매출", "value": f"₩{revenue_sum:,}"},
                        {"title": "결제 실패", "value": f"{failed.count or 0}건"},
                    ],
                ),
                telegram_service.send_message(message),
                return_exceptions=True,
            )
            return any(r is True for r in results if not isinstance(r, Exception))
        except Exception:
            logger.exception("Failed to generate daily report")
            return False


alert_service = AlertService()
