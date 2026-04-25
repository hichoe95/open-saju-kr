# pyright: reportMissingImports=false
"""
Analytics API - 이벤트 추적 및 통계 조회 엔드포인트
"""

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, ValidationError

from ..db.supabase_client import db_execute, supabase
from ..services.analytics_service import analytics
from .deps import get_current_user_id, get_optional_user_id, rate_limit_dependency
from .admin import require_admin

router = APIRouter(prefix="/analytics", tags=["analytics"])
logger = logging.getLogger(__name__)
ATTRIBUTION_FIELDS = (
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "referral_code",
)


class TrackEventRequest(BaseModel):
    event_type: str
    event_data: Optional[Dict[str, Any]] = None
    session_id: Optional[str] = None


class TrackShareRequest(BaseModel):
    share_id: str
    share_type: str
    card_theme: Optional[str] = None
    share_method: Optional[str] = None


class TrackTabRequest(BaseModel):
    reading_id: str
    tab_name: str


class TrackFeatureRequest(BaseModel):
    feature_name: str
    metadata: Optional[Dict[str, Any]] = None


class TrackFunnelStepRequest(BaseModel):
    session_id: str
    step: Literal[
        "input_started",
        "result_received",
        "tab_clicked",
        "profile_saved",
        "shared",
    ]
    step_data: Dict[str, Any] = Field(default_factory=dict)


class TrackTabEngagementRequest(BaseModel):
    tab_name: str
    dwell_ms: int
    reading_id: Optional[str] = None
    source_tab: Optional[str] = None


async def _parse_tab_engagement_payload(request: Request) -> TrackTabEngagementRequest:
    content_type = (
        (request.headers.get("content-type") or "").split(";")[0].strip().lower()
    )
    if content_type not in {"", "application/json", "text/plain"}:
        raise HTTPException(status_code=415, detail="지원하지 않는 Content-Type입니다")

    raw_body = await request.body()
    if not raw_body:
        raise HTTPException(status_code=400, detail="요청 본문이 비어 있습니다")

    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except UnicodeDecodeError as e:
        raise HTTPException(
            status_code=400, detail="본문 인코딩이 올바르지 않습니다"
        ) from e
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=400, detail="유효한 JSON 본문이 필요합니다"
        ) from e

    try:
        return TrackTabEngagementRequest.model_validate(payload)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=e.errors()) from e


def _normalize_attribution_value(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None

    trimmed = value.strip()
    return trimmed or None


def _extract_attribution_from_mapping(
    payload: Optional[Dict[str, Any]],
) -> Dict[str, str]:
    if not isinstance(payload, dict):
        return {}

    attribution: Dict[str, str] = {}
    for field in ATTRIBUTION_FIELDS:
        normalized_value = _normalize_attribution_value(payload.get(field))
        if normalized_value:
            attribution[field] = normalized_value

    return attribution


def _parse_date_boundary(value: str, *, is_end: bool) -> str:
    try:
        if "T" in value:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        else:
            parsed = datetime.fromisoformat(f"{value}T00:00:00")
            if is_end:
                parsed = parsed + timedelta(days=1) - timedelta(microseconds=1)

        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)

        return parsed.isoformat()
    except ValueError as exc:
        raise HTTPException(
            status_code=400, detail="날짜 형식이 올바르지 않습니다"
        ) from exc


async def _build_session_funnel_stats(
    days: int,
    start_iso: Optional[str],
    end_iso: Optional[str],
) -> Dict[str, Any]:
    safe_days = max(days, 1)
    steps = list(analytics.SESSION_FUNNEL_STEPS)

    since = (
        start_iso
        or (datetime.now(timezone.utc) - timedelta(days=safe_days)).isoformat()
    )
    until = end_iso
    effective_days = safe_days

    if start_iso and end_iso:
        try:
            start_dt = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
            end_dt = datetime.fromisoformat(end_iso.replace("Z", "+00:00"))
            span_days = int((end_dt - start_dt).total_seconds() // (24 * 60 * 60)) + 1
            effective_days = max(span_days, 1)
        except ValueError:
            effective_days = safe_days

    try:

        def build_query():
            query = (
                supabase.table("session_funnel_events")
                .select("session_id,step")
                .in_("step", steps)
                .gte("created_at", since)
            )
            if until:
                query = query.lte("created_at", until)
            return query.execute()

        result = await db_execute(build_query)

        rows = result.data if isinstance(result.data, list) else []
        step_sessions = {step: set() for step in steps}
        for row in rows:
            if not isinstance(row, dict):
                continue

            session_id = row.get("session_id")
            step = row.get("step")
            if not isinstance(session_id, str) or not isinstance(step, str):
                continue
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
            "days": effective_days,
            "steps": step_stats,
        }
    except Exception:
        logger.exception("Failed to get session funnel")
        return {
            "days": effective_days,
            "steps": [
                {
                    "step": step,
                    "count": 0,
                    "conversion_rate": 0.0,
                }
                for step in steps
            ],
        }


