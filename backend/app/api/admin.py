from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, Any, Literal, TypeVar, List, Dict
from datetime import datetime, timedelta, timezone
import asyncio
import json

# pyright: reportMissingImports=false
import logging
import uuid
from ..db.supabase_client import supabase, db_execute
from .deps import get_current_user_id, rate_limit_dependency
from ..core.security import crypto_manager
from ..config import get_settings
from ..config_values import (
    is_non_negative_integer_config_key,
    is_supported_model_id,
    is_supported_persona,
    is_supported_reasoning_effort,
)

router = APIRouter(prefix="/admin", tags=["admin"])
logger = logging.getLogger(__name__)
settings = get_settings()

# TODO PRIV-3: Migration 20260125100000 auto-grants admin to first user by created_at.
# This should be changed to explicit admin assignment (e.g., by UUID or specific user).
# An attacker who creates an account first gets admin access.
T = TypeVar("T")

MANAGED_ADMIN_CONFIG_DEFAULTS: dict[str, tuple[Any, str]] = {
    "default_persona": ("classic", "기본 페르소나 (mz/classic/warm/witty)"),
    "model_main": ("gpt-5.4-nano", "결과보기(메인) 모델"),
    "model_compatibility": ("gpt-5.4-nano", "궁합 분석 모델"),
    "model_decision": ("gpt-5.4-nano", "AI에게 질문하기 모델"),
    "model_flow": ("gpt-5.4-nano", "운세 흐름 모델"),
    "model_daily_fortune": ("gpt-5.4-nano", "오늘의 운세 모델"),
    "model_seun": ("gpt-5.4-nano", "세운 분석 모델"),
    "reasoning_effort_main": ("medium", "결과보기(메인) 추론 강도"),
    "reasoning_effort_compatibility": ("medium", "궁합 분석 추론 강도"),
    "reasoning_effort_decision": ("low", "AI에게 질문하기 추론 강도"),
    "reasoning_effort_flow": ("low", "운세 흐름 추론 강도"),
    "reasoning_effort_daily_fortune": ("low", "오늘의 운세 추론 강도"),
    "reasoning_effort_seun": ("low", "세운 분석 추론 강도"),
    "maintenance_mode": ("false", "점검 모드 활성화"),
    "announcement": ("", "공지사항 메시지"),
    "review_login_enabled": ("false", "심사용 로그인 활성화 여부"),
    "review_login_code": ("", "심사용 로그인 코드"),
}

REMOVED_MONETIZATION_CONFIG_KEYS = {
    "tab_love",
    "tab_money",
    "tab_compatibility",
    "tab_career",
    "tab_flow_calendar",
}


async def _is_admin_user(user_id: str) -> bool:
    try:
        result = await db_execute(
            lambda: (
                supabase.table("users")
                .select("is_admin")
                .eq("id", user_id)
                .limit(1)
                .execute()
            )
        )
    except Exception as e:
        logger.error("[ADMIN] Failed to load admin status for %s: %s", user_id, e)
        raise HTTPException(
            status_code=500, detail="관리자 권한 확인 중 오류가 발생했습니다"
        )

    rows = result.data if isinstance(result.data, list) else []
    row = rows[0] if rows else None
    return bool(isinstance(row, dict) and row.get("is_admin") is True)


async def sync_admin_users_from_env() -> None:
    raw_ids = [uid.strip() for uid in settings.admin_user_ids.split(",") if uid.strip()]
    if not raw_ids:
        logger.info("[ADMIN] No env-based admin bootstrap IDs configured")
        return

    try:
        await db_execute(
            lambda: (
                supabase.table("users")
                .update({"is_admin": False})
                .eq("is_admin", True)
                .execute()
            )
        )
        await db_execute(
            lambda: (
                supabase.table("users")
                .update({"is_admin": True})
                .in_("id", raw_ids)
                .execute()
            )
        )
        logger.info(
            "[ADMIN] Synced %s admin bootstrap IDs into users.is_admin", len(raw_ids)
        )
    except Exception as e:
        logger.error("[ADMIN] Failed to sync env admin bootstrap IDs: %s", e)
        raise


def _extract_nested_value(data: Any, key: str, default: T) -> T:
    if isinstance(data, list) and len(data) > 0:
        return data[0].get(key, default)
    elif isinstance(data, dict):
        return data.get(key, default)
    return default


def _safe_parse_config_value(
    value: Any, default: Any, target_type: type = float
) -> Any:
    if value is None:
        return target_type(default)
    if isinstance(value, (int, float)):
        return target_type(value)
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return target_type(parsed)
        except (json.JSONDecodeError, ValueError, TypeError):
            pass
        try:
            return target_type(value)
        except (ValueError, TypeError):
            return target_type(default)
    return target_type(default)


def _parse_secret_string_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return ""
        try:
            parsed = json.loads(stripped)
        except (json.JSONDecodeError, TypeError):
            parsed = stripped
        return parsed.strip() if isinstance(parsed, str) else ""
    return ""


def _mask_webhook_url(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 12:
        return "*" * len(value)
    return f"{value[:8]}...{value[-4:]}"


def _validate_alert_config_value(key: str, value: Any) -> Any:
    if key == "slack_webhook_url":
        parsed = _parse_secret_string_value(value)
        if not parsed:
            return ""
        if not parsed.startswith("https://hooks.slack.com/services/"):
            raise HTTPException(
                status_code=400,
                detail="Slack Webhook URL 형식이 올바르지 않습니다",
            )
        return parsed

    if key == "alert_payment_failure_threshold":
        parsed = _parse_non_negative_int_config(key, value)
        if parsed <= 0:
            raise HTTPException(
                status_code=400,
                detail="연속 결제 실패 임계치는 1 이상의 정수여야 합니다",
            )
        return parsed

    if key in {"alert_error_rate_threshold", "alert_refund_spike_threshold"}:
        parsed = _coerce_config_value(value)
        if parsed is None or isinstance(parsed, bool):
            raise HTTPException(
                status_code=400, detail=f"설정 '{key}'는 숫자여야 합니다"
            )
        try:
            numeric = float(parsed)
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=400,
                detail=f"설정 '{key}'는 숫자여야 합니다",
            ) from exc
        if numeric < 0:
            raise HTTPException(
                status_code=400,
                detail=f"설정 '{key}'는 0 이상의 숫자여야 합니다",
            )
        return numeric

    return value


