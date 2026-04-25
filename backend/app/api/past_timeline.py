import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..api.deps import rate_limit_dependency
from ..api.auth import get_current_user
from ..db.supabase_client import db_execute, supabase
from ..schemas import PastTimelineResponse, PastYearAnalysis
from ..services.analytics_service import AnalyticsService
from ..services.config_service import config_service
from ..utils.flow_calculator import analyze_past_years, convert_pillars_for_analysis
from .reading.cache_ops import _decrypt_profile_field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reading", tags=["reading"])


class PastTimelineRequest(BaseModel):
    profile_id: str


# --- Bug G helpers: composite interaction_type → single primary ---
_INTERACTION_DESC = {
    "충": "정면 충돌의 기운이 작용하는 해",
    "형": "형벌의 기운이 작용하는 해",
    "파": "파쇄의 기운이 작용하는 해",
    "해": "해로운 기운이 작용하는 해",
}
_SEVERITY_RANK = {"충": 3, "형": 2, "파": 1, "해": 0}


@router.post("/past-timeline", response_model=PastTimelineResponse)
async def get_past_timeline(
    request: PastTimelineRequest,
    current_user=Depends(get_current_user),
    _rate=Depends(rate_limit_dependency(limit=5, window_seconds=86400)),
):
    """과거 타임라인 분석 — 원국과 세운의 충/형/파/해 교차 분석."""
    if not current_user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다")

    if not await config_service.is_feature_enabled("past_timeline"):
        raise HTTPException(status_code=404, detail="Feature not available")

    user_id = current_user.get("user_id")
    profile_id = request.profile_id

    # --- Step 1: 암호화된 프로파일 조회 (Bug B fix: select("*") + user_id 필터) ---
    try:
        profile = await db_execute(
            lambda: supabase.table("saju_profiles")
            .select("*")
            .eq("id", profile_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
    except Exception:
        logger.exception("[PAST_TIMELINE] DB query failed: profile_id=%s", profile_id)
        raise HTTPException(status_code=500, detail="프로파일 조회에 실패했습니다")

    # Momus W2 fix: .limit(1) 대신 .single() 사용하지 않아 no-row에서 예외 없음
    if not profile.data:
        raise HTTPException(status_code=404, detail="프로파일을 찾을 수 없습니다")

    profile_data = profile.data[0] if isinstance(profile.data, list) else profile.data

    if not isinstance(profile_data, dict):
        raise HTTPException(status_code=500, detail="Invalid profile data")

    # --- Step 2: birth_date 복호화 → birth_year 추출 (Bug B fix) ---
    try:
        birth_date_str = _decrypt_profile_field(profile_data, "birth_date")
    except Exception:
        logger.exception("[PAST_TIMELINE] Decryption failed: profile_id=%s", profile_id)
        raise HTTPException(status_code=500, detail="프로파일 복호화에 실패했습니다")

    try:
        birth_year = int(birth_date_str.split("-")[0]) if birth_date_str else 1990
    except (ValueError, IndexError):
        birth_year = 1990

    # --- Step 3: cache_id FK → saju_cache 조인 → pillars_json (Bug C fix) ---
    cache_id = profile_data.get("cache_id")
    if not cache_id:
        raise HTTPException(
            status_code=400,
            detail="사주 분석 데이터가 없습니다. 먼저 사주 분석을 진행해주세요.",
        )

    try:
        cache_result = await db_execute(
            lambda: supabase.table("saju_cache")
            .select("pillars_json")
            .eq("id", cache_id)
            .limit(1)
            .execute()
        )
    except Exception:
        logger.exception("[PAST_TIMELINE] Cache query failed: cache_id=%s", cache_id)
        raise HTTPException(status_code=500, detail="캐시 데이터 조회에 실패했습니다")

    if not cache_result.data:
        raise HTTPException(
            status_code=400,
            detail="캐시된 사주 데이터를 찾을 수 없습니다. 먼저 사주 분석을 진행해주세요.",
        )

    cache_row = cache_result.data[0] if isinstance(cache_result.data, list) else cache_result.data
    if not isinstance(cache_row, dict):
        raise HTTPException(status_code=500, detail="Invalid cache data")

    pillars_json = cache_row.get("pillars_json", {})

    if not isinstance(pillars_json, dict) or not pillars_json:
        raise HTTPException(status_code=400, detail="사주 기둥 데이터가 올바르지 않습니다")

    # --- Step 4: pillar 한자→한글 변환 (Bug E + F fix) ---
    natal_pillars = convert_pillars_for_analysis(pillars_json)

    # --- Step 5: 과거 분석 실행 ---
    current_year = date.today().year
    past_years = analyze_past_years(natal_pillars, birth_year, current_year)

    # --- Step 6: 응답 조립 (Bug D + G fix) ---
    conflicts = []
    for y in past_years:
        raw_type = y["interaction_type"]  # e.g. "충" or "충/형" (set-joined, non-deterministic order)
        types = sorted(
            [t.strip() for t in raw_type.split("/")],
            key=lambda t: _SEVERITY_RANK.get(t, -1),
            reverse=True,
        )

        # Bug G: 가장 심각한 것을 단일 interaction_type으로 (Literal 타입 준수)
        primary_type = types[0] if types else "충"

        # Momus W3 fix: type_detail에 구체적 정보 포함
        type_detail = "/".join(types) if len(types) > 1 else (types[0] if types else primary_type)

        # 결정론적 description 생성
        desc = f"{y['year']}년 {y['year_ganji']}: {_INTERACTION_DESC.get(primary_type, '')}"

        conflicts.append(PastYearAnalysis(
            year=y["year"],
            year_ganji=y["year_ganji"],
            interaction_type=primary_type,
            type_detail=type_detail,
            severity=y["severity"],
            description=desc,
        ))

    # --- Step 7: analytics 추적 ---
    await AnalyticsService.track_event(
        event_type="past_timeline_viewed",
        event_data={"profile_id": profile_id, "years_found": len(conflicts)},
        user_id=user_id,
    )

    return PastTimelineResponse(
        profile_id=profile_id,
        conflicts=conflicts,
        total_count=len(conflicts),
        earliest_year=conflicts[0].year if conflicts else None,
        latest_year=conflicts[-1].year if conflicts else None,
    )