async def _build_tab_engagement_stats(
    days: int,
    start_iso: Optional[str],
    end_iso: Optional[str],
) -> Dict[str, Any]:
    safe_days = max(days, 1)
    since = (
        start_iso
        or (datetime.now(timezone.utc) - timedelta(days=safe_days)).isoformat()
    )
    until = end_iso
    effective_days = safe_days

    if start_iso and end_iso:
        try:
            start_dt = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
            end_dt = datetime.fromisoformat(end_iso.replace("Z", "+00:00"))
            span_days = int((end_dt - start_dt).total_seconds() // (24 * 60 * 60)) + 1
            effective_days = max(span_days, 1)
        except ValueError:
            effective_days = safe_days

    try:

        def build_query():
            query = (
                supabase.table("tab_engagement_events")
                .select("tab_name,dwell_ms,is_bounce")
                .gte("created_at", since)
            )
            if until:
                query = query.lte("created_at", until)
            return query.execute()

        result = await db_execute(build_query)
        rows = result.data if isinstance(result.data, list) else []
        by_tab: Dict[str, Dict[str, int]] = {}

        for row in rows:
            if not isinstance(row, dict):
                continue

            tab_name = row.get("tab_name")
            if not isinstance(tab_name, str) or not tab_name:
                tab_name = "unknown"

            dwell_raw = row.get("dwell_ms")
            if isinstance(dwell_raw, (int, float)):
                dwell_ms = int(dwell_raw)
            elif isinstance(dwell_raw, str):
                try:
                    dwell_ms = int(dwell_raw)
                except ValueError:
                    dwell_ms = 0
            else:
                dwell_ms = 0

            is_bounce = bool(row.get("is_bounce"))

            if tab_name not in by_tab:
                by_tab[tab_name] = {
                    "event_count": 0,
                    "dwell_sum": 0,
                    "bounce_count": 0,
                }

            by_tab[tab_name]["event_count"] += 1
            by_tab[tab_name]["dwell_sum"] += dwell_ms
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
            "period_days": effective_days,
            "total_events": len(rows),
            "by_tab": by_tab_stats,
        }
    except Exception:
        logger.exception("Failed to get tab engagement stats")
        return {
            "period_days": effective_days,
            "total_events": 0,
            "by_tab": {},
        }


@router.post("/track/event")
async def track_event(
    request: TrackEventRequest,
    user_id: Optional[str] = Depends(get_optional_user_id),
    _rate_limit: None = Depends(
        rate_limit_dependency(limit=60, window_seconds=60, scope="analytics_track")
    ),
):
    success = await analytics.track_event(
        event_type=request.event_type,
        event_data=request.event_data,
        user_id=user_id,
        session_id=request.session_id,
    )
    return {"success": success}


@router.post("/track/share")
async def track_share(
    http_request: Request,
    request: TrackShareRequest,
    user_id: str = Depends(get_current_user_id),
    _rate_limit: None = Depends(
        rate_limit_dependency(limit=30, window_seconds=60, scope="analytics_share")
    ),
):
    raw_payload = await http_request.json()
    attribution = _extract_attribution_from_mapping(raw_payload)

    success = await analytics.track_share_created(
        share_id=request.share_id,
        share_type=request.share_type,
        user_id=user_id,
        card_theme=request.card_theme,
        share_method=request.share_method,
        attribution=attribution,
    )
    return {"success": success}


@router.post("/track/share-viewed")
async def track_share_viewed(
    share_id: str,
    session_id: Optional[str] = None,
    utm_source: Optional[str] = None,
    utm_medium: Optional[str] = None,
    utm_campaign: Optional[str] = None,
    referral_code: Optional[str] = None,
    _rate_limit: None = Depends(
        rate_limit_dependency(
            limit=30, window_seconds=60, scope="analytics_share_viewed"
        )
    ),
):
    attribution = _extract_attribution_from_mapping(
        {
            "utm_source": utm_source,
            "utm_medium": utm_medium,
            "utm_campaign": utm_campaign,
            "referral_code": referral_code,
        }
    )
    success = await analytics.track_share_viewed(share_id, session_id, attribution)
    return {"success": success}


@router.post("/track/share-converted")
async def track_share_converted(
    share_id: str,
    utm_source: Optional[str] = None,
    utm_medium: Optional[str] = None,
    utm_campaign: Optional[str] = None,
    referral_code: Optional[str] = None,
    user_id: str = Depends(get_current_user_id),
    _rate_limit: None = Depends(
        rate_limit_dependency(
            limit=30, window_seconds=60, scope="analytics_share_converted"
        )
    ),
):
    attribution = _extract_attribution_from_mapping(
        {
            "utm_source": utm_source,
            "utm_medium": utm_medium,
            "utm_campaign": utm_campaign,
            "referral_code": referral_code,
        }
    )
    success = await analytics.track_share_converted(share_id, user_id, attribution)
    return {"success": success}