def _sanitize_config_items(rows: Any) -> list[dict[str, Any]]:
    items = rows if isinstance(rows, list) else []
    sanitized_items = [
        item
        for item in items
        if isinstance(item, dict) and item.get("key") != "slack_webhook_url"
    ]

    existing_keys = {
        str(item.get("key"))
        for item in sanitized_items
        if isinstance(item, dict) and item.get("key")
    }

    for key, (default_value, description) in MANAGED_ADMIN_CONFIG_DEFAULTS.items():
        if key in existing_keys:
            continue
        sanitized_items.append(
            {
                "key": key,
                "value": default_value,
                "description": description,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        )

    return sorted(sanitized_items, key=lambda item: str(item.get("key", "")))


async def log_admin_action(
    admin_id: str,
    action: str,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    reason: Optional[str] = None,
    before_data: Optional[dict] = None,
    after_data: Optional[dict] = None,
    metadata: Optional[dict] = None,
) -> None:
    try:
        await db_execute(
            lambda: (
                supabase.table("admin_audit_logs")
                .insert(
                    {
                        "admin_id": admin_id,
                        "action": action,
                        "target_type": target_type,
                        "target_id": target_id,
                        "reason": reason,
                        "before_data": before_data,
                        "after_data": after_data,
                        "metadata": metadata,
                    }
                )
                .execute()
            )
        )
    except Exception as e:
        logger.error(f"[AUDIT] CRITICAL: Failed to log admin action: {e}")
        raise


async def require_admin(user_id: str = Depends(get_current_user_id)) -> str:
    if not await _is_admin_user(user_id):
        raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다")
    return user_id


# ============================================================
# Request/Response Models
# ============================================================
class PaymentModeRequest(BaseModel):
    mode: Literal["test", "live"] = Field(..., description="결제 모드")
    confirm: bool = Field(False, description="모드 변경 확인 플래그")


class ConfigUpdate(BaseModel):
    value: Any


def _coerce_config_value(value: Any) -> Any:
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return ""
        try:
            return json.loads(stripped)
        except (json.JSONDecodeError, TypeError):
            return stripped
    return value


def _parse_non_negative_int_config(key: str, value: Any) -> int:
    parsed = _coerce_config_value(value)
    if parsed is None or isinstance(parsed, bool):
        raise HTTPException(
            status_code=400, detail=f"설정 '{key}'는 0 이상의 정수여야 합니다"
        )

    if isinstance(parsed, (int, float)):
        numeric = float(parsed)
    elif isinstance(parsed, str):
        try:
            numeric = float(parsed.strip())
        except ValueError as exc:
            raise HTTPException(
                status_code=400, detail=f"설정 '{key}'는 숫자여야 합니다"
            ) from exc
    else:
        raise HTTPException(status_code=400, detail=f"설정 '{key}'는 숫자여야 합니다")

    if not numeric.is_integer() or numeric < 0:
        raise HTTPException(
            status_code=400, detail=f"설정 '{key}'는 0 이상의 정수여야 합니다"
        )

    return int(numeric)


def _validate_config_update_value(key: str, value: Any) -> Any:
    parsed = _coerce_config_value(value)

    if key.startswith("model_"):
        model_id = str(parsed).strip()
        if not model_id:
            raise HTTPException(status_code=400, detail="모델 ID는 비워둘 수 없습니다")
        if not is_supported_model_id(model_id):
            raise HTTPException(
                status_code=400, detail=f"지원하지 않는 모델 ID입니다: {model_id}"
            )
        return model_id

    if key.startswith("reasoning_effort_"):
        effort = str(parsed).strip().lower()
        if not is_supported_reasoning_effort(effort):
            raise HTTPException(
                status_code=400, detail=f"지원하지 않는 추론 강도입니다: {effort}"
            )
        return effort

    if key == "default_persona":
        persona = str(parsed).strip().lower()
        if not is_supported_persona(persona):
            raise HTTPException(
                status_code=400, detail=f"지원하지 않는 페르소나입니다: {persona}"
            )
        return persona

    if key in REMOVED_MONETIZATION_CONFIG_KEYS:
        return _parse_non_negative_int_config(key, value)

    if is_non_negative_integer_config_key(key):
        return _parse_non_negative_int_config(key, value)

    return value


class UserBalanceUpdate(BaseModel):
    amount: int = Field(
        ..., ge=-10000, le=10000, description="조정 금액 (-10000 ~ 10000)"
    )
    reason: str = Field(..., min_length=1, max_length=200, description="조정 사유")
    idempotency_key: str = Field(
        ..., min_length=8, max_length=128, description="요청 멱등성 키"
    )


class UpdateUserStatusRequest(BaseModel):
    status: str = Field(..., pattern="^(active|banned)$")
    reason: str = Field(..., min_length=1, max_length=200, description="상태 변경 사유")


class FeedbackStatusUpdate(BaseModel):
    status: Literal["pending", "reviewed", "resolved"] = Field(
        ..., description="피드백 상태"
    )
    admin_note: Optional[str] = Field(
        default=None, max_length=2000, description="관리자 메모"
    )
    response: Optional[str] = None


class RefundRequest(BaseModel):
    amount: int = Field(..., gt=0, le=10000, description="환불 금액 (1 ~ 10000)")
    reason: str = Field(..., min_length=1, max_length=200, description="환불 사유")
    original_tx_id: str = Field(
        ...,
        pattern=r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
        description="원본 거래 ID",
    )
    idempotency_key: Optional[str] = Field(
        default=None, min_length=8, max_length=128, description="요청 멱등성 키"
    )


# Response Models
class DashboardStatsResponse(BaseModel):
    total_users: int
    today_users: int
    total_readings: int
    today_readings: int
    total_revenue: int
    pending_feedbacks: int
    failed_payments: int


class RefundInfoResponse(BaseModel):
    user_id: str
    amount: int
    reason: str
    created_at: str


class DashboardResponse(BaseModel):
    stats: DashboardStatsResponse
    recent_refunds: list[RefundInfoResponse]


class BalanceAdjustResponse(BaseModel):
    status: str
    previous_balance: int
    new_balance: int
    adjustment: int


class TrackingReportSampleSize(BaseModel):
    tracked_users: int
    tracked_sessions: int
    total_events: int


class TrackingReportKPI(BaseModel):
    key: str
    label: str
    value: str
    context: str
    tone: Literal["neutral", "positive", "warning", "critical"] = "neutral"


class TrackingReportFunnelStep(BaseModel):
    name: str
    count: int
    conversion_rate: float
    note: Optional[str] = None


class TrackingReportPageItem(BaseModel):
    page: str
    views: int
    visitors: int


class TrackingReportFeatureItem(BaseModel):
    feature: str
    usage_count: int
    unique_users: int
    insight: str


class TrackingReportTabInsight(BaseModel):
    tab_name: str
    event_count: int
    avg_dwell_seconds: float
    bounce_rate: float
    insight: str


class TrackingReportSegmentItem(BaseModel):
    segment: str
    users: int
    avg_readings: float
    avg_paid_amount: float
    insight: str


class TrackingReportFinding(BaseModel):
    title: str
    summary: str
    detail: str
    tone: Literal["positive", "warning", "critical"]


class TrackingReportRecommendation(BaseModel):
    priority: Literal["high", "medium", "low"]
    title: str
    rationale: str
    actions: list[str]
    expected_impact: str


class TrackingReportEvidence(BaseModel):
    title: str
    source: str
    url: str
    takeaway: str
    supports: str


class TrackingReportResponse(BaseModel):
    scope_label: str
    generated_at: str
    executive_summary: str
    executive_subtitle: str
    sample_size: TrackingReportSampleSize
    kpis: list[TrackingReportKPI]
    journey_funnel: list[TrackingReportFunnelStep]
    journey_funnel_note: str
    page_focus: list[TrackingReportPageItem]
    feature_focus: list[TrackingReportFeatureItem]
    tab_insights: list[TrackingReportTabInsight]
    payer_segments: list[TrackingReportSegmentItem]
    risks: list[TrackingReportFinding]
    opportunities: list[TrackingReportFinding]
    recommendations: list[TrackingReportRecommendation]
    evidence: list[TrackingReportEvidence]
    limitations: list[str]


class UserStatusUpdateResponse(BaseModel):
    status: str
    previous_status: str
    current_status: str


class RefundResponse(BaseModel):
    status: str
    user_id: str
    amount: int
    new_balance: int


class LLMModelStatsItem(BaseModel):
    provider: str
    model: str
    call_count: int
    success_count: int
    failure_count: int
    avg_tokens: int
    success_rate: float


class LLMDailyTrendItem(BaseModel):
    date: str
    call_count: int
    success_count: int
    failure_count: int
    avg_tokens: int


class LLMStatsResponse(BaseModel):
    days: int
    models: list[LLMModelStatsItem]
    daily_trend: list[LLMDailyTrendItem]


class ActivitySearchResult(BaseModel):
    id: str
    name: Optional[str] = None
    email: Optional[str] = None
    provider: Optional[str] = None
    status: Optional[str] = None
    last_activity: Optional[str] = None


class ActivitySearchResponse(BaseModel):
    users: List[ActivitySearchResult]
    total: int
    page: int
    limit: int


class TimelineItem(BaseModel):
    id: str
    timestamp: str
    source: str
    event_type: str
    summary: str
    details: Dict[str, Any] = Field(default_factory=dict)


class TimelineResponse(BaseModel):
    timeline: List[TimelineItem]
    total: int
    page: int
    limit: int
    user_info: Optional[Dict[str, Any]] = None


EVENT_SUMMARIES = {
    "page_view": "페이지 조회",
    "analysis_started": "분석 시작",
    "analysis_completed": "분석 완료",
    "feature_used": "기능 사용",
    "button_click": "버튼 클릭",
    "login_success": "로그인 성공",
    "login_failed": "로그인 실패",
    "profile_created": "프로필 생성",
    "profile_deleted": "프로필 삭제",
    "daily_fortune_generated": "오늘의 운세 생성",
    "payment_error": "결제 오류",
    "share_created": "공유 생성",
    "tab_viewed": "탭 조회",
}


# ============================================================
# Dashboard
# ============================================================
@router.get("/dashboard", response_model=DashboardResponse)
async def get_dashboard(admin_id: str = Depends(require_admin)):
    today = datetime.utcnow().date()

    (
        total_users,
        today_users,
        total_readings,
        today_readings,
        total_revenue,
        pending_feedbacks,
        failed_payments,
        recent_refunds_raw,
    ) = await asyncio.gather(
        db_execute(
            lambda: supabase.table("users").select("id", count="exact").execute()
        ),
        db_execute(
            lambda: (
                supabase.table("users")
                .select("id", count="exact")
                .gte("created_at", today.isoformat())
                .execute()
            )
        ),
        db_execute(
            lambda: (
                supabase.table("user_readings").select("id", count="exact").execute()
            )
        ),
        db_execute(
            lambda: (
                supabase.table("user_readings")
                .select("id", count="exact")
                .gte("created_at", today.isoformat())
                .execute()
            )
        ),
        db_execute(
            lambda: (
                supabase.table("payments")
                .select("amount")
                .eq("status", "done")
                .execute()
            )
        ),
        db_execute(
            lambda: (
                supabase.table("user_feedbacks")
                .select("id", count="exact")
                .eq("status", "pending")
                .execute()
            )
        ),
        db_execute(
            lambda: (
                supabase.table("payments")
                .select("id", count="exact")
                .eq("status", "failed")
                .execute()
            )
        ),
        db_execute(
            lambda: (
                supabase.table("coin_transactions")
                .select("user_id, amount, description, created_at")
                .in_("type", ["refund", "admin_refund"])
                .order("created_at", desc=True)
                .limit(5)
                .execute()
            )
        ),
    )

    recent_refunds = [
        {
            "user_id": r["user_id"],
            "amount": r["amount"],
            "reason": r.get("description", ""),
            "created_at": r["created_at"],
        }
        for r in (recent_refunds_raw.data or [])
    ]

    revenue_sum = sum(p.get("amount", 0) for p in (total_revenue.data or []))

    return {
        "stats": {
            "total_users": total_users.count or 0,
            "today_users": today_users.count or 0,
            "total_readings": total_readings.count or 0,
            "today_readings": today_readings.count or 0,
            "total_revenue": revenue_sum,
            "pending_feedbacks": pending_feedbacks.count or 0,
            "failed_payments": failed_payments.count or 0,
        },
        "recent_refunds": recent_refunds,
    }


@router.get("/analytics/funnel")
async def get_funnel_analysis(
    days: int = Query(default=30, ge=0, le=3650), admin_id: str = Depends(require_admin)
):
    """결제 퍼널 분석 - 가입→첫결제→재결제"""
    from datetime import timezone
    from collections import Counter

    if days == 0:
        start_date = datetime(2020, 1, 1, tzinfo=timezone.utc)
    else:
        start_date = datetime.now(timezone.utc) - timedelta(days=days)
    start_str = start_date.isoformat()

    total_signups = await db_execute(
        lambda: (
            supabase.table("users")
            .select("id", count="exact")
            .gte("created_at", start_str)
            .execute()
        )
    )
    first_payers = await db_execute(
        lambda: (
            supabase.table("payments")
            .select("user_id")
            .eq("status", "done")
            .gte("created_at", start_str)
            .execute()
        )
    )

    unique_payers = set(
        p["user_id"] for p in (first_payers.data or []) if p.get("user_id")
    )
    payment_counts = Counter(
        p["user_id"] for p in (first_payers.data or []) if p.get("user_id")
    )
    repeat_payers = sum(1 for c in payment_counts.values() if c >= 2)

    signup_count = total_signups.count or 0
    first_pay_count = len(unique_payers)

    steps = [
        {"name": "가입", "count": signup_count, "conversion_rate": 100.0},
        {
            "name": "첫 결제",
            "count": first_pay_count,
            "conversion_rate": round(first_pay_count / signup_count * 100, 1)
            if signup_count > 0
            else 0,
        },
        {
            "name": "재결제",
            "count": repeat_payers,
            "conversion_rate": round(repeat_payers / first_pay_count * 100, 1)
            if first_pay_count > 0
            else 0,
        },
    ]

    return {"steps": steps, "days": days}


@router.get("/analytics/cohort")
async def get_cohort_analysis(
    weeks: int = Query(default=8, ge=4, le=12), admin_id: str = Depends(require_admin)
):
    """주간 코호트 리텐션 분석"""
    from datetime import timezone
    from collections import defaultdict

    now = datetime.now(timezone.utc)
    start_date = now - timedelta(weeks=weeks)
    start_str = start_date.isoformat()

    users_result = await db_execute(
        lambda: (
            supabase.table("users")
            .select("id, created_at")
            .gte("created_at", start_str)
            .execute()
        )
    )
    activity_result = await db_execute(
        lambda: (
            supabase.table("analytics_events")
            .select("user_id, created_at")
            .eq("event_type", "page_view")
            .gte("created_at", start_str)
            .execute()
        )
    )

    def get_week_number(dt_str: str) -> int:
        dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        diff = (now - dt).days
        return diff // 7

    cohort_users = defaultdict(set)
    for u in users_result.data or []:
        week = get_week_number(u["created_at"])
        if week < weeks:
            cohort_users[week].add(u["id"])

    user_active_weeks = defaultdict(set)
    for a in activity_result.data or []:
        if a.get("user_id"):
            week = get_week_number(a["created_at"])
            if week < weeks:
                user_active_weeks[a["user_id"]].add(week)

    cohorts = []
    for cohort_week in range(weeks - 1, -1, -1):
        users_in_cohort = cohort_users[cohort_week]
        cohort_size = len(users_in_cohort)
        if cohort_size == 0:
            continue

        retention = []
        for offset in range(min(cohort_week + 1, 8)):
            target_week = cohort_week - offset
            active = sum(
                1
                for uid in users_in_cohort
                if target_week in user_active_weeks.get(uid, set())
            )
            retention.append(round(active / cohort_size * 100, 1))

        cohort_start = (now - timedelta(weeks=cohort_week + 1)).strftime("%m/%d")
        cohort_end = (now - timedelta(weeks=cohort_week)).strftime("%m/%d")
        cohorts.append(
            {
                "label": f"{cohort_start}~{cohort_end}",
                "size": cohort_size,
                "retention": retention,
            }
        )

    return {"cohorts": cohorts, "weeks": weeks}


@router.get("/analytics/segments")
async def get_user_segments(admin_id: str = Depends(require_admin)):
    """사용자 결제 세그먼트 분석"""
    result = await db_execute(
        lambda: (
            supabase.table("user_wallets").select("user_id, total_charged").execute()
        )
    )

    segments = {
        "무과금": {"min": 0, "max": 0, "count": 0, "total": 0},
        "소과금": {"min": 1, "max": 9999, "count": 0, "total": 0},
        "중과금": {"min": 10000, "max": 49999, "count": 0, "total": 0},
        "다과금": {"min": 50000, "max": float("inf"), "count": 0, "total": 0},
    }

    for wallet in result.data or []:
        charged = wallet.get("total_charged", 0) or 0
        if charged == 0:
            segments["무과금"]["count"] += 1
        elif charged < 10000:
            segments["소과금"]["count"] += 1
            segments["소과금"]["total"] += charged
        elif charged < 50000:
            segments["중과금"]["count"] += 1
            segments["중과금"]["total"] += charged
        else:
            segments["다과금"]["count"] += 1
            segments["다과금"]["total"] += charged

    result_segments = []
    for name, data in segments.items():
        avg = round(data["total"] / data["count"]) if data["count"] > 0 else 0
        result_segments.append(
            {
                "name": name,
                "count": data["count"],
                "total_charged": data["total"],
                "avg_charged": avg,
            }
        )

    return {"segments": result_segments}


# ============================================================
# Payment Mode Management
# ============================================================
@router.get("/payment-mode")
async def get_payment_mode(
    admin_id: str = Depends(require_admin),
    _rl: None = Depends(
        rate_limit_dependency(
            limit=30, window_seconds=60, scope="admin_payment_mode_read"
        )
    ),
):
    from ..services.config_service import config_service

    mode = await config_service.get_payment_mode()
    has_live_keys = bool(
        settings.toss_live_secret_key and settings.toss_live_client_key
    )
    return {"mode": mode, "has_live_keys": has_live_keys}


@router.post("/payment-mode")
async def set_payment_mode(
    request: PaymentModeRequest,
    admin_id: str = Depends(require_admin),
    _rl: None = Depends(
        rate_limit_dependency(limit=5, window_seconds=60, scope="admin_payment_mode")
    ),
):
    from ..services.config_service import config_service

    if not request.confirm:
        raise HTTPException(status_code=400, detail="confirm=true 를 포함해야 합니다")

    if request.mode == "live":
        if not settings.toss_live_secret_key or not settings.toss_live_client_key:
            raise HTTPException(
                status_code=400,
                detail="라이브 키가 설정되지 않았습니다. TOSS_LIVE_SECRET_KEY, TOSS_LIVE_CLIENT_KEY 환경변수를 먼저 설정하세요.",
            )

    previous_mode = await config_service.get_payment_mode()

    if previous_mode == request.mode:
        return {"status": "unchanged", "mode": request.mode}

    await db_execute(
        lambda: (
            supabase.table("app_config")
            .upsert(
                {"key": "payment_mode", "value": request.mode, "updated_by": admin_id},
                on_conflict="key",
            )
            .execute()
        )
    )
    config_service.invalidate()

    await log_admin_action(
        admin_id=admin_id,
        action="payment_mode.change",
        target_type="app_config",
        target_id="payment_mode",
        before_data={"mode": previous_mode},
        after_data={"mode": request.mode},
    )

    try:
        from ..services.telegram_service import telegram_service

        severity_label = "LIVE" if request.mode == "live" else "TEST"
        await telegram_service.send_alert(
            "결제 모드 변경",
            f"[{severity_label}] {previous_mode} → {request.mode}",
            severity="critical" if request.mode == "live" else "info",
        )
    except Exception:
        logger.warning("[ADMIN] Telegram notification failed for payment mode change")

    return {"status": "changed", "previous_mode": previous_mode, "mode": request.mode}


# ============================================================
# Config Management
# ============================================================
@router.get("/config")
async def get_all_config(admin_id: str = Depends(require_admin)):
    result = await db_execute(
        lambda: supabase.table("app_config").select("*").order("key").execute()
    )
    return _sanitize_config_items(result.data)


async def _update_config_item(
    key: str,
    update: ConfigUpdate,
    admin_id: str = Depends(require_admin),
    _rl: None = Depends(
        rate_limit_dependency(limit=20, window_seconds=60, scope="admin_config_update")
    ),
):
    if key == "slack_webhook_url":
        raise HTTPException(
            status_code=400,
            detail="Slack Webhook URL은 /admin/config/alerts 경로로만 수정할 수 있습니다",
        )

    validated_value = _validate_config_update_value(key, update.value)
    value_json = (
        json.dumps(validated_value)
        if not isinstance(validated_value, str)
        else validated_value
    )

    result = await db_execute(
        lambda: (
            supabase.table("app_config")
            .update(
                {
                    "value": value_json,
                    "updated_by": admin_id,
                }
            )
            .eq("key", key)
            .execute()
        )
    )

    if not result.data:
        if key not in MANAGED_ADMIN_CONFIG_DEFAULTS:
            raise HTTPException(
                status_code=404, detail=f"설정 '{key}'를 찾을 수 없습니다"
            )

        _, description = MANAGED_ADMIN_CONFIG_DEFAULTS[key]
        result = await db_execute(
            lambda: (
                supabase.table("app_config")
                .insert(
                    {
                        "key": key,
                        "value": value_json,
                        "description": description,
                        "updated_by": admin_id,
                    }
                )
                .execute()
            )
        )

        if not result.data:
            raise HTTPException(
                status_code=500, detail=f"설정 '{key}' 저장에 실패했습니다"
            )

    from ..services.config_service import config_service

    config_service.invalidate()

    await log_admin_action(
        admin_id=admin_id,
        action="config.update",
        target_type="app_config",
        target_id=key,
        metadata={"value": validated_value},
    )

    from ..services.notification_service import notifier

    notifier.notify_config_changed(
        key=key, admin_id=admin_id, value=str(validated_value)
    )

    return {"status": "updated", "key": key, "value": validated_value}


@router.get("/config/alerts")
async def get_alert_config(admin_id: str = Depends(require_admin)):
    """알림 설정 조회"""
    result = await db_execute(
        lambda: (
            supabase.table("app_config")
            .select("key, value")
            .in_(
                "key",
                [
                    "alert_error_rate_threshold",
                    "alert_payment_failure_threshold",
                    "alert_refund_spike_threshold",
                    "slack_webhook_url",
                ],
            )
            .execute()
        )
    )

    config = {item["key"]: item["value"] for item in (result.data or [])}

    slack_webhook_url = _parse_secret_string_value(config.get("slack_webhook_url"))

    return {
        "error_rate_threshold": _safe_parse_config_value(
            config.get("alert_error_rate_threshold"), 5.0
        ),
        "payment_failure_threshold": _safe_parse_config_value(
            config.get("alert_payment_failure_threshold"), 3, int
        ),
        "refund_spike_threshold": _safe_parse_config_value(
            config.get("alert_refund_spike_threshold"), 200.0
        ),
        "slack_webhook_url": "",
        "slack_webhook_masked": _mask_webhook_url(slack_webhook_url),
        "slack_webhook_configured": bool(slack_webhook_url),
    }


@router.put("/config/alerts")
async def update_alert_config(
    config: dict,
    admin_id: str = Depends(require_admin),
    _rl: None = Depends(
        rate_limit_dependency(
            limit=10, window_seconds=60, scope="admin_alert_config_update"
        )
    ),
):
    """알림 설정 업데이트"""
    key_mapping = {
        "error_rate_threshold": "alert_error_rate_threshold",
        "payment_failure_threshold": "alert_payment_failure_threshold",
        "refund_spike_threshold": "alert_refund_spike_threshold",
        "slack_webhook_url": "slack_webhook_url",
        "alert_error_rate_threshold": "alert_error_rate_threshold",
        "alert_payment_failure_threshold": "alert_payment_failure_threshold",
        "alert_refund_spike_threshold": "alert_refund_spike_threshold",
    }

    audit_metadata: dict[str, Any] = {}

    for key, value in config.items():
        db_key = key_mapping.get(key)
        if not db_key:
            continue

        validated_value = _validate_alert_config_value(db_key, value)

        value_json = (
            validated_value
            if isinstance(validated_value, str)
            else json.dumps(validated_value)
        )
        await db_execute(
            lambda k=db_key, v=value_json: (
                supabase.table("app_config")
                .upsert(
                    {
                        "key": k,
                        "value": v,
                        "updated_by": admin_id,
                    },
                    on_conflict="key",
                )
                .execute()
            )
        )

        audit_metadata[key] = (
            _mask_webhook_url(validated_value)
            if db_key == "slack_webhook_url" and isinstance(validated_value, str)
            else validated_value
        )

    await log_admin_action(
        admin_id=admin_id, action="alert_config.update", metadata=audit_metadata
    )
    return {"status": "updated"}


@router.put("/config/{key}")
async def update_config(
    key: str,
    update: ConfigUpdate,
    admin_id: str = Depends(require_admin),
    _rl: None = Depends(
        rate_limit_dependency(limit=20, window_seconds=60, scope="admin_config_update")
    ),
):
    return await _update_config_item(
        key=key,
        update=update,
        admin_id=admin_id,
        _rl=_rl,
    )


# ============================================================
# User Management
# ============================================================
@router.get("/users")
async def get_users(
    admin_id: str = Depends(require_admin),
    search: Optional[str] = None,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, le=100),
):
    offset = (page - 1) * limit

    result = await db_execute(
        lambda: (
            supabase.table("users")
            .select(
                "id, created_at, last_login_at, status, is_admin, user_wallets(balance), user_identities(provider, name_ct, name_iv, name_tag, email_ct, email_iv, email_tag, key_id)",
                count="exact",
            )
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
    )

    users_with_details = []
    for user in result.data or []:
        wallet_data = user.get("user_wallets")
        identity_data = user.get("user_identities")

        balance = _extract_nested_value(wallet_data, "balance", 0)
        provider = _extract_nested_value(identity_data, "provider", None)

        # Decrypt name and email if available
        name = None
        email = None
        if isinstance(identity_data, list) and len(identity_data) > 0:
            ident = identity_data[0]
            # Decrypt name
            if ident.get("name_ct") and ident.get("name_iv") and ident.get("name_tag"):
                try:
                    name = crypto_manager.decrypt_field(
                        table="user_identities",
                        column="name",
                        iv=ident["name_iv"],
                        ciphertext=ident["name_ct"],
                        tag=ident["name_tag"],
                        key_id=ident.get("key_id"),
                    )
                except Exception:
                    name = "(복호화 실패)"
            # Decrypt email
            if (
                ident.get("email_ct")
                and ident.get("email_iv")
                and ident.get("email_tag")
            ):
                try:
                    email = crypto_manager.decrypt_field(
                        table="user_identities",
                        column="email",
                        iv=ident["email_iv"],
                        ciphertext=ident["email_ct"],
                        tag=ident["email_tag"],
                        key_id=ident.get("key_id"),
                    )
                except Exception:
                    email = "(복호화 실패)"

        users_with_details.append(
            {
                "id": user["id"],
                "created_at": user["created_at"],
                "last_login_at": user.get("last_login_at"),
                "status": user.get("status"),
                "is_admin": user.get("is_admin", False),
                "balance": balance,
                "provider": provider,
                "name": name,
                "email": email,
            }
        )

    return {
        "users": users_with_details,
        "total": result.count or 0,
        "page": page,
        "limit": limit,
    }


@router.get("/users/{user_id}")
async def get_user_detail(user_id: str, admin_id: str = Depends(require_admin)):
    user = await db_execute(
        lambda: supabase.table("users").select("*").eq("id", user_id).single().execute()
    )
    if not user.data:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")

    wallet = await db_execute(
        lambda: (
            supabase.table("user_wallets")
            .select("*")
            .eq("user_id", user_id)
            .single()
            .execute()
        )
    )
    transactions = await db_execute(
        lambda: (
            supabase.table("coin_transactions")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(20)
            .execute()
        )
    )

    readings = await db_execute(
        lambda: (
            supabase.table("user_readings")
            .select("id, created_at, label, persona")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(10)
            .execute()
        )
    )

    return {
        "user": user.data,
        "wallet": wallet.data,
        "transactions": transactions.data or [],
        "readings": readings.data or [],
    }


@router.post("/users/{user_id}/balance", response_model=BalanceAdjustResponse)
async def adjust_user_balance(
    user_id: str,
    update: UserBalanceUpdate,
    admin_id: str = Depends(require_admin),
    _rl: None = Depends(
        rate_limit_dependency(limit=10, window_seconds=60, scope="admin_balance_adjust")
    ),
):
    if update.amount == 0:
        raise HTTPException(status_code=400, detail="조정 금액은 0일 수 없습니다")

    idempotency_key = update.idempotency_key.strip()
    if not idempotency_key:
        raise HTTPException(status_code=400, detail="멱등성 키가 필요합니다")

    try:
        result = await db_execute(
            lambda: supabase.rpc(
                "admin_adjust_coins",
                {
                    "p_user_id": user_id,
                    "p_amount": update.amount,
                    "p_reason": update.reason,
                    "p_admin_id": admin_id,
                    "p_idempotency_key": idempotency_key,
                },
            ).execute()
        )

        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=500, detail="잔액 조정 실패")

        rpc_result = result.data[0]
        if not isinstance(rpc_result, dict):
            raise HTTPException(
                status_code=500, detail="잔액 조정 응답 형식이 올바르지 않습니다"
            )

        if not rpc_result.get("success"):
            error_msg = str(rpc_result.get("message", "잔액 조정 실패"))
            if "지갑이 없습니다" in error_msg:
                raise HTTPException(
                    status_code=404, detail="사용자 지갑을 찾을 수 없습니다"
                )
            if "잔액 부족" in error_msg:
                raise HTTPException(status_code=400, detail="잔액이 부족합니다")
            if "이미 처리된 요청" in error_msg:
                raise HTTPException(status_code=409, detail="중복 요청입니다")
            logger.warning(
                "[ADMIN BALANCE] RPC rejected request: user_id=%s admin_id=%s message=%s",
                user_id,
                admin_id,
                error_msg,
            )
            raise HTTPException(
                status_code=400, detail="잔액 조정 요청이 거부되었습니다"
            )

        try:
            new_balance = int(rpc_result["new_balance"])
        except (KeyError, TypeError, ValueError):
            raise HTTPException(
                status_code=500, detail="잔액 조정 응답에 new_balance가 없습니다"
            )

        previous_balance_raw = rpc_result.get("previous_balance")
        if previous_balance_raw is None:
            previous_balance = new_balance - update.amount
        else:
            try:
                previous_balance = int(previous_balance_raw)
            except (TypeError, ValueError):
                previous_balance = new_balance - update.amount

        transaction_id = str(rpc_result.get("transaction_id") or "")
        rpc_message = str(rpc_result.get("message") or "")
        is_idempotent_replay = "이미 처리된 요청" in rpc_message

        if not is_idempotent_replay:
            await log_admin_action(
                admin_id=admin_id,
                action="balance.adjust",
                target_type="user",
                target_id=user_id,
                reason=update.reason,
                before_data={"balance": previous_balance},
                after_data={"balance": new_balance},
                metadata={
                    "adjustment": update.amount,
                    "transaction_id": transaction_id,
                    "idempotency_key": idempotency_key,
                },
            )

            from ..services.notification_service import notifier

            notifier.notify_admin_balance_adjust(
                user_id=user_id,
                amount=update.amount,
                reason=update.reason,
                prev=previous_balance,
                new=new_balance,
                admin_id=admin_id,
            )

        return {
            "status": "adjusted",
            "previous_balance": previous_balance,
            "new_balance": new_balance,
            "adjustment": update.amount,
        }

    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "[ADMIN BALANCE] 잔액 조정 실패: user_id=%s admin_id=%s", user_id, admin_id
        )
        raise HTTPException(status_code=500, detail="잔액 조정 중 오류가 발생했습니다")


