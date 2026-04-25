"""
Analytics Service - 사용자 행동 추적 및 통계 서비스

이벤트 타입:
- share_created: 공유 링크 생성
- share_viewed: 공유 페이지 조회
- share_converted: 공유 → 가입 전환
- tab_viewed: 탭 조회
- feature_used: 기능 사용 (reading, compatibility, ai_chat 등)
"""

from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any
from uuid import uuid4
import logging

from ..db.supabase_client import supabase, db_execute

logger = logging.getLogger(__name__)


def _merge_event_data(
    event_data: Optional[Dict[str, Any]] = None,
    attribution: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    return {
        **(attribution or {}),
        **(event_data or {}),
    }


class AnalyticsService:
    """Analytics 이벤트 추적 서비스"""

    SESSION_FUNNEL_STEPS = (
        "input_started",
        "result_received",
        "tab_clicked",
        "profile_saved",
    )
    SESSION_FUNNEL_ALLOWED_STEPS = (*SESSION_FUNNEL_STEPS, "shared")

    # =========================================================================
    # 이벤트 추적 메서드
    # =========================================================================

    @staticmethod
    async def track_event(
        event_type: str,
        event_data: Optional[Dict[str, Any]] = None,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> bool:
        """범용 이벤트 추적"""
        try:
            data = {
                "id": str(uuid4()),
                "event_type": event_type,
                "event_data": event_data or {},
                "user_id": user_id,
                "session_id": session_id,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db_execute(
                lambda: supabase.table("analytics_events").insert(data).execute()
            )
            return True
        except Exception as e:
            logger.error(f"Failed to track event: {e}")
            return False

    @staticmethod
    async def aggregate_daily_metrics(
        target_date: Optional[str] = None,
    ) -> Dict[str, Any]:
        # TODO CONC-7: Concurrent aggregation calls can produce duplicate daily rows.
        # Consider: SELECT ... FOR UPDATE or advisory lock before aggregation.
        if target_date is None:
            target_date = (
                datetime.now(timezone.utc).date() - timedelta(days=1)
            ).isoformat()

        try:
            result = await db_execute(
                lambda: supabase.rpc(
                    "aggregate_daily_analytics", {"p_date": target_date}
                ).execute()
            )
            return {"status": "success", "date": target_date, "result": result.data}
        except Exception as e:
            logger.exception(f"Failed to aggregate daily metrics for {target_date}")
            return {"status": "error", "date": target_date, "error": str(e)}

    @staticmethod
    async def track_share_created(
        share_id: str,
        share_type: str,  # 'reading' or 'compatibility'
        user_id: str,
        card_theme: Optional[str] = None,
        share_method: Optional[str] = None,  # 'link', 'kakao', 'image'
        attribution: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """공유 생성 이벤트 추적"""
        try:
            # analytics_events에 기록
            await AnalyticsService.track_event(
                event_type="share_created",
                event_data=_merge_event_data(
                    {
                        "share_id": share_id,
                        "share_type": share_type,
                        "card_theme": card_theme,
                        "share_method": share_method,
                    },
                    attribution,
                ),
                user_id=user_id,
            )

            # share_analytics 테이블에도 기록
            data = {
                "id": str(uuid4()),
                "share_id": share_id,
                "share_type": share_type,
                "card_theme": card_theme,
                "share_method": share_method,
                "creator_user_id": user_id,
                "viewed_count": 0,
                "converted_count": 0,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db_execute(
                lambda: supabase.table("share_analytics").insert(data).execute()
            )
            return True
        except Exception as e:
            logger.error(f"Failed to track share created: {e}")
            return False

    @staticmethod
    async def track_share_viewed(
        share_id: str,
        viewer_session_id: Optional[str] = None,
        attribution: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """공유 페이지 조회 이벤트 추적"""
        try:
            # share_analytics의 viewed_count 증가
            await db_execute(
                lambda: supabase.rpc(
                    "increment_share_view_count", {"p_share_id": share_id}
                ).execute()
            )

            # 상세 이벤트도 기록
            await AnalyticsService.track_event(
                event_type="share_viewed",
                event_data=_merge_event_data({"share_id": share_id}, attribution),
                session_id=viewer_session_id,
            )
            return True
        except Exception as e:
            logger.error(f"Failed to track share viewed: {e}")
            return False

    @staticmethod
    async def track_share_converted(
        share_id: str,
        new_user_id: str,
        attribution: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """공유 → 가입 전환 이벤트 추적"""
        try:
            await db_execute(
                lambda: supabase.rpc(
                    "increment_share_converted_count", {"p_share_id": share_id}
                ).execute()
            )

            # 이벤트 기록
            await AnalyticsService.track_event(
                event_type="share_converted",
                event_data=_merge_event_data({"share_id": share_id}, attribution),
                user_id=new_user_id,
            )
            return True
        except Exception as e:
            logger.error(f"Failed to track share converted: {e}")
            return False

    @staticmethod
    async def track_tab_viewed(
        reading_id: str,
        tab_name: str,
        user_id: Optional[str] = None,
        attribution: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """탭 조회 이벤트 추적"""
        try:
            await AnalyticsService.track_event(
                event_type="tab_viewed",
                event_data=_merge_event_data(
                    {"reading_id": reading_id, "tab_name": tab_name}, attribution
                ),
                user_id=user_id,
            )

            # 일별 집계 업데이트
            await AnalyticsService._update_daily_feature_usage(
                f"tab_{tab_name}", user_id
            )
            return True
        except Exception as e:
            logger.error(f"Failed to track tab viewed: {e}")
            return False

    @staticmethod
    async def track_tab_engagement(
        user_id: str,
        tab_name: str,
        dwell_ms: int,
        reading_id: Optional[str] = None,
        source_tab: Optional[str] = None,
    ) -> Dict[str, Any]:
        capped_dwell = min(max(dwell_ms, 0), 600000)
        payload = {
            "id": str(uuid4()),
            "user_id": user_id,
            "reading_id": reading_id,
            "tab_name": tab_name,
            "dwell_ms": capped_dwell,
            "source_tab": source_tab,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        try:
            try:
                await db_execute(
                    lambda: (
                        supabase.table("tab_engagement_events")
                        .insert(payload)
                        .execute()
                    )
                )
            except Exception as insert_error:
                if "tab_engagement_events_user_id_fkey" not in str(insert_error):
                    raise
                payload["user_id"] = None
                await db_execute(
                    lambda: (
                        supabase.table("tab_engagement_events")
                        .insert(payload)
                        .execute()
                    )
                )

            return {
                "success": True,
                "tab_name": tab_name,
                "dwell_ms": capped_dwell,
                "is_bounce": capped_dwell < 3000,
            }
        except Exception:
            logger.exception("Failed to track tab engagement")
            return {"success": False}

    @staticmethod
    async def track_funnel_step(
        user_id: Optional[str],
        session_id: str,
        step: str,
        step_data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        if not session_id:
            return {
                "success": False,
                "error": "session_id is required",
            }

        if step not in AnalyticsService.SESSION_FUNNEL_ALLOWED_STEPS:
            return {
                "success": False,
                "error": "invalid funnel step",
            }

        payload = {
            "id": str(uuid4()),
            "user_id": user_id,
            "session_id": session_id,
            "step": step,
            "step_data": step_data or {},
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        try:
            await db_execute(
                lambda: (
                    supabase.table("session_funnel_events").insert(payload).execute()
                )
            )
            return {
                "success": True,
                "session_id": session_id,
                "step": step,
            }
        except Exception:
            logger.exception("Failed to track funnel step")
            return {"success": False, "error": "failed to insert funnel event"}

    @staticmethod
    async def track_feature_used(
        feature_name: str,
        user_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """기능 사용 이벤트 추적"""
        try:
            await AnalyticsService.track_event(
                event_type="feature_used",
                event_data={"feature_name": feature_name, **(metadata or {})},
                user_id=user_id,
            )

            # 일별 집계 업데이트
            await AnalyticsService._update_daily_feature_usage(feature_name, user_id)
            return True
        except Exception as e:
            logger.error(f"Failed to track feature used: {e}")
            return False

    @staticmethod
    async def track_analysis_event(
        feature_type: str,
        status: str,
        user_id: Optional[str] = None,
        processing_time_ms: Optional[int] = None,
        error_message: Optional[str] = None,
        provider: Optional[str] = None,
        model: Optional[str] = None,
        token_count: Optional[int] = None,
    ) -> bool:
        try:
            event_data = {
                "feature_type": feature_type,
                "processing_time_ms": processing_time_ms,
                "error_message": error_message,
            }

            if provider:
                event_data["provider"] = provider
            if model:
                event_data["model"] = model
            if token_count is not None:
                event_data["total_tokens"] = token_count

            try:
                tracked = await AnalyticsService.track_event(
                    event_type=f"analysis_{status}",
                    event_data=event_data,
                    user_id=user_id,
                )
                if not tracked:
                    logger.error(
                        "[ANALYTICS] track_analysis_event insert returned False: feature=%s status=%s user_id=%s",
                        feature_type,
                        status,
                        user_id,
                    )
            except Exception as insert_error:
                logger.error(
                    "[ANALYTICS] track_analysis_event insert failed: feature=%s status=%s user_id=%s error=%s",
                    feature_type,
                    status,
                    user_id,
                    insert_error,
                )
                return False

            if status == "completed":
                await AnalyticsService.track_feature_used(feature_type, user_id)
            return True
        except Exception as e:
            logger.exception(f"Failed to track analysis event: {e}")
            return False

    @staticmethod
    async def _update_daily_feature_usage(
        feature_name: str, user_id: Optional[str]
    ) -> None:
        """일별 기능 사용량 집계 업데이트"""
        try:
            today = datetime.now(timezone.utc).date().isoformat()

            # 기존 레코드 확인
            result = await db_execute(
                lambda: (
                    supabase.table("feature_usage_daily")
                    .select("*")
                    .eq("date", today)
                    .eq("feature_name", feature_name)
                    .execute()
                )
            )

            if result.data:
                # 기존 레코드 업데이트
                record = result.data[0]
                update_data = {"usage_count": record["usage_count"] + 1}

                await db_execute(
                    lambda: (
                        supabase.table("feature_usage_daily")
                        .update(update_data)
                        .eq("id", record["id"])
                        .execute()
                    )
                )
            else:
                # 새 레코드 생성
                await db_execute(
                    lambda: (
                        supabase.table("feature_usage_daily")
                        .insert(
                            {
                                "id": str(uuid4()),
                                "date": today,
                                "feature_name": feature_name,
                                "usage_count": 1,
                                "unique_users": 1 if user_id else 0,
                            }
                        )
                        .execute()
                    )
                )
        except Exception as e:
            logger.error(f"Failed to update daily feature usage: {e}")

    # =========================================================================
    # 통계 조회 메서드
    # =========================================================================

    @staticmethod
    async def get_share_stats(days: int = 30) -> Dict[str, Any]:
        """공유 통계 조회"""
        try:
            since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

            result = await db_execute(
                lambda: (
                    supabase.table("share_analytics")
                    .select("*")
                    .gte("created_at", since)
                    .execute()
                )
            )

            shares = result.data or []

            # 집계
            total_shares = len(shares)
            total_views = sum(s.get("viewed_count", 0) for s in shares)
            total_conversions = sum(s.get("converted_count", 0) for s in shares)

            by_type = {}
            by_method = {}

            for s in shares:
                share_type = s.get("share_type", "unknown")
                by_type[share_type] = by_type.get(share_type, 0) + 1

                share_method = s.get("share_method", "unknown")
                by_method[share_method] = by_method.get(share_method, 0) + 1

            conversion_rate = (
                (total_conversions / total_views * 100) if total_views > 0 else 0
            )

            return {
                "total_shares": total_shares,
                "total_views": total_views,
                "total_conversions": total_conversions,
                "conversion_rate": round(conversion_rate, 2),
                "by_type": by_type,
                "by_method": by_method,
            }
        except Exception as e:
            logger.error(f"Failed to get share stats: {e}")
            return {
                "total_shares": 0,
                "total_views": 0,
                "total_conversions": 0,
                "conversion_rate": 0,
                "by_type": {},
                "by_method": {},
            }

    @staticmethod
    async def get_feature_usage_stats(days: int = 30) -> Dict[str, Any]:
        """기능 사용 통계 조회"""
        try:
            since = (
                (datetime.now(timezone.utc) - timedelta(days=days)).date().isoformat()
            )

            result = await db_execute(
                lambda: (
                    supabase.table("feature_usage_daily")
                    .select("*")
                    .gte("date", since)
                    .execute()
                )
            )

            records = result.data or []

            # 기능별 집계
            by_feature = {}
            for r in records:
                feature = r.get("feature_name", "unknown")
                if feature not in by_feature:
                    by_feature[feature] = {"count": 0, "unique_users": 0}
                by_feature[feature]["count"] += r.get("usage_count", 0)
                by_feature[feature]["unique_users"] += r.get("unique_users", 0)

            return {"period_days": days, "by_feature": by_feature}
        except Exception as e:
            logger.error(f"Failed to get feature usage stats: {e}")
            return {"period_days": days, "by_feature": {}}

    @staticmethod
    async def get_tab_usage_stats(days: int = 30) -> Dict[str, Any]:
        """탭 사용 통계 조회"""
        try:
            since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

            result = await db_execute(
                lambda: (
                    supabase.table("analytics_events")
                    .select("event_data")
                    .eq("event_type", "tab_viewed")
                    .gte("created_at", since)
                    .execute()
                )
            )

            events = result.data or []

            # 탭별 집계
            by_tab = {}
            for e in events:
                tab_name = e.get("event_data", {}).get("tab_name", "unknown")
                by_tab[tab_name] = by_tab.get(tab_name, 0) + 1

            return {"period_days": days, "by_tab": by_tab}
        except Exception as e:
            logger.error(f"Failed to get tab usage stats: {e}")
            return {"period_days": days, "by_tab": {}}

    @staticmethod
    async def get_tab_engagement_stats(days: int = 7) -> Dict[str, Any]:
        safe_days = max(days, 1)
        try:
            since = (datetime.now(timezone.utc) - timedelta(days=safe_days)).isoformat()
            result = await db_execute(
                lambda: (
                    supabase.table("tab_engagement_events")
                    .select("tab_name,dwell_ms,is_bounce")
                    .gte("created_at", since)
                    .execute()
                )
            )

            events = result.data or []
            by_tab: Dict[str, Dict[str, int]] = {}

            for event in events:
                tab_name = event.get("tab_name") or "unknown"
                dwell = int(event.get("dwell_ms") or 0)
                is_bounce = bool(event.get("is_bounce"))

                if tab_name not in by_tab:
                    by_tab[tab_name] = {
                        "event_count": 0,
                        "dwell_sum": 0,
                        "bounce_count": 0,
                    }

                by_tab[tab_name]["event_count"] += 1
                by_tab[tab_name]["dwell_sum"] += dwell
                if is_bounce:
                    by_tab[tab_name]["bounce_count"] += 1

            by_tab_stats: Dict[str, Dict[str, Any]] = {}
            for tab_name, stats in by_tab.items():
                event_count = stats["event_count"]
                avg_dwell_ms = stats["dwell_sum"] / event_count if event_count else 0
                bounce_rate = stats["bounce_count"] / event_count if event_count else 0
                by_tab_stats[tab_name] = {
                    "avg_dwell_ms": round(avg_dwell_ms, 2),
                    "bounce_rate": round(bounce_rate, 4),
                    "event_count": event_count,
                    "bounce_count": stats["bounce_count"],
                }

            return {
                "period_days": safe_days,
                "total_events": len(events),
                "by_tab": by_tab_stats,
            }
        except Exception:
            logger.exception("Failed to get tab engagement stats")
            return {
                "period_days": safe_days,
                "total_events": 0,
                "by_tab": {},
            }

    @staticmethod
    async def get_viral_funnel(days: int = 30) -> Dict[str, Any]:
        """바이럴 퍼널 통계"""
        try:
            since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
            share_stats = await AnalyticsService.get_share_stats(days)

            shares_created = share_stats["total_shares"]
            shares_viewed = share_stats["total_views"]
            signups_from_share = share_stats["total_conversions"]

            try:
                converted_users_result = await db_execute(
                    lambda: (
                        supabase.table("analytics_events")
                        .select("user_id")
                        .eq("event_type", "share_converted")
                        .gte("created_at", since)
                        .execute()
                    )
                )
                converted_user_ids = list(
                    set(
                        e["user_id"]
                        for e in (converted_users_result.data or [])
                        if e.get("user_id")
                    )
                )

                if converted_user_ids:
                    reshare_result = await db_execute(
                        lambda: (
                            supabase.table("analytics_events")
                            .select("id", count="exact")
                            .eq("event_type", "share_created")
                            .in_("user_id", converted_user_ids)
                            .gte("created_at", since)
                            .execute()
                        )
                    )
                    reshares = reshare_result.count or 0
                else:
                    reshares = 0
            except Exception:
                reshares = 0

            return {
                "shares_created": shares_created,
                "shares_viewed": shares_viewed,
                "signups_from_share": signups_from_share,
                "reshares": reshares,
                "funnel_rates": {
                    "view_rate": round(shares_viewed / shares_created, 2)
                    if shares_created > 0
                    else 0,
                    "conversion_rate": share_stats["conversion_rate"],
                    "reshare_rate": round(reshares / signups_from_share * 100, 2)
                    if signups_from_share > 0
                    else 0,
                },
            }
        except Exception as e:
            logger.error(f"Failed to get viral funnel: {e}")
            return {
                "shares_created": 0,
                "shares_viewed": 0,
                "signups_from_share": 0,
                "reshares": 0,
                "funnel_rates": {},
            }

    @staticmethod
    async def get_session_funnel(days: int = 7) -> Dict[str, Any]:
        safe_days = max(days, 1)
        steps = list(AnalyticsService.SESSION_FUNNEL_STEPS)

        try:
            since = (datetime.now(timezone.utc) - timedelta(days=safe_days)).isoformat()
            result = await db_execute(
                lambda: (
                    supabase.table("session_funnel_events")
                    .select("session_id,step")
                    .in_("step", steps)
                    .gte("created_at", since)
                    .execute()
                )
            )

            step_sessions = {step: set() for step in steps}
            for row in result.data or []:
                session_id = row.get("session_id")
                step = row.get("step")
                if not session_id or step not in step_sessions:
                    continue
                step_sessions[step].add(session_id)

            step_stats: list[Dict[str, Any]] = []
            eligible_sessions = set(step_sessions[steps[0]])

            first_count = len(eligible_sessions)
            step_stats.append(
                {
                    "step": steps[0],
                    "count": first_count,
                    "conversion_rate": 100.0 if first_count > 0 else 0.0,
                }
            )

            for step in steps[1:]:
                prev_count = len(eligible_sessions)
                eligible_sessions = eligible_sessions.intersection(step_sessions[step])
                count = len(eligible_sessions)
                conversion_rate = (count / prev_count * 100) if prev_count > 0 else 0.0
                step_stats.append(
                    {
                        "step": step,
                        "count": count,
                        "conversion_rate": round(conversion_rate, 2),
                    }
                )

            return {
                "days": safe_days,
                "steps": step_stats,
            }
        except Exception:
            logger.exception("Failed to get session funnel")
            return {
                "days": safe_days,
                "steps": [
                    {
                        "step": step,
                        "count": 0,
                        "conversion_rate": 0.0,
                    }
                    for step in steps
                ],
            }


# 싱글톤 인스턴스
analytics = AnalyticsService()