@router.post("/track/tab")
async def track_tab(
    http_request: Request,
    request: TrackTabRequest,
    user_id: Optional[str] = Depends(get_optional_user_id),
    _rate_limit: None = Depends(
        rate_limit_dependency(limit=60, window_seconds=60, scope="analytics_tab")
    ),
):
    raw_payload = await http_request.json()
    attribution = _extract_attribution_from_mapping(raw_payload)

    success = await analytics.track_tab_viewed(
        reading_id=request.reading_id,
        tab_name=request.tab_name,
        user_id=user_id,
        attribution=attribution,
    )
    return {"success": success}


@router.post("/track/feature")
async def track_feature(
    request: TrackFeatureRequest,
    user_id: Optional[str] = Depends(get_optional_user_id),
    _rate_limit: None = Depends(
        rate_limit_dependency(limit=60, window_seconds=60, scope="analytics_feature")
    ),
):
    success = await analytics.track_feature_used(
        feature_name=request.feature_name, user_id=user_id, metadata=request.metadata
    )
    return {"success": success}


@router.post("/track/funnel")
async def track_funnel_step(
    request: TrackFunnelStepRequest,
    user_id: Optional[str] = Depends(get_optional_user_id),
    _rate_limit: None = Depends(
        rate_limit_dependency(limit=60, window_seconds=60, scope="analytics_funnel")
    ),
):
    return await analytics.track_funnel_step(
        user_id=user_id,
        session_id=request.session_id,
        step=request.step,
        step_data=request.step_data,
    )


@router.post("/track/tab-engagement")
async def track_tab_engagement(
    request: Request,
    user_id: str = Depends(get_current_user_id),
    _rate_limit: None = Depends(
        rate_limit_dependency(
            limit=120, window_seconds=60, scope="analytics_tab_engagement"
        )
    ),
):
    payload = await _parse_tab_engagement_payload(request)
    result = await analytics.track_tab_engagement(
        user_id=user_id,
        tab_name=payload.tab_name,
        dwell_ms=payload.dwell_ms,
        reading_id=payload.reading_id,
        source_tab=payload.source_tab,
    )

    if not result.get("success"):
        raise HTTPException(
            status_code=500, detail="탭 체류시간 추적 중 오류가 발생했습니다"
        )
    return result


@router.get("/stats/shares")
async def get_share_stats(
    days: int = Query(default=30, ge=1, le=365), _admin_id: str = Depends(require_admin)
):
    return await analytics.get_share_stats(days)


@router.get("/stats/features")
async def get_feature_stats(
    days: int = Query(default=30, ge=1, le=365), _admin_id: str = Depends(require_admin)
):
    return await analytics.get_feature_usage_stats(days)


@router.get("/stats/tabs")
async def get_tab_stats(
    days: int = Query(default=30, ge=1, le=365), _admin_id: str = Depends(require_admin)
):
    return await analytics.get_tab_usage_stats(days)


@router.get("/stats/viral-funnel")
async def get_viral_funnel(
    days: int = Query(default=30, ge=1, le=365), _admin_id: str = Depends(require_admin)
):
    return await analytics.get_viral_funnel(days)


@router.get("/stats/session-funnel")
async def get_session_funnel(
    days: int = Query(default=7, ge=1, le=365),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    _admin_id: str = Depends(require_admin),
):
    if (start_date and not end_date) or (end_date and not start_date):
        raise HTTPException(
            status_code=400, detail="start_date와 end_date를 함께 제공해야 합니다"
        )

    start_iso = _parse_date_boundary(start_date, is_end=False) if start_date else None
    end_iso = _parse_date_boundary(end_date, is_end=True) if end_date else None
    if start_iso and end_iso:
        start_dt = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
        end_dt = datetime.fromisoformat(end_iso.replace("Z", "+00:00"))
        if start_dt > end_dt:
            raise HTTPException(
                status_code=400, detail="조회 시작일이 종료일보다 늦을 수 없습니다"
            )

    return await _build_session_funnel_stats(days, start_iso, end_iso)


@router.get("/stats/tab-engagement")
async def get_tab_engagement_stats(
    days: int = Query(default=7, ge=1, le=365),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    _admin_id: str = Depends(require_admin),
):
    if (start_date and not end_date) or (end_date and not start_date):
        raise HTTPException(
            status_code=400, detail="start_date와 end_date를 함께 제공해야 합니다"
        )

    start_iso = _parse_date_boundary(start_date, is_end=False) if start_date else None
    end_iso = _parse_date_boundary(end_date, is_end=True) if end_date else None
    if start_iso and end_iso:
        start_dt = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
        end_dt = datetime.fromisoformat(end_iso.replace("Z", "+00:00"))
        if start_dt > end_dt:
            raise HTTPException(
                status_code=400, detail="조회 시작일이 종료일보다 늦을 수 없습니다"
            )

    return await _build_tab_engagement_stats(days, start_iso, end_iso)