@router.put("/users/{user_id}/status", response_model=UserStatusUpdateResponse)
async def update_user_status(
    user_id: str,
    request: UpdateUserStatusRequest,
    admin_id: str = Depends(require_admin),
    _rl: None = Depends(
        rate_limit_dependency(
            limit=20, window_seconds=60, scope="admin_user_status_update"
        )
    ),
):
    reason = request.reason.strip()
    if not reason:
        raise HTTPException(status_code=400, detail="상태 변경 사유를 입력해주세요")

    try:
        user_result = await db_execute(
            lambda: (
                supabase.table("users")
                .select("id, status")
                .eq("id", user_id)
                .single()
                .execute()
            )
        )

        if not user_result.data:
            raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")

        previous_status = user_result.data.get("status") or "active"
        if previous_status == request.status:
            status_label = "활성" if request.status == "active" else "정지"
            raise HTTPException(
                status_code=400, detail=f"이미 {status_label} 상태입니다"
            )

        result = await db_execute(
            lambda: (
                supabase.table("users")
                .update({"status": request.status})
                .eq("id", user_id)
                .execute()
            )
        )

        if not result.data:
            raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")

        await log_admin_action(
            admin_id=admin_id,
            action="user.ban" if request.status == "banned" else "user.activate",
            target_type="users",
            target_id=user_id,
            reason=reason,
            before_data={"status": previous_status},
            after_data={"status": request.status},
        )

        if request.status == "banned":
            from ..services.notification_service import notifier

            notifier.notify_user_banned(
                user_id=user_id, reason=reason, admin_id=admin_id
            )

        return {
            "status": "updated",
            "previous_status": previous_status,
            "current_status": request.status,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(
            f"[ADMIN USER STATUS] Failed to update user status: user_id={user_id}, admin_id={admin_id}, error={e}"
        )
        raise HTTPException(
            status_code=500, detail="사용자 상태 변경 중 오류가 발생했습니다"
        )


# ============================================================
# Feedback Management
# ============================================================
@router.get("/feedbacks")
async def get_feedbacks(
    admin_id: str = Depends(require_admin),
    status: Optional[str] = None,
    category: Optional[str] = None,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, le=100),
):
    offset = (page - 1) * limit

    def build_query():
        query = supabase.table("user_feedbacks").select("*", count="exact")
        if status:
            query = query.eq("status", status)
        if category:
            query = query.eq("category", category)
        return (
            query.order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )

    result = await db_execute(build_query)

    return {
        "feedbacks": result.data or [],
        "total": result.count or 0,
        "page": page,
        "limit": limit,
    }


@router.put("/feedbacks/{feedback_id}")
async def update_feedback_status(
    feedback_id: str,
    request: FeedbackStatusUpdate,
    admin_id: str = Depends(require_admin),
    _rl: None = Depends(
        rate_limit_dependency(
            limit=20, window_seconds=60, scope="admin_feedback_update"
        )
    ),
):
    update_data: dict[str, Any] = {
        "status": request.status,
        "updated_at": datetime.utcnow().isoformat(),
    }
    if request.admin_note:
        update_data["admin_note"] = request.admin_note
    if request.response is not None:
        normalized_response = request.response.strip()
        if normalized_response:
            update_data["response"] = normalized_response
            update_data["responded_at"] = datetime.now(timezone.utc).isoformat()
            update_data["reply_seen_at"] = None
        else:
            update_data["response"] = None
            update_data["responded_at"] = None
            update_data["reply_seen_at"] = None

    result = await db_execute(
        lambda: (
            supabase.table("user_feedbacks")
            .update(update_data)
            .eq("id", feedback_id)
            .execute()
        )
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="피드백을 찾을 수 없습니다")

    await log_admin_action(
        admin_id=admin_id,
        action="feedback.update_status",
        target_type="user_feedbacks",
        target_id=feedback_id,
        metadata={
            "status": request.status,
            "admin_note": request.admin_note,
            "response": request.response,
        },
    )

    return {"status": "updated", "feedback_id": feedback_id}


# ============================================================
# Payment Issues
# ============================================================
@router.get("/payments/issues")
async def get_payment_issues(
    admin_id: str = Depends(require_admin),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, le=100),
    _rl: None = Depends(
        rate_limit_dependency(limit=30, window_seconds=60, scope="admin_payment_issues")
    ),
):
    offset = (page - 1) * limit

    failed = await db_execute(
        lambda: (
            supabase.table("payments")
            .select(
                "id,user_id,amount,failure_code,failure_message,created_at,status",
                count="exact",
            )
            .in_("status", ["failed", "canceled"])
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
    )

    refunds_raw = await db_execute(
        lambda: (
            supabase.table("coin_transactions")
            .select("user_id, amount, description, created_at")
            .in_("type", ["refund", "admin_refund"])
            .order("created_at", desc=True)
            .limit(50)
            .execute()
        )
    )

    refunds = [
        {
            "user_id": r["user_id"],
            "amount": r["amount"],
            "reason": r.get("description", ""),
            "created_at": r["created_at"],
        }
        for r in (refunds_raw.data or [])
    ]

    failed_rows = failed.data if isinstance(failed.data, list) else []
    safe_failed_payments = [
        {
            "id": item.get("id"),
            "user_id": item.get("user_id"),
            "amount": item.get("amount"),
            "failure_code": item.get("failure_code"),
            "failure_message": item.get("failure_message"),
            "created_at": item.get("created_at"),
            "status": item.get("status"),
        }
        for item in failed_rows
        if isinstance(item, dict)
    ]

    return {
        "failed_payments": safe_failed_payments,
        "total_failed": failed.count or 0,
        "recent_refunds": refunds,
        "page": page,
        "limit": limit,
    }


@router.post("/payments/{user_id}/refund", response_model=RefundResponse)
async def manual_refund(
    user_id: str,
    refund: RefundRequest,
    admin_id: str = Depends(require_admin),
    _rl: None = Depends(
        rate_limit_dependency(limit=10, window_seconds=60, scope="admin_payment_refund")
    ),
):
    idempotency_key = (
        refund.idempotency_key.strip()
        if refund.idempotency_key
        else f"admin_refund:{refund.original_tx_id}"
    )

    try:
        result = await db_execute(
            lambda: supabase.rpc(
                "admin_refund_coins",
                {
                    "p_admin_id": admin_id,
                    "p_user_id": user_id,
                    "p_amount": refund.amount,
                    "p_reason": refund.reason,
                    "p_original_tx_id": refund.original_tx_id,
                    "p_idempotency_key": idempotency_key,
                },
            ).execute()
        )

        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=500, detail="환불 처리 실패")

        rpc_result = result.data[0]
        if not isinstance(rpc_result, dict):
            raise HTTPException(
                status_code=500, detail="환불 응답 형식이 올바르지 않습니다"
            )

        if not rpc_result.get("success"):
            error_msg = str(
                rpc_result.get("message")
                or rpc_result.get("error_message")
                or "환불 처리 실패"
            )
            if "WALLET_NOT_FOUND" in error_msg or "지갑" in error_msg:
                raise HTTPException(
                    status_code=404, detail="사용자 지갑을 찾을 수 없습니다"
                )
            if (
                "DUPLICATE_REQUEST" in error_msg
                or "이미 환불" in error_msg
                or "이미 처리된 요청" in error_msg
            ):
                raise HTTPException(status_code=409, detail="중복 요청입니다")
            if "ORIGINAL_TX_REQUIRED" in error_msg:
                raise HTTPException(status_code=400, detail="원본 거래 ID가 필요합니다")
            if "ORIGINAL_TX_MISMATCH" in error_msg:
                raise HTTPException(
                    status_code=400,
                    detail="원본 거래와 사용자 정보가 일치하지 않습니다",
                )
            if "REFUND_EXCEEDS_ORIGINAL" in error_msg:
                raise HTTPException(
                    status_code=400,
                    detail="환불 금액이 원본 거래 금액을 초과할 수 없습니다",
                )
            logger.warning(
                "[ADMIN REFUND] RPC rejected request: user_id=%s admin_id=%s message=%s",
                user_id,
                admin_id,
                error_msg,
            )
            raise HTTPException(status_code=400, detail="환불 요청이 거부되었습니다")

        try:
            new_balance = int(rpc_result["new_balance"])
        except (KeyError, TypeError, ValueError):
            raise HTTPException(
                status_code=500, detail="환불 응답에 new_balance가 없습니다"
            )

        rpc_message = str(rpc_result.get("message") or "")
        is_idempotent_replay = (
            "이미 환불" in rpc_message or "이미 처리된 요청" in rpc_message
        )

        if not is_idempotent_replay:
            from ..services.notification_service import notifier

            notifier.notify_admin_refund(
                user_id=user_id,
                amount=refund.amount,
                reason=refund.reason,
                admin_id=admin_id,
            )

        return {
            "status": "refunded",
            "user_id": user_id,
            "amount": refund.amount,
            "new_balance": new_balance,
        }

    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "[ADMIN REFUND] 환불 처리 실패: user_id=%s admin_id=%s", user_id, admin_id
        )
        raise HTTPException(status_code=500, detail="환불 처리 중 오류가 발생했습니다")


# ============================================================
# Admin Check (for frontend)
# ============================================================
@router.get("/check")
async def check_admin_status(user_id: str = Depends(get_current_user_id)):
    is_admin = await _is_admin_user(user_id)
    return {"is_admin": is_admin}


@router.get("/dashboard/trends")
async def get_dashboard_trends(
    days: int = Query(default=7, ge=0, le=3650), admin_id: str = Depends(require_admin)
):
    from datetime import timezone
    from collections import defaultdict

    end_date = datetime.now(timezone.utc)
    if days == 0:
        earliest_user = await db_execute(
            lambda: (
                supabase.table("users")
                .select("created_at")
                .order("created_at")
                .limit(1)
                .execute()
            )
        )
        first_created_at = ((earliest_user.data or [{}])[0]).get("created_at")
        if first_created_at:
            start_date = datetime.fromisoformat(first_created_at.replace("Z", "+00:00"))
        else:
            start_date = datetime(2020, 1, 1, tzinfo=timezone.utc)
    else:
        start_date = end_date - timedelta(days=days)
    start_str = start_date.isoformat()

    users_result = await db_execute(
        lambda: (
            supabase.table("users")
            .select("id, created_at")
            .gte("created_at", start_str)
            .execute()
        )
    )

    user_ids = [u["id"] for u in (users_result.data or []) if u.get("id")]

    provider_by_user: dict[str, str] = {}
    if user_ids:
        identities_result = await db_execute(
            lambda: (
                supabase.table("user_identities")
                .select("user_id, provider")
                .in_("user_id", user_ids)
                .execute()
            )
        )
        for ident in identities_result.data or []:
            uid = ident.get("user_id")
            prov = ident.get("provider", "unknown")
            if uid:
                provider_by_user[uid] = prov

    readings_result = await db_execute(
        lambda: (
            supabase.table("user_readings")
            .select("created_at, persona")
            .gte("created_at", start_str)
            .execute()
        )
    )

    user_by_date_provider: dict[str, dict[str, int]] = defaultdict(
        lambda: defaultdict(int)
    )
    reading_by_date: dict[str, int] = defaultdict(int)
    provider_totals: dict[str, int] = defaultdict(int)
    persona_totals: dict[str, int] = defaultdict(int)

    for u in users_result.data or []:
        date_str = u.get("created_at", "")[:10]
        uid = u.get("id")
        if date_str and uid:
            prov = provider_by_user.get(uid, "unknown")
            user_by_date_provider[date_str][prov] += 1
            provider_totals[prov] += 1

    for r in readings_result.data or []:
        date_str = r.get("created_at", "")[:10]
        if date_str:
            reading_by_date[date_str] += 1
        persona = r.get("persona", "unknown") or "unknown"
        persona_totals[persona] += 1

    date_range = []
    current = start_date
    while current <= end_date:
        date_range.append(current.strftime("%Y-%m-%d"))
        current += timedelta(days=1)

    user_trend_by_provider = [
        {
            "date": d[-5:],
            "kakao": user_by_date_provider[d].get("kakao", 0),
            "naver": user_by_date_provider[d].get("naver", 0),
            "google": user_by_date_provider[d].get("google", 0),
            "total": sum(user_by_date_provider[d].values()),
        }
        for d in date_range
    ]

    reading_trend = [
        {"date": d[-5:], "count": reading_by_date.get(d, 0)} for d in date_range
    ]

    provider_distribution = [
        {"name": prov, "value": count, "label": prov}
        for prov, count in provider_totals.items()
    ]

    persona_distribution = [
        {"name": persona, "value": count} for persona, count in persona_totals.items()
    ]

    user_trend_simple = [
        {"date": d["date"], "count": d["total"]} for d in user_trend_by_provider
    ]

    return {
        "user_trend": user_trend_simple,
        "user_trend_by_provider": user_trend_by_provider,
        "reading_trend": reading_trend,
        "provider_distribution": provider_distribution,
        "persona_distribution": persona_distribution,
        "period": {
            "start": start_str,
            "end": end_date.strftime("%Y-%m-%d"),
            "days": days,
        },
    }


# ============================================================
# ============================================================
# Analytics APIs
# ============================================================
@router.get("/analytics/analysis-stats")
async def get_analysis_stats(
    days: int = Query(default=30, ge=0, le=3650), admin_id: str = Depends(require_admin)
):
    from datetime import timezone
    from collections import defaultdict

    if days == 0:
        start_date = datetime(2020, 1, 1, tzinfo=timezone.utc)
    else:
        start_date = datetime.now(timezone.utc) - timedelta(days=days)
    start_str = start_date.isoformat()

    result = await db_execute(
        lambda: (
            supabase.table("analytics_events")
            .select("event_type, event_data")
            .in_(
                "event_type",
                ["analysis_started", "analysis_completed", "analysis_failed"],
            )
            .gte("created_at", start_str)
            .execute()
        )
    )

    stats: dict[str, dict[str, int]] = defaultdict(
        lambda: {"started": 0, "completed": 0, "failed": 0}
    )

    for row in result.data or []:
        event_type = row.get("event_type", "")
        event_data = row.get("event_data") or {}
        feature_type = event_data.get("feature_type", "unknown")

        if event_type == "analysis_started":
            stats[feature_type]["started"] += 1
        elif event_type == "analysis_completed":
            stats[feature_type]["completed"] += 1
        elif event_type == "analysis_failed":
            stats[feature_type]["failed"] += 1

    features = ["reading", "flow_ai_advice", "compatibility", "ai_chat"]
    result_stats = []
    for feature in features:
        s = stats[feature]
        started = s["started"]
        completed = s["completed"]
        failed = s["failed"]
        success_rate = round((completed / started * 100), 2) if started > 0 else 0.0
        result_stats.append(
            {
                "feature_type": feature,
                "started": started,
                "completed": completed,
                "failed": failed,
                "success_rate": success_rate,
            }
        )

    return {"stats": result_stats, "days": days}


@router.get("/analytics/analysis-trend")
async def get_analysis_trend(
    feature_type: str = Query(
        ..., pattern="^(reading|flow_ai_advice|compatibility|ai_chat)$"
    ),
    days: int = Query(default=30, ge=0, le=3650),
    admin_id: str = Depends(require_admin),
):
    from datetime import timezone
    from collections import defaultdict

    end_date = datetime.now(timezone.utc)
    if days == 0:
        start_date = datetime(2020, 1, 1, tzinfo=timezone.utc)
    else:
        start_date = end_date - timedelta(days=days)
    start_str = start_date.isoformat()

    result = await db_execute(
        lambda: (
            supabase.table("analytics_events")
            .select("event_type, event_data, created_at")
            .in_(
                "event_type",
                ["analysis_started", "analysis_completed", "analysis_failed"],
            )
            .gte("created_at", start_str)
            .execute()
        )
    )

    daily_stats: dict[str, dict[str, int]] = defaultdict(
        lambda: {"started": 0, "completed": 0, "failed": 0}
    )

    for row in result.data or []:
        event_data = row.get("event_data") or {}
        if event_data.get("feature_type") != feature_type:
            continue

        event_type = row.get("event_type", "")
        date_str = row.get("created_at", "")[:10]

        if event_type == "analysis_started":
            daily_stats[date_str]["started"] += 1
        elif event_type == "analysis_completed":
            daily_stats[date_str]["completed"] += 1
        elif event_type == "analysis_failed":
            daily_stats[date_str]["failed"] += 1

    date_range = []
    current = start_date
    while current <= end_date:
        date_range.append(current.strftime("%Y-%m-%d"))
        current += timedelta(days=1)

    trend = [
        {
            "date": d,
            "started": daily_stats[d]["started"],
            "completed": daily_stats[d]["completed"],
            "failed": daily_stats[d]["failed"],
        }
        for d in date_range
    ]

    return {"trend": trend, "feature_type": feature_type, "days": days}


@router.get("/analytics/llm-stats", response_model=LLMStatsResponse)
async def get_llm_stats(
    days: int = Query(default=30, ge=0, le=3650), admin_id: str = Depends(require_admin)
):
    from collections import defaultdict

    end_date = datetime.now(timezone.utc).date()
    if days == 0:
        start_date = datetime(2020, 1, 1, tzinfo=timezone.utc).date()
    else:
        start_date = (datetime.now(timezone.utc) - timedelta(days=days)).date()

    result = await db_execute(
        lambda: (
            supabase.table("analytics_llm_daily")
            .select(
                "date, provider, model, call_count, success_count, failure_count, avg_tokens"
            )
            .gte("date", start_date.isoformat())
            .lte("date", end_date.isoformat())
            .order("date")
            .execute()
        )
    )

    model_stats_map: dict[tuple[str, str], dict[str, int]] = defaultdict(
        lambda: {
            "call_count": 0,
            "success_count": 0,
            "failure_count": 0,
            "weighted_tokens": 0,
        }
    )
    daily_stats_map: dict[str, dict[str, int]] = defaultdict(
        lambda: {
            "call_count": 0,
            "success_count": 0,
            "failure_count": 0,
            "weighted_tokens": 0,
        }
    )

    for row in result.data or []:
        date_str = str(row.get("date", ""))
        if not date_str:
            continue

        provider = row.get("provider", "unknown") or "unknown"
        model = row.get("model", "unknown") or "unknown"
        call_count = row.get("call_count", 0) or 0
        success_count = row.get("success_count", 0) or 0
        failure_count = row.get("failure_count", 0) or 0
        avg_tokens = row.get("avg_tokens", 0) or 0
        weighted_tokens = avg_tokens * call_count

        model_key = (provider, model)
        model_stats_map[model_key]["call_count"] += call_count
        model_stats_map[model_key]["success_count"] += success_count
        model_stats_map[model_key]["failure_count"] += failure_count
        model_stats_map[model_key]["weighted_tokens"] += weighted_tokens

        daily_stats_map[date_str]["call_count"] += call_count
        daily_stats_map[date_str]["success_count"] += success_count
        daily_stats_map[date_str]["failure_count"] += failure_count
        daily_stats_map[date_str]["weighted_tokens"] += weighted_tokens

    model_stats: list[dict[str, Any]] = []
    for (provider, model), aggregated in model_stats_map.items():
        total_calls = aggregated["call_count"]
        success_count = aggregated["success_count"]
        failure_count = aggregated["failure_count"]
        total_finished = success_count + failure_count
        success_rate = (
            round(success_count / total_finished * 100, 2)
            if total_finished > 0
            else 0.0
        )
        avg_tokens = (
            round(aggregated["weighted_tokens"] / total_calls) if total_calls > 0 else 0
        )

        model_stats.append(
            {
                "provider": provider,
                "model": model,
                "call_count": total_calls,
                "success_count": success_count,
                "failure_count": failure_count,
                "avg_tokens": avg_tokens,
                "success_rate": success_rate,
            }
        )

    model_stats.sort(key=lambda item: item["call_count"], reverse=True)

    date_range: list[str] = []
    current = start_date
    while current <= end_date:
        date_range.append(current.isoformat())
        current += timedelta(days=1)

    daily_trend: list[dict[str, Any]] = []
    for date_str in date_range:
        aggregated = daily_stats_map[date_str]
        total_calls = aggregated["call_count"]
        avg_tokens = (
            round(aggregated["weighted_tokens"] / total_calls) if total_calls > 0 else 0
        )

        daily_trend.append(
            {
                "date": date_str,
                "call_count": total_calls,
                "success_count": aggregated["success_count"],
                "failure_count": aggregated["failure_count"],
                "avg_tokens": avg_tokens,
            }
        )

    return {
        "days": days,
        "models": model_stats,
        "daily_trend": daily_trend,
    }


@router.get("/analytics/top-users")
async def get_top_users(
    days: int = Query(default=30, ge=0, le=3650),
    limit: int = Query(default=20, ge=1, le=100),
    feature_type: Optional[str] = Query(
        default=None, pattern="^(reading|flow_ai_advice|compatibility|ai_chat)$"
    ),
    admin_id: str = Depends(require_admin),
):
    from datetime import timezone
    from collections import defaultdict

    if days == 0:
        start_date = datetime(2020, 1, 1, tzinfo=timezone.utc)
    else:
        start_date = datetime.now(timezone.utc) - timedelta(days=days)
    start_str = start_date.isoformat()

    result = await db_execute(
        lambda: (
            supabase.table("analytics_events")
            .select("user_id, event_data")
            .eq("event_type", "analysis_completed")
            .gte("created_at", start_str)
            .execute()
        )
    )

    user_counts: dict[str, int] = defaultdict(int)

    for row in result.data or []:
        user_id = row.get("user_id")
        if not user_id:
            continue

        if feature_type:
            event_data = row.get("event_data") or {}
            if event_data.get("feature_type") != feature_type:
                continue

        user_counts[user_id] += 1

    sorted_users = sorted(user_counts.items(), key=lambda x: x[1], reverse=True)[:limit]

    if not sorted_users:
        return {"users": [], "days": days, "feature_type": feature_type}

    user_ids = [u[0] for u in sorted_users]
    users_result = await db_execute(
        lambda: (
            supabase.table("users")
            .select(
                "id, user_identities(provider, name_ct, name_iv, name_tag, email_ct, email_iv, email_tag, key_id)"
            )
            .in_("id", user_ids)
            .execute()
        )
    )

    user_info_map = {}
    for u in users_result.data or []:
        identity = u.get("user_identities")
        name = None
        email = None
        if isinstance(identity, list) and len(identity) > 0:
            ident = identity[0]
            if ident.get("name_ct") and ident.get("name_iv") and ident.get("name_tag"):
                try:
                    name = crypto_manager.decrypt_field(
                        table="user_identities",
                        column="name",
                        iv=ident["name_iv"],
                        ciphertext=ident["name_ct"],
                        tag=ident["name_tag"],
                        key_id=ident.get("key_id"),
                    )
                except Exception:
                    name = "(복호화 실패)"
            if (
                ident.get("email_ct")
                and ident.get("email_iv")
                and ident.get("email_tag")
            ):
                try:
                    email = crypto_manager.decrypt_field(
                        table="user_identities",
                        column="email",
                        iv=ident["email_iv"],
                        ciphertext=ident["email_ct"],
                        tag=ident["email_tag"],
                        key_id=ident.get("key_id"),
                    )
                except Exception:
                    email = "(복호화 실패)"
        user_info_map[u["id"]] = {"name": name, "email": email}

    users = []
    for user_id, count in sorted_users:
        user_info = user_info_map.get(user_id, {})
        users.append(
            {
                "user_id": user_id,
                "name": user_info.get("name"),
                "email": user_info.get("email"),
                "analysis_count": count,
            }
        )

    return {"users": users, "days": days, "feature_type": feature_type}


@router.get("/analytics/revenue-by-feature")
async def get_revenue_by_feature(
    days: int = Query(default=30, ge=0, le=3650), admin_id: str = Depends(require_admin)
):
    from datetime import timezone
    from collections import defaultdict

    if days == 0:
        start_date = datetime(2020, 1, 1, tzinfo=timezone.utc)
    else:
        start_date = datetime.now(timezone.utc) - timedelta(days=days)
    start_str = start_date.isoformat()

    result = await db_execute(
        lambda: (
            supabase.table("coin_transactions")
            .select("amount, reference_type")
            .eq("type", "spend")
            .gte("created_at", start_str)
            .execute()
        )
    )

    revenue_by_feature: dict[str, int] = defaultdict(int)

    for row in result.data or []:
        reference_type = row.get("reference_type", "unknown")
        amount = row.get("amount", 0)
        revenue_by_feature[reference_type] += amount

    features = ["reading_reanalyze", "flow_ai_advice", "compatibility", "ai_chat"]
    revenue_stats = [
        {"feature_type": f, "total_coins": revenue_by_feature.get(f, 0)}
        for f in features
    ]

    return {"revenue": revenue_stats, "days": days}


@router.get("/revenue/trend")
async def get_revenue_trend(
    days: int = Query(default=7, ge=0, le=3650), admin_id: str = Depends(require_admin)
):
    from datetime import timezone
    from collections import defaultdict

    end_date = datetime.now(timezone.utc)
    if days == 0:
        start_date = datetime(2020, 1, 1, tzinfo=timezone.utc)
    else:
        start_date = end_date - timedelta(days=days)
    start_str = start_date.isoformat()

    result = await db_execute(
        lambda: (
            supabase.table("payments")
            .select("amount, created_at")
            .eq("status", "done")
            .gte("created_at", start_str)
            .execute()
        )
    )

    daily_revenue: dict[str, int] = defaultdict(int)
    daily_count: dict[str, int] = defaultdict(int)
    for row in result.data or []:
        date_str = row.get("created_at", "")[:10]
        if date_str:
            daily_revenue[date_str] += row.get("amount", 0)
            daily_count[date_str] += 1

    date_range = []
    current = start_date
    while current <= end_date:
        date_range.append(current.strftime("%Y-%m-%d"))
        current += timedelta(days=1)

    trend = [
        {
            "date": d[-5:],
            "revenue": daily_revenue.get(d, 0),
            "transactions": daily_count.get(d, 0),
        }
        for d in date_range
    ]

    total = sum(daily_revenue.values())
    prev_period_total = 0
    if days > 0:
        prev_start = start_date - timedelta(days=days)
        prev_result = await db_execute(
            lambda: (
                supabase.table("payments")
                .select("amount")
                .eq("status", "done")
                .gte("created_at", prev_start.isoformat())
                .lt("created_at", start_str)
                .execute()
            )
        )
        prev_period_total = sum(r.get("amount", 0) for r in (prev_result.data or []))

    change_percent = 0.0
    if prev_period_total > 0:
        change_percent = round((total - prev_period_total) / prev_period_total * 100, 1)
    elif total > 0:
        change_percent = 100.0

    return {
        "trend": trend,
        "total": total,
        "prev_total": prev_period_total,
        "change_percent": change_percent,
        "days": days,
    }


@router.get("/kpi/overview")
async def get_kpi_overview(
    days: int = Query(default=7, ge=0, le=3650), admin_id: str = Depends(require_admin)
):
    from datetime import timezone

    end_date = datetime.now(timezone.utc)
    today = end_date.date()
    yesterday = today - timedelta(days=1)

    if days == 0:
        start_date = datetime(2020, 1, 1, tzinfo=timezone.utc)
    else:
        start_date = end_date - timedelta(days=days)
    start_str = start_date.isoformat()
    prev_start = start_date - timedelta(days=max(days, 1))
    prev_str = prev_start.isoformat()

    (
        current_revenue,
        prev_revenue,
        current_signups,
        prev_signups,
        current_dau,
        prev_dau,
        current_analysis_ok,
        current_analysis_fail,
        prev_analysis_ok,
        prev_analysis_fail,
        current_errors,
        prev_errors,
        current_first_payers,
        current_total_payers,
    ) = await asyncio.gather(
        db_execute(
            lambda: (
                supabase.table("payments")
                .select("amount")
                .eq("status", "done")
                .gte("created_at", start_str)
                .execute()
            )
        ),
        db_execute(
            lambda: (
                supabase.table("payments")
                .select("amount")
                .eq("status", "done")
                .gte("created_at", prev_str)
                .lt("created_at", start_str)
                .execute()
            )
        ),
        db_execute(
            lambda: (
                supabase.table("users")
                .select("id", count="exact")
                .gte("created_at", start_str)
                .execute()
            )
        ),
        db_execute(
            lambda: (
                supabase.table("users")
                .select("id", count="exact")
                .gte("created_at", prev_str)
                .lt("created_at", start_str)
                .execute()
            )
        ),
        db_execute(
            lambda: (
                supabase.table("analytics_events")
                .select("user_id")
                .eq("event_type", "page_view")
                .gte("created_at", today.isoformat())
                .execute()
            )
        ),
        db_execute(
            lambda: (
                supabase.table("analytics_events")
                .select("user_id")
                .eq("event_type", "page_view")
                .gte("created_at", yesterday.isoformat())
                .lt("created_at", today.isoformat())
                .execute()
            )
        ),
        db_execute(
            lambda: (
                supabase.table("analytics_events")
                .select("id", count="exact")
                .eq("event_type", "analysis_completed")
                .gte("created_at", start_str)
                .execute()
            )
        ),
        db_execute(
            lambda: (
                supabase.table("analytics_events")
                .select("id", count="exact")
                .eq("event_type", "analysis_failed")
                .gte("created_at", start_str)
                .execute()
            )
        ),
        db_execute(
            lambda: (
                supabase.table("analytics_events")
                .select("id", count="exact")
                .eq("event_type", "analysis_completed")
                .gte("created_at", prev_str)
                .lt("created_at", start_str)
                .execute()
            )
        ),
        db_execute(
            lambda: (
                supabase.table("analytics_events")
                .select("id", count="exact")
                .eq("event_type", "analysis_failed")
                .gte("created_at", prev_str)
                .lt("created_at", start_str)
                .execute()
            )
        ),
        db_execute(
            lambda: (
                supabase.table("analytics_events")
                .select("id", count="exact")
                .eq("event_type", "analysis_failed")
                .gte("created_at", start_str)
                .execute()
            )
        ),
        db_execute(
            lambda: (
                supabase.table("analytics_events")
                .select("id", count="exact")
                .eq("event_type", "analysis_failed")
                .gte("created_at", prev_str)
                .lt("created_at", start_str)
                .execute()
            )
        ),
        db_execute(
            lambda: (
                supabase.table("payments")
                .select("user_id")
                .eq("status", "done")
                .gte("created_at", start_str)
                .execute()
            )
        ),
        db_execute(
            lambda: (
                supabase.table("users")
                .select("id", count="exact")
                .gte("created_at", start_str)
                .execute()
            )
        ),
    )

    def _calc_change(current_val: float, prev_val: float) -> float:
        if prev_val == 0:
            return 100.0 if current_val > 0 else 0.0
        return round((current_val - prev_val) / prev_val * 100, 1)

    rev_current = sum(r.get("amount", 0) for r in (current_revenue.data or []))
    rev_prev = sum(r.get("amount", 0) for r in (prev_revenue.data or []))

    signups_current = current_signups.count or 0
    signups_prev = prev_signups.count or 0

    dau_today = len(
        set(e.get("user_id") for e in (current_dau.data or []) if e.get("user_id"))
    )
    dau_yesterday = len(
        set(e.get("user_id") for e in (prev_dau.data or []) if e.get("user_id"))
    )

    ok_current = current_analysis_ok.count or 0
    fail_current = current_analysis_fail.count or 0
    ok_prev = prev_analysis_ok.count or 0
    fail_prev = prev_analysis_fail.count or 0

    total_current = ok_current + fail_current
    total_prev = ok_prev + fail_prev
    success_rate = (
        round(ok_current / total_current * 100, 1) if total_current > 0 else 0.0
    )
    success_rate_prev = round(ok_prev / total_prev * 100, 1) if total_prev > 0 else 0.0

    errors_current = current_errors.count or 0
    errors_prev = prev_errors.count or 0

    unique_payers = len(
        set(
            p.get("user_id")
            for p in (current_first_payers.data or [])
            if p.get("user_id")
        )
    )
    total_for_conv = current_total_payers.count or 0
    conversion_rate = (
        round(unique_payers / total_for_conv * 100, 1) if total_for_conv > 0 else 0.0
    )

    return {
        "new_users": signups_current,
        "new_users_change": _calc_change(signups_current, signups_prev),
        "dau": dau_today,
        "dau_change": _calc_change(dau_today, dau_yesterday),
        "revenue": rev_current,
        "revenue_change": _calc_change(rev_current, rev_prev),
        "success_rate": success_rate,
        "success_rate_change": round(success_rate - success_rate_prev, 1),
        "error_count": errors_current,
        "error_count_change": _calc_change(errors_current, errors_prev),
        "conversion_rate": conversion_rate,
        "unique_payers": unique_payers,
        "total_signups": total_for_conv,
        "period_days": days,
    }


@router.post("/analytics/aggregate")
async def trigger_aggregation(admin_id: str = Depends(require_admin)):
    from datetime import timezone

    today = datetime.now(timezone.utc).date()

    try:
        await db_execute(
            lambda: supabase.rpc(
                "aggregate_daily_analytics", {"p_date": today.isoformat()}
            ).execute()
        )
        await db_execute(
            lambda: supabase.rpc(
                "aggregate_llm_daily", {"p_date": today.isoformat()}
            ).execute()
        )

        await log_admin_action(
            admin_id=admin_id,
            action="analytics.aggregate",
            target_type="analytics_daily",
            target_id=today.isoformat(),
        )

        return {"status": "success", "date": today.isoformat()}
    except Exception:
        logger.exception(
            "[ADMIN ANALYTICS] 집계 실패: admin_id=%s date=%s",
            admin_id,
            today.isoformat(),
        )
        raise HTTPException(status_code=500, detail="집계 처리 중 오류가 발생했습니다")


def _calc_rate(current: int, previous: int) -> float:
    if previous <= 0:
        return 100.0 if current > 0 else 0.0
    return round(current / previous * 100, 1)


def _format_seconds(milliseconds: float) -> str:
    if milliseconds >= 1000:
        return f"{round(milliseconds / 1000, 1)}초"
    return f"{round(milliseconds, 1)}ms"


async def _build_tracking_report_payload() -> dict[str, Any]:
    (
        analytics_events_result,
        analytics_daily_result,
        page_views_daily_result,
        feature_usage_daily_result,
        session_funnel_result,
        tab_engagement_result,
        payments_result,
        readings_result,
        users_result,
    ) = await asyncio.gather(
        db_execute(
            lambda: (
                supabase.table("analytics_events")
                .select("event_type,event_data,user_id,session_id")
                .execute()
            )
        ),
        db_execute(
            lambda: (
                supabase.table("analytics_daily")
                .select(
                    "date,dau,new_users,total_revenue,total_readings,page_views,error_count,avg_response_time_ms"
                )
                .order("date")
                .execute()
            )
        ),
        db_execute(
            lambda: (
                supabase.table("analytics_page_views_daily")
                .select("page_name,view_count,unique_visitors")
                .execute()
            )
        ),
        db_execute(
            lambda: (
                supabase.table("feature_usage_daily")
                .select("feature_name,usage_count,unique_users")
                .execute()
            )
        ),
        db_execute(
            lambda: (
                supabase.table("session_funnel_events")
                .select("session_id,step")
                .execute()
            )
        ),
        db_execute(
            lambda: (
                supabase.table("tab_engagement_events")
                .select("tab_name,dwell_ms,is_bounce")
                .execute()
            )
        ),
        db_execute(
            lambda: (
                supabase.table("payments")
                .select("user_id,status,amount,coin_amount")
                .execute()
            )
        ),
        db_execute(lambda: supabase.table("user_readings").select("user_id").execute()),
        db_execute(lambda: supabase.table("users").select("id").execute()),
    )

    analytics_events = (
        analytics_events_result.data
        if isinstance(analytics_events_result.data, list)
        else []
    )
    analytics_daily = (
        analytics_daily_result.data
        if isinstance(analytics_daily_result.data, list)
        else []
    )
    page_views_daily = (
        page_views_daily_result.data
        if isinstance(page_views_daily_result.data, list)
        else []
    )
    feature_usage_daily = (
        feature_usage_daily_result.data
        if isinstance(feature_usage_daily_result.data, list)
        else []
    )
    session_funnel_rows = (
        session_funnel_result.data
        if isinstance(session_funnel_result.data, list)
        else []
    )
    tab_engagement_rows = (
        tab_engagement_result.data
        if isinstance(tab_engagement_result.data, list)
        else []
    )
    payment_rows = (
        payments_result.data if isinstance(payments_result.data, list) else []
    )
    reading_rows = (
        readings_result.data if isinstance(readings_result.data, list) else []
    )
    user_rows = users_result.data if isinstance(users_result.data, list) else []

    event_counts: dict[str, int] = {}
    tracked_users: set[str] = set()
    tracked_sessions: set[str] = set()
    charge_view_users: set[str] = set()

    for row in analytics_events:
        if not isinstance(row, dict):
            continue

        event_type = str(row.get("event_type") or "unknown")
        event_counts[event_type] = event_counts.get(event_type, 0) + 1

        user_id = row.get("user_id")
        if isinstance(user_id, str) and user_id:
            tracked_users.add(user_id)

        session_id = row.get("session_id")
        if isinstance(session_id, str) and session_id:
            tracked_sessions.add(session_id)

        event_data = row.get("event_data")
        event_data_map = event_data if isinstance(event_data, dict) else {}

        if event_type == "page_view":
            if (
                event_data_map.get("page") == "charge"
                and isinstance(user_id, str)
                and user_id
            ):
                charge_view_users.add(user_id)

    page_rollups: dict[str, dict[str, int]] = {}
    for row in page_views_daily:
        if not isinstance(row, dict):
            continue
        page_name = str(row.get("page_name") or "unknown")
        rollup = page_rollups.setdefault(page_name, {"views": 0, "visitors": 0})
        rollup["views"] += int(row.get("view_count") or 0)
        rollup["visitors"] += int(row.get("unique_visitors") or 0)

    page_focus = [
        {
            "page": page,
            "views": values["views"],
            "visitors": values["visitors"],
        }
        for page, values in sorted(
            page_rollups.items(), key=lambda item: item[1]["views"], reverse=True
        )[:5]
    ]

    feature_rollups: dict[str, dict[str, int]] = {}
    for row in feature_usage_daily:
        if not isinstance(row, dict):
            continue
        feature_name = str(row.get("feature_name") or "unknown")
        rollup = feature_rollups.setdefault(
            feature_name,
            {
                "usage_count": 0,
                "unique_users": 0,
            },
        )
        rollup["usage_count"] += int(row.get("usage_count") or 0)
        rollup["unique_users"] += int(row.get("unique_users") or 0)

    core_feature_usage = feature_rollups.get("reading", {}).get("usage_count", 0)
    secondary_feature_usage = sum(
        values["usage_count"]
        for feature_name, values in feature_rollups.items()
        if feature_name != "reading"
    )

    feature_focus: list[dict[str, Any]] = []
    for feature_name, values in sorted(
        feature_rollups.items(), key=lambda item: item[1]["usage_count"], reverse=True
    )[:5]:
        usage_count = values["usage_count"]
        unique_users = values["unique_users"]
        if feature_name == "reading":
            insight = "서비스 가치가 메인 사주 분석에 강하게 집중되어 있습니다."
        elif usage_count <= 2:
            insight = "체험 단계에 머물러 있어 진입 문구나 노출 위치 조정이 필요합니다."
        else:
            insight = "관심은 있지만 아직 메인 기능만큼 반복 사용되지는 않습니다."

        feature_focus.append(
            {
                "feature": feature_name,
                "usage_count": usage_count,
                "unique_users": unique_users,
                "insight": insight,
            }
        )

    tab_rollups: dict[str, dict[str, float]] = {}
    for row in tab_engagement_rows:
        if not isinstance(row, dict):
            continue
        tab_name = str(row.get("tab_name") or "unknown")
        rollup = tab_rollups.setdefault(
            tab_name,
            {"event_count": 0.0, "dwell_sum": 0.0, "bounce_count": 0.0},
        )
        rollup["event_count"] += 1
        dwell_ms = row.get("dwell_ms") or 0
        if isinstance(dwell_ms, str):
            try:
                dwell_ms = float(dwell_ms)
            except ValueError:
                dwell_ms = 0
        rollup["dwell_sum"] += float(dwell_ms or 0)
        if bool(row.get("is_bounce")):
            rollup["bounce_count"] += 1

    tab_insights: list[dict[str, Any]] = []
    for tab_name, values in sorted(
        tab_rollups.items(),
        key=lambda item: (
            item[1]["dwell_sum"] / item[1]["event_count"]
            if item[1]["event_count"]
            else 0
        ),
        reverse=True,
    )[:6]:
        event_count = int(values["event_count"])
        avg_dwell_seconds = (
            round(values["dwell_sum"] / values["event_count"] / 1000, 1)
            if values["event_count"]
            else 0.0
        )
        bounce_rate = (
            round(values["bounce_count"] / values["event_count"] * 100, 1)
            if values["event_count"]
            else 0.0
        )

        if avg_dwell_seconds >= 90 and bounce_rate <= 20:
            insight = "깊게 읽히는 강점 탭입니다. 후속 유료 기능 연결 지점으로 우선 검토할 만합니다."
        elif bounce_rate >= 40:
            insight = "첫 화면 만족도가 낮아 보입니다. 요약 문구와 초기 카드 구조를 다시 다듬는 편이 좋습니다."
        else:
            insight = (
                "관심은 있지만 메시지 선명도나 CTA 연결은 더 손볼 여지가 있습니다."
            )

        tab_insights.append(
            {
                "tab_name": tab_name,
                "event_count": event_count,
                "avg_dwell_seconds": avg_dwell_seconds,
                "bounce_rate": bounce_rate,
                "insight": insight,
            }
        )

    session_step_sessions: dict[str, set[str]] = {}
    for row in session_funnel_rows:
        if not isinstance(row, dict):
            continue
        step = str(row.get("step") or "unknown")
        session_id = row.get("session_id")
        if not isinstance(session_id, str) or not session_id:
            continue
        session_step_sessions.setdefault(step, set()).add(session_id)

    input_sessions = len(session_step_sessions.get("input_started", set()))
    result_sessions = len(session_step_sessions.get("result_received", set()))
    tab_clicked_sessions = len(session_step_sessions.get("tab_clicked", set()))
    saved_sessions = len(session_step_sessions.get("profile_saved", set()))

    reading_counts_by_user: dict[str, int] = {}
    for row in reading_rows:
        if not isinstance(row, dict):
            continue
        user_id = row.get("user_id")
        if not isinstance(user_id, str) or not user_id:
            continue
        reading_counts_by_user[user_id] = reading_counts_by_user.get(user_id, 0) + 1

    payment_rollups: dict[str, Any] = {
        "done_count": 0,
        "failed_count": 0,
        "pending_count": 0,
        "done_amount": 0,
    }
    done_payers: set[str] = set()
    paid_amount_by_user: dict[str, int] = {}
    payment_count_by_user: dict[str, int] = {}
    for row in payment_rows:
        if not isinstance(row, dict):
            continue
        status = str(row.get("status") or "unknown")
        amount = int(row.get("amount") or 0)
        user_id = row.get("user_id")
        if status == "done":
            payment_rollups["done_count"] += 1
            payment_rollups["done_amount"] += amount
            if isinstance(user_id, str) and user_id:
                done_payers.add(user_id)
                payment_count_by_user[user_id] = (
                    payment_count_by_user.get(user_id, 0) + 1
                )
                paid_amount_by_user[user_id] = (
                    paid_amount_by_user.get(user_id, 0) + amount
                )
        elif status == "failed":
            payment_rollups["failed_count"] += 1
        elif status == "pending":
            payment_rollups["pending_count"] += 1

    payer_segment_users = {
        "non_payer": 0,
        "one_time_payer": 0,
        "repeat_payer": 0,
    }
    payer_segment_readings = {
        "non_payer": 0,
        "one_time_payer": 0,
        "repeat_payer": 0,
    }
    payer_segment_amounts = {
        "non_payer": 0,
        "one_time_payer": 0,
        "repeat_payer": 0,
    }

    all_user_ids = [
        str(row.get("id"))
        for row in user_rows
        if isinstance(row, dict) and isinstance(row.get("id"), str)
    ]
    for user_id in all_user_ids:
        paid_orders = payment_count_by_user.get(user_id, 0)
        if paid_orders <= 0:
            segment = "non_payer"
        elif paid_orders == 1:
            segment = "one_time_payer"
        else:
            segment = "repeat_payer"

        payer_segment_users[segment] += 1
        payer_segment_readings[segment] += reading_counts_by_user.get(user_id, 0)
        payer_segment_amounts[segment] += paid_amount_by_user.get(user_id, 0)

    segment_labels = {
        "non_payer": "무과금 사용자",
        "one_time_payer": "1회 결제 사용자",
        "repeat_payer": "반복 결제 사용자",
    }
    payer_segments: list[dict[str, Any]] = []
    for segment_key in ("non_payer", "one_time_payer", "repeat_payer"):
        users = payer_segment_users[segment_key]
        avg_readings = (
            round(payer_segment_readings[segment_key] / users, 1) if users else 0.0
        )
        avg_paid_amount = (
            round(payer_segment_amounts[segment_key] / users, 1) if users else 0.0
        )
        if segment_key == "repeat_payer" and users > 0:
            insight = "반복 결제 사용자는 소수지만 재방문·재분석 빈도가 매우 높습니다."
        elif segment_key == "non_payer":
            insight = "대부분의 사용자가 아직 무료 경험 단계에 머물러 있습니다."
        else:
            insight = (
                "한 번 결제까지는 진입하지만 재결제로 이어지는 흐름은 더 약합니다."
            )

        payer_segments.append(
            {
                "segment": segment_labels[segment_key],
                "users": users,
                "avg_readings": avg_readings,
                "avg_paid_amount": avg_paid_amount,
                "insight": insight,
            }
        )

    avg_response_values = [
        float(row.get("avg_response_time_ms") or 0)
        for row in analytics_daily
        if isinstance(row, dict) and float(row.get("avg_response_time_ms") or 0) > 0
    ]
    avg_response_ms = (
        round(sum(avg_response_values) / len(avg_response_values), 2)
        if avg_response_values
        else 0.0
    )
    max_response_ms = round(max(avg_response_values), 2) if avg_response_values else 0.0

    peak_page_day = None
    peak_revenue_day = None
    if analytics_daily:
        peak_page_day = max(
            (row for row in analytics_daily if isinstance(row, dict)),
            key=lambda row: int(row.get("page_views") or 0),
            default=None,
        )
        peak_revenue_day = max(
            (row for row in analytics_daily if isinstance(row, dict)),
            key=lambda row: int(row.get("total_revenue") or 0),
            default=None,
        )

    page_view_count = event_counts.get("page_view", 0)
    login_success_count = event_counts.get("login_success", 0)
    analysis_started_count = event_counts.get("analysis_started", 0)
    analysis_completed_count = event_counts.get("analysis_completed", 0)
    coin_purchased_count = event_counts.get("coin_purchased", 0)
    charge_view_overlap = len(charge_view_users.intersection(done_payers))
    share_created_count = event_counts.get("share_created", 0)
    share_viewed_count = event_counts.get("share_viewed", 0)
    share_converted_count = event_counts.get("share_converted", 0)

    executive_summary = "메인 사주 분석은 분명한 코어 가치로 작동하지만, 성능 지연과 부가 기능 확장이 아직 제품 성장의 병목으로 보입니다."
    executive_subtitle = (
        f"전체 {len(tracked_users)}명 추적 사용자와 {len(tracked_sessions)}개 세션, {len(analytics_events)}개 이벤트 기준입니다. "
        f"메인 분석 사용 {core_feature_usage}회 대비 부가 기능 사용은 {secondary_feature_usage}회에 그쳐 활용 편중이 큽니다."
    )

    journey_funnel = [
        {
            "name": "방문 이벤트",
            "count": page_view_count,
            "conversion_rate": 100.0 if page_view_count > 0 else 0.0,
            "note": "page_view 이벤트 수 기준입니다.",
        },
        {
            "name": "로그인 성공",
            "count": login_success_count,
            "conversion_rate": _calc_rate(login_success_count, page_view_count),
            "note": "방문 대비 strict user conversion은 아닙니다.",
        },
        {
            "name": "분석 시작",
            "count": analysis_started_count,
            "conversion_rate": _calc_rate(analysis_started_count, login_success_count),
            "note": "analysis_started 이벤트 기준입니다.",
        },
        {
            "name": "분석 완료",
            "count": analysis_completed_count,
            "conversion_rate": _calc_rate(
                analysis_completed_count, analysis_started_count
            ),
            "note": "시작 이후 완료 전환은 해석 신뢰도가 가장 높습니다.",
        },
        {
            "name": "구매 이벤트",
            "count": coin_purchased_count,
            "conversion_rate": _calc_rate(
                coin_purchased_count, analysis_completed_count
            ),
            "note": "coin_purchased 이벤트 수 기준입니다.",
        },
    ]

    kpis = [
        {
            "key": "tracked_users",
            "label": "추적 사용자",
            "value": f"{len(tracked_users)}명",
            "context": f"총 {len(tracked_sessions)}세션 / {len(analytics_events)}이벤트",
            "tone": "neutral",
        },
        {
            "key": "core_activation",
            "label": "핵심 완료율",
            "value": f"{_calc_rate(analysis_completed_count, analysis_started_count)}%",
            "context": f"분석 시작 {analysis_started_count}건 → 완료 {analysis_completed_count}건",
            "tone": "positive",
        },
        {
            "key": "core_focus",
            "label": "코어 기능 집중도",
            "value": f"reading {core_feature_usage}회",
            "context": f"기타 기능 합계 {secondary_feature_usage}회",
            "tone": "warning",
        },
        {
            "key": "monetization_overlap",
            "label": "충전 관심 대비 결제",
            "value": f"{charge_view_overlap}/{len(charge_view_users)}명",
            "context": f"완료 결제 사용자 {len(done_payers)}명",
            "tone": "neutral",
        },
        {
            "key": "response_time",
            "label": "평균 응답시간",
            "value": _format_seconds(avg_response_ms),
            "context": f"관측 최대 {_format_seconds(max_response_ms)}",
            "tone": "critical" if avg_response_ms >= 60000 else "warning",
        },
    ]

    session_quality_detail = (
        f"session_funnel_events 기준으로 input_started 세션 {input_sessions}개보다 result_received 세션 {result_sessions}개가 더 많아 "
        "strict funnel 해석에는 주의가 필요합니다."
    )

    risks = [
        {
            "title": "응답속도 리스크",
            "summary": "분석 응답이 자주 수십 초에서 수분대까지 늘어집니다.",
            "detail": f"analytics_daily 기준 평균 응답시간은 {_format_seconds(avg_response_ms)}, 관측 최대는 {_format_seconds(max_response_ms)}입니다.",
            "tone": "critical",
        },
        {
            "title": "기능 편중 리스크",
            "summary": "사용 가치가 reading 하나에 과도하게 몰려 있습니다.",
            "detail": f"reading {core_feature_usage}회 대비 compatibility {feature_rollups.get('compatibility', {}).get('usage_count', 0)}회, flow_ai_advice {feature_rollups.get('flow_ai_advice', {}).get('usage_count', 0)}회, ai_chat {feature_rollups.get('ai_chat', {}).get('usage_count', 0)}회입니다.",
            "tone": "warning",
        },
        {
            "title": "계측 정합성 리스크",
            "summary": "퍼널 지표 중 일부는 strict user funnel로 보기 어렵습니다.",
            "detail": session_quality_detail,
            "tone": "warning",
        },
        {
            "title": "공유 전환 정체",
            "summary": "공유는 발생하지만 가입 전환으로 이어진 흔적은 아직 없습니다.",
            "detail": f"share_created {share_created_count}건, share_viewed {share_viewed_count}건, share_converted {share_converted_count}건입니다.",
            "tone": "warning",
        },
    ]

    opportunities = [
        {
            "title": "핵심 경험의 강한 완료 신호",
            "summary": "한번 분석을 시작하면 대부분 결과까지 도달합니다.",
            "detail": f"analysis_started {analysis_started_count}건 대비 analysis_completed {analysis_completed_count}건으로 완료율 {_calc_rate(analysis_completed_count, analysis_started_count)}%입니다.",
            "tone": "positive",
        },
        {
            "title": "깊게 읽히는 탭 존재",
            "summary": "love와 life 계열 콘텐츠는 상대적으로 오래 읽힙니다.",
            "detail": "고체류·저이탈 탭을 기준으로 유료 전환 또는 후속 추천 흐름을 설계할 여지가 있습니다.",
            "tone": "positive",
        },
        {
            "title": "결제 관심자는 실제 구매로도 이어집니다.",
            "summary": "charge 페이지에 진입한 사용자 중 상당수가 실제 결제 사용자와 겹칩니다.",
            "detail": f"charge page 추적 사용자 {len(charge_view_users)}명 중 완료 결제 사용자와 겹치는 사용자는 {charge_view_overlap}명입니다.",
            "tone": "positive",
        },
        {
            "title": "스파이크 구간 학습 기회",
            "summary": "일부 날짜에 트래픽과 매출이 집중되어 있습니다.",
            "detail": (
                f"가장 큰 페이지뷰 스파이크는 {peak_page_day.get('date')} ({int(peak_page_day.get('page_views') or 0)} page views), "
                f"가장 큰 매출 스파이크는 {peak_revenue_day.get('date')} ({int(peak_revenue_day.get('total_revenue') or 0)}원)입니다."
                if isinstance(peak_page_day, dict)
                and isinstance(peak_revenue_day, dict)
                else "스파이크 날짜의 유입 채널과 메시지를 재분석할 가치가 있습니다."
            ),
            "tone": "positive",
        },
    ]

    recommendations = [
        {
            "priority": "high",
            "title": "분석 응답속도부터 줄이기",
            "rationale": "오류 수치보다 긴 대기시간이 실제 이탈 원인일 가능성이 더 큽니다.",
            "actions": [
                "메인 분석 경로의 평균 응답시간을 단계별로 분해해 병목 구간을 찾기",
                "loading 단계에서 예상 대기시간과 진행상황을 더 명확히 안내하기",
                "느린 케이스를 별도 로그로 남겨 고비용 입력 패턴을 구분하기",
            ],
            "expected_impact": "체감 실패를 줄이고 첫 분석 경험의 완료율을 유지하는 데 가장 직접적입니다.",
        },
        {
            "priority": "high",
            "title": "love·life 강점을 후속 행동으로 연결하기",
            "rationale": "고체류 탭은 이미 관심 신호가 강하므로 후속 CTA를 붙일 때 효율이 높습니다.",
            "actions": [
                "love·life 탭 하단에 궁합/도사Q&A 연결 카드를 배치하기",
                "강한 탭 콘텐츠를 메인 요약 카드 상단에서 미리 예고하기",
                "고체류 탭 진입 후 다음 추천 행동을 한 가지로 단순화하기",
            ],
            "expected_impact": "reading 의존도를 줄이고 부가 기능 사용률을 올리는 데 도움이 됩니다.",
        },
        {
            "priority": "medium",
            "title": "summary·health·lucky 첫 화면 메시지 재작성",
            "rationale": "높은 이탈률은 내용 자체보다 첫 카드 구조나 후킹 문구가 약하다는 신호일 수 있습니다.",
            "actions": [
                "첫 카드에 결론 한 줄과 바로 읽어야 할 포인트를 먼저 제시하기",
                "세부 설명은 접거나 2단으로 나눠 가독성 높이기",
                "탭별 CTA 문구를 비교 테스트할 수 있게 이벤트 이름을 더 정교하게 남기기",
            ],
            "expected_impact": "초기 이탈을 줄이고 유저가 핵심 내용을 읽기 전 떠나는 비율을 낮출 수 있습니다.",
        },
        {
            "priority": "medium",
            "title": "공유와 추천 흐름의 전환 장치 보강",
            "rationale": "공유는 발생하지만 전환이 0인 상태라 메시지와 랜딩 경험을 다시 설계할 필요가 있습니다.",
            "actions": [
                "공유받은 페이지 첫 화면에 가입/내 사주 비교 가치 제안을 더 직접적으로 노출하기",
                "referral CTA와 seasonal banner는 클릭률이 낮으므로 문구를 줄이고 혜택을 선명하게 보이기",
                "share_viewed 이후 가입/분석 시작을 잇는 전용 이벤트를 추가해 끊기는 구간을 정확히 보기",
            ],
            "expected_impact": "바이럴 유입이 실제 신규 사용으로 이어지는 비율을 개선할 수 있습니다.",
        },
    ]

    evidence = [
        {
            "title": "Funnel analysis overview",
            "source": "Amplitude",
            "url": "https://amplitude.com/docs/analytics/charts/funnel-analysis",
            "takeaway": "퍼널은 단계별 drop-off와 단계 간 전환을 분리해서 해석해야 하며, strict order 여부를 명확히 구분해야 합니다.",
            "supports": "핵심 완료율 해석과 계측 정합성 주의",
        },
        {
            "title": "Retention report",
            "source": "Mixpanel",
            "url": "https://docs.mixpanel.com/docs/reports/retention",
            "takeaway": "작은 표본에서는 과한 퍼센트보다 재방문 행동과 세그먼트별 변화 방향을 보는 편이 안전합니다.",
            "supports": "세그먼트 해석과 표본 주의",
        },
        {
            "title": "Sessions and DAU/MAU usage patterns",
            "source": "PostHog",
            "url": "https://posthog.com/docs/data/sessions",
            "takeaway": "세션 깊이와 반복 사용은 기능 가치 판단에 핵심이며, 고빈도 사용자를 별도 세그먼트로 보는 것이 중요합니다.",
            "supports": "반복 결제 사용자와 탭 체류시간 해석",
        },
        {
            "title": "Aligning UX metrics with organizational goals",
            "source": "Nielsen Norman Group",
            "url": "https://www.nngroup.com/articles/ux-metrics-goals/",
            "takeaway": "보여주기 좋은 수치보다 실제 의사결정을 바꾸는 지표를 앞에 배치해야 합니다.",
            "supports": "상단 KPI와 리스크/기회 분리 구조",
        },
        {
            "title": "Predicting customer churn",
            "source": "Amplitude Blog",
            "url": "https://amplitude.com/blog/predicting-customer-churn",
            "takeaway": "성능 저하와 핵심 기능 이탈은 초기 churn 신호가 될 수 있으므로 빠르게 보완해야 합니다.",
            "supports": "성능 개선과 부가 기능 활성화 권고",
        },
    ]

    limitations = [
        "현재 표본은 소규모이며 특정 날짜 스파이크의 영향이 큽니다.",
        "상단 퍼널은 이벤트 수 기반 요약이며 strict user funnel로 해석하면 과장될 수 있습니다.",
        "session_funnel_events는 input_started보다 result_received 세션이 더 많아 정합성 경고가 필요합니다.",
        "error_count가 낮아도 긴 응답시간이 체감 실패를 가릴 수 있습니다.",
        "외부 근거는 제품 분석의 해석 프레임을 제공하는 자료이며, 이 서비스의 절대 벤치마크를 뜻하지는 않습니다.",
    ]

    return {
        "scope_label": "all_time",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "executive_summary": executive_summary,
        "executive_subtitle": executive_subtitle,
        "sample_size": {
            "tracked_users": len(tracked_users),
            "tracked_sessions": len(tracked_sessions),
            "total_events": len(analytics_events),
        },
        "kpis": kpis,
        "journey_funnel": journey_funnel,
        "journey_funnel_note": (
            "방문·로그인·구매는 이벤트 수 기준 요약이며, 시작→완료 구간 외에는 strict user funnel로 해석하지 않는 편이 안전합니다. "
            + session_quality_detail
        ),
        "page_focus": page_focus,
        "feature_focus": feature_focus,
        "tab_insights": tab_insights,
        "payer_segments": payer_segments,
        "risks": risks,
        "opportunities": opportunities,
        "recommendations": recommendations,
        "evidence": evidence,
        "limitations": limitations,
    }


@router.get("/analytics/tracking-report", response_model=TrackingReportResponse)
async def get_tracking_report(admin_id: str = Depends(require_admin)):
    try:
        return await _build_tracking_report_payload()
    except Exception:
        logger.exception(
            "[ADMIN ANALYTICS] tracking report build failed: admin_id=%s",
            admin_id,
        )
        raise HTTPException(
            status_code=500,
            detail="추적 리포트 데이터를 생성하는 중 오류가 발생했습니다",
        )


@router.post("/alerts/check")
async def check_alerts(
    admin_id: str = Depends(require_admin),
    _rl: None = Depends(
        rate_limit_dependency(limit=5, window_seconds=60, scope="admin_alert_check")
    ),
):
    """임계치 체크 및 알림 트리거"""
    from ..services.alert_service import alert_service

    results = await alert_service.check_all_thresholds()
    await log_admin_action(
        admin_id=admin_id,
        action="alert.check",
        target_type="alert",
        metadata={"alerts_triggered": results, "triggered_count": len(results)},
    )
    return {"alerts_triggered": results}


@router.post("/alerts/test")
async def test_alert(
    admin_id: str = Depends(require_admin),
    _rl: None = Depends(
        rate_limit_dependency(limit=5, window_seconds=60, scope="admin_alert_test")
    ),
):
    """테스트 알림 발송"""
    from ..services.slack_service import slack_service

    success = await slack_service.send_message(
        "테스트 알림", "Admin 대시보드에서 테스트 알림을 발송했습니다."
    )
    await log_admin_action(
        admin_id=admin_id,
        action="alert.test",
        target_type="alert",
        target_id="manual_test",
        metadata={"success": success},
    )
    return {"success": success}


@router.post("/alerts/daily-report")
async def send_daily_report(
    admin_id: str = Depends(require_admin),
    _rl: None = Depends(
        rate_limit_dependency(limit=5, window_seconds=60, scope="admin_daily_report")
    ),
):
    """일일 요약 리포트 발송"""
    from ..services.alert_service import alert_service

    success = await alert_service.send_daily_report()
    await log_admin_action(
        admin_id=admin_id,
        action="alert.daily_report",
        target_type="alert",
        metadata={"success": success},
    )
    return {"success": success}


@router.get("/audit-logs")
async def get_audit_logs(
    _admin_id: str = Depends(require_admin),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, le=100),
    action: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
):
    offset = (page - 1) * limit

    def parse_date_boundary(value: str, *, is_end: bool) -> str:
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

    start_iso = parse_date_boundary(start_date, is_end=False) if start_date else None
    end_iso = parse_date_boundary(end_date, is_end=True) if end_date else None

    if start_iso and end_iso and start_iso > end_iso:
        raise HTTPException(
            status_code=400, detail="조회 시작일이 종료일보다 늦을 수 없습니다"
        )

    def build_query():
        query = supabase.table("admin_audit_logs").select(
            "id, admin_id, action, target_type, target_id, reason, before_data, after_data, metadata, created_at",
            count="exact",
        )

        if action:
            query = query.eq("action", action)
        if start_iso:
            query = query.gte("created_at", start_iso)
        if end_iso:
            query = query.lte("created_at", end_iso)

        return (
            query.order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )

    result = await db_execute(build_query)

    return {
        "logs": result.data or [],
        "total": result.count or 0,
        "page": page,
        "limit": limit,
    }


def _is_uuid_string(value: str) -> bool:
    try:
        uuid.UUID(value)
        return True
    except ValueError:
        return False


def _decrypt_identity_name_email(
    identity: Dict[str, Any],
) -> tuple[Optional[str], Optional[str]]:
    name = None
    email = None
    key_id = str(identity.get("key_id") or "v1")

    if identity.get("name_ct") and identity.get("name_iv") and identity.get("name_tag"):
        try:
            name = crypto_manager.decrypt_field(
                table="user_identities",
                column="name",
                iv=identity["name_iv"],
                ciphertext=identity["name_ct"],
                tag=identity["name_tag"],
                key_id=key_id,
            )
        except Exception:
            name = "(복호화 실패)"

    if (
        identity.get("email_ct")
        and identity.get("email_iv")
        and identity.get("email_tag")
    ):
        try:
            email = crypto_manager.decrypt_field(
                table="user_identities",
                column="email",
                iv=identity["email_iv"],
                ciphertext=identity["email_ct"],
                tag=identity["email_tag"],
                key_id=key_id,
            )
        except Exception:
            email = "(복호화 실패)"

    return name, email


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


def _parse_iso_timestamp(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed
    except ValueError:
        return datetime.min.replace(tzinfo=timezone.utc)


@router.get("/activity/search", response_model=ActivitySearchResponse)
async def search_user_activity(
    query: str,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    _admin: str = Depends(require_admin),
    _rl: None = Depends(
        rate_limit_dependency(
            limit=20, window_seconds=60, scope="admin_activity_search"
        )
    ),
):
    search_query = query.strip()
    if not search_query:
        raise HTTPException(status_code=400, detail="검색어를 입력해주세요")

    offset = (page - 1) * limit
    matched_users: List[Dict[str, Any]] = []

    if _is_uuid_string(search_query):
        user_result = await db_execute(
            lambda: (
                supabase.table("users")
                .select(
                    "id, status, user_identities(provider, name_ct, name_iv, name_tag, email_ct, email_iv, email_tag, key_id)"
                )
                .eq("id", search_query)
                .execute()
            )
        )

        for user in user_result.data or []:
            if not isinstance(user, dict):
                continue

            identity_data = user.get("user_identities")
            identity: Dict[str, Any] = {}
            if (
                isinstance(identity_data, list)
                and len(identity_data) > 0
                and isinstance(identity_data[0], dict)
            ):
                identity = identity_data[0]

            name, email = _decrypt_identity_name_email(identity)
            matched_users.append(
                {
                    "id": user.get("id"),
                    "name": name,
                    "email": email,
                    "provider": identity.get("provider"),
                    "status": user.get("status"),
                }
            )
    else:
        identities_result = await db_execute(
            lambda: (
                supabase.table("user_identities")
                .select(
                    "user_id, provider, name_ct, name_iv, name_tag, email_ct, email_iv, email_tag, key_id"
                )
                .execute()
            )
        )

        matched_identity_map: Dict[str, Dict[str, Any]] = {}
        lower_query = search_query.lower()

        for identity in identities_result.data or []:
            if not isinstance(identity, dict):
                continue

            target_user_id = identity.get("user_id")
            if not target_user_id:
                continue

            name, email = _decrypt_identity_name_email(identity)
            if not name:
                continue
            if lower_query not in name.lower():
                continue

            if target_user_id not in matched_identity_map:
                matched_identity_map[target_user_id] = {
                    "id": target_user_id,
                    "name": name,
                    "email": email,
                    "provider": identity.get("provider"),
                    "status": None,
                }

        if matched_identity_map:
            matched_user_ids = sorted(matched_identity_map.keys())
            users_result = await db_execute(
                lambda: (
                    supabase.table("users")
                    .select("id, status")
                    .in_("id", matched_user_ids)
                    .execute()
                )
            )

            user_status_map: Dict[str, Optional[str]] = {}
            for user in users_result.data or []:
                if not isinstance(user, dict):
                    continue
                found_user_id = user.get("id")
                if found_user_id:
                    user_status_map[found_user_id] = user.get("status")

            for matched_user_id in matched_user_ids:
                row = matched_identity_map[matched_user_id]
                row["status"] = user_status_map.get(matched_user_id)
                matched_users.append(row)

    total = len(matched_users)
    paged_users = matched_users[offset : offset + limit]

    async def fetch_last_activity(target_user_id: str) -> Optional[str]:
        activity_result = await db_execute(
            lambda uid=target_user_id: (
                supabase.table("analytics_events")
                .select("created_at")
                .eq("user_id", uid)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
        )
        activity_data = activity_result.data or []
        if activity_data and isinstance(activity_data[0], dict):
            return activity_data[0].get("created_at")
        return None

    if paged_users:
        users_with_id = [user for user in paged_users if user.get("id")]
        last_activities = await asyncio.gather(
            *(fetch_last_activity(str(user.get("id"))) for user in users_with_id)
        )
        for user, last_activity in zip(users_with_id, last_activities):
            user["last_activity"] = last_activity

    return {
        "users": paged_users,
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.get("/activity/{user_id}", response_model=TimelineResponse)
async def get_user_activity_timeline(
    user_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    event_types: Optional[str] = None,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    _admin: str = Depends(require_admin),
):
    offset = (page - 1) * limit

    start_iso = _parse_date_boundary(start_date, is_end=False) if start_date else None
    end_iso = _parse_date_boundary(end_date, is_end=True) if end_date else None

    if start_iso and end_iso and start_iso > end_iso:
        raise HTTPException(
            status_code=400, detail="조회 시작일이 종료일보다 늦을 수 없습니다"
        )

    def with_date_filter(query_builder: Any) -> Any:
        if start_iso:
            query_builder = query_builder.gte("created_at", start_iso)
        if end_iso:
            query_builder = query_builder.lte("created_at", end_iso)
        return query_builder

    (
        analytics_result,
        api_logs_result,
        coin_result,
        payment_result,
    ) = await asyncio.gather(
        db_execute(
            lambda: (
                with_date_filter(
                    supabase.table("analytics_events")
                    .select("id, event_type, event_data, created_at")
                    .eq("user_id", user_id)
                )
                .order("created_at", desc=True)
                .execute()
            )
        ),
        db_execute(
            lambda: (
                with_date_filter(
                    supabase.table("user_api_logs")
                    .select(
                        "id, method, path, status_code, response_time_ms, error_detail, created_at"
                    )
                    .eq("user_id", user_id)
                )
                .order("created_at", desc=True)
                .execute()
            )
        ),
        db_execute(
            lambda: (
                with_date_filter(
                    supabase.table("coin_transactions")
                    .select("id, type, amount, description, created_at")
                    .eq("user_id", user_id)
                )
                .order("created_at", desc=True)
                .execute()
            )
        ),
        db_execute(
            lambda: (
                with_date_filter(
                    supabase.table("payments")
                    .select("id, order_id, amount, status, product_name, created_at")
                    .eq("user_id", user_id)
                )
                .order("created_at", desc=True)
                .execute()
            )
        ),
    )

    timeline_items: List[Dict[str, Any]] = []

    for index, row in enumerate(analytics_result.data or []):
        if not isinstance(row, dict):
            continue

        created_at = row.get("created_at")
        if not created_at:
            continue

        event_type_value = str(row.get("event_type") or "unknown")
        event_data = row.get("event_data")
        if not isinstance(event_data, dict):
            event_data = {}

        timeline_items.append(
            {
                "id": str(row.get("id") or f"analytics-{index}"),
                "timestamp": str(created_at),
                "source": "analytics",
                "event_type": event_type_value,
                "summary": EVENT_SUMMARIES.get(
                    event_type_value, f"이벤트 {event_type_value}"
                ),
                "details": event_data,
            }
        )

    for index, row in enumerate(api_logs_result.data or []):
        if not isinstance(row, dict):
            continue

        created_at = row.get("created_at")
        if not created_at:
            continue

        method = str(row.get("method") or "UNKNOWN")
        path = str(row.get("path") or "")
        status_code = row.get("status_code")

        timeline_items.append(
            {
                "id": str(row.get("id") or f"api-log-{index}"),
                "timestamp": str(created_at),
                "source": "api_log",
                "event_type": f"{method} {path}".strip(),
                "summary": f"API 요청 {method} {path} → {status_code}",
                "details": {
                    "status_code": status_code,
                    "response_time_ms": row.get("response_time_ms"),
                    "error_detail": row.get("error_detail"),
                },
            }
        )

    for index, row in enumerate(coin_result.data or []):
        if not isinstance(row, dict):
            continue

        created_at = row.get("created_at")
        if not created_at:
            continue

        tx_type = str(row.get("type") or "unknown")
        amount = row.get("amount", 0)

        timeline_items.append(
            {
                "id": str(row.get("id") or f"coin-{index}"),
                "timestamp": str(created_at),
                "source": "coin",
                "event_type": tx_type,
                "summary": f"코인 {tx_type}: {amount}개",
                "details": {
                    "amount": amount,
                    "description": row.get("description"),
                },
            }
        )

    for index, row in enumerate(payment_result.data or []):
        if not isinstance(row, dict):
            continue

        created_at = row.get("created_at")
        if not created_at:
            continue

        payment_status = str(row.get("status") or "unknown")
        amount = row.get("amount", 0)
        product_name = str(row.get("product_name") or "상품명 없음")

        timeline_items.append(
            {
                "id": str(row.get("id") or f"payment-{index}"),
                "timestamp": str(created_at),
                "source": "payment",
                "event_type": payment_status,
                "summary": f"결제 {payment_status}: {amount}원 ({product_name})",
                "details": {
                    "order_id": row.get("order_id"),
                    "amount": amount,
                    "status": payment_status,
                    "product_name": product_name,
                },
            }
        )

    if event_types:
        event_type_filters = {
            item.strip().lower() for item in event_types.split(",") if item.strip()
        }
        if event_type_filters:
            timeline_items = [
                item
                for item in timeline_items
                if item["source"].lower() in event_type_filters
                or item["event_type"].lower() in event_type_filters
            ]

    timeline_items.sort(
        key=lambda item: _parse_iso_timestamp(item["timestamp"]), reverse=True
    )

    total = len(timeline_items)
    paged_timeline = timeline_items[offset : offset + limit]

    user_result, identity_result = await asyncio.gather(
        db_execute(
            lambda: (
                supabase.table("users")
                .select("id, status")
                .eq("id", user_id)
                .limit(1)
                .execute()
            )
        ),
        db_execute(
            lambda: (
                supabase.table("user_identities")
                .select(
                    "provider, name_ct, name_iv, name_tag, email_ct, email_iv, email_tag, key_id"
                )
                .eq("user_id", user_id)
                .limit(1)
                .execute()
            )
        ),
    )

    user_info: Optional[Dict[str, Any]] = None
    user_data = user_result.data or []
    identity_data = identity_result.data or []

    if user_data and isinstance(user_data[0], dict):
        user_row = user_data[0]
        identity_row: Dict[str, Any] = {}
        if identity_data and isinstance(identity_data[0], dict):
            identity_row = identity_data[0]

        name, email = _decrypt_identity_name_email(identity_row)
        user_info = {
            "id": user_row.get("id"),
            "status": user_row.get("status"),
            "provider": identity_row.get("provider"),
            "name": name,
            "email": email,
        }

    return {
        "timeline": paged_timeline,
        "total": total,
        "page": page,
        "limit": limit,
        "user_info": user_info,
    }
