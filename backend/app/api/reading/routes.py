# pyright: reportMissingImports=false, reportGeneralTypeIssues=false
"""
사주 리딩 API 라우터
"""

import asyncio
import logging
import time
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from korean_lunar_calendar import KoreanLunarCalendar
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ...config import get_settings
from ...db.supabase_client import supabase
from ...db.session import get_db
from ...job_manager import job_manager
from ...prompt_manager import get_prompt_manager
from ...providers.factory import ProviderFactory
from ...schemas import (
    BirthInput,
    AdvancedAnalysis,
    DaeunAnalysis,
    ElementStats,
    GeokgukYongsin,
    InteractionAnalysis,
    InteractionItem,
    JobStartResponse,
    JobStatusResponse,
    MetaData,
    ModelInfo,
    ModelsResponse,
    PillarsData,
    PracticalSummary,
    Provider,
    ReadingRequest,
    ReadingResponse,
    SeunAnalysis,
    SinsalAnalysis,
    SinsalItem,
    SipsinAnalysis,
    SipsinItem,
)
from ...services.analytics_service import AnalyticsService
from ...services.cache_service import (
    get_cache_reuse_status,
    get_cached_reading_sync,
    make_birth_key,
    save_to_cache_supabase,
    save_user_reading_supabase,
)
from ...services.config_service import (
    ConfigService,
    config_service,
    get_provider_for_model,
)
from ...utils.flow_calculator import compute_scores, get_saju_character, wealth_grade
from ...utils.myungri_calculator import calculate_advanced_analysis as calc_advanced
from ...utils.saju_calculator import get_calculated_pillars, get_yearly_monthly_ganji
from ...utils.birth_normalizer import normalize_birth_to_solar
from ..auth import get_current_user
from ..deps import get_current_user_id, rate_limit_dependency

from .cache_ops import (
    get_cached_reading_by_key,
    get_cached_reading_by_params,
    get_cached_reading_by_profile,
    get_reading_detail,
)
from .contract import project_reading_response, resolve_reading_projection
from .helpers import _parse_card, _parse_tabs
from .job_ops import get_reading_status, start_reading_job
from .reconstruction import (
    _reconstruct_advanced_from_cache,
    _reconstruct_response_from_cache_dict,
)

logger = logging.getLogger(__name__)


class ReadingResumeBootstrapRequest(BaseModel):
    cache_id: str = Field(..., min_length=1, max_length=100)
    input: BirthInput
    profile_id: Optional[str] = None


class ReadingResumeBootstrapResponse(BaseModel):
    reading_id: str
    cache_id: str
    reused_existing: bool


def _find_existing_user_reading_id_by_cache(
    user_id: str, cache_id: str
) -> Optional[str]:
    result = (
        supabase.table("user_readings")
        .select("id")
        .eq("user_id", user_id)
        .eq("cache_id", cache_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )

    if isinstance(result.data, list) and result.data:
        row = result.data[0]
        if isinstance(row, dict) and row.get("id"):
            return str(row.get("id"))

    return None


async def bootstrap_resume_reading(
    request: ReadingResumeBootstrapRequest,
    current_user_id: str = Depends(get_current_user_id),
    _rate_limit: None = Depends(
        rate_limit_dependency(
            limit=20, window_seconds=60, scope="reading_resume_bootstrap"
        )
    ),
) -> ReadingResumeBootstrapResponse:
    user_id = current_user_id
    cache_id = request.cache_id.strip()
    # 음력 입력인 경우 양력으로 정규화 후 캐시 키 생성
    request.input.birth_solar = normalize_birth_to_solar(
        request.input.birth_solar,
        getattr(request.input, "calendar_type", "solar"),
    )
    birth_key = make_birth_key(request.input)
    cached = get_cached_reading_sync(birth_key)

    if not cached:
        raise HTTPException(status_code=404, detail="리딩 컨텍스트를 찾을 수 없습니다")

    resolved_cache_id = str(cached.get("id") or "").strip()
    if not resolved_cache_id or resolved_cache_id != cache_id:
        raise HTTPException(status_code=404, detail="리딩 컨텍스트를 찾을 수 없습니다")

    existing_reading_id = _find_existing_user_reading_id_by_cache(user_id, cache_id)
    if existing_reading_id:
        return ReadingResumeBootstrapResponse(
            reading_id=existing_reading_id,
            cache_id=cache_id,
            reused_existing=True,
        )

    reading_id = save_user_reading_supabase(
        user_id=user_id,
        cache_id=cache_id,
        profile_id=request.profile_id,
        label=request.input.name or "내 사주",
        persona=request.input.persona.value if request.input.persona else "classic",
    )
    if not reading_id:
        logger.error(
            "[READING RESUME BOOTSTRAP] failed to persist user reading: user_id=%s cache_id=%s",
            user_id,
            cache_id,
        )
        raise HTTPException(
            status_code=500, detail="리딩 컨텍스트 저장 중 오류가 발생했습니다"
        )

    return ReadingResumeBootstrapResponse(
        reading_id=str(reading_id),
        cache_id=cache_id,
        reused_existing=False,
    )


SIPSIN_FALLBACK_INFO = {
    "비겁": {
        "trait": "주체적인 자아와 강한 독립심을 가진 성향입니다. 스스로의 힘으로 인생을 개척해 나가는 에너지가 돋보입니다.",
        "strengths": [
            "강한 추진력과 뚝심",
            "확고한 주관과 자신감",
            "신뢰를 중시하는 의리",
        ],
        "risks": [
            "지나친 고집으로 인한 마찰",
            "타인의 조언을 무시하는 경향",
            "독단적인 판단 주의",
        ],
    },
    "식상": {
        "trait": "창의적인 표현력과 탁월한 재능을 가진 성향입니다. 감수성이 풍부하고 무언가를 만들어내는 것을 좋아합니다.",
        "strengths": [
            "뛰어난 창의력과 표현력",
            "임기응변과 문제 해결 능력",
            "유머 감각과 친화력",
        ],
        "risks": [
            "감정 기복으로 인한 실수",
            "말실수로 인한 구설수",
            "지나치게 감성적인 판단",
        ],
    },
    "재성": {
        "trait": "현실적인 감각과 결과 지향적인 성향입니다. 목표를 달성하고 실질적인 성과를 만들어내는 능력이 뛰어납니다.",
        "strengths": [
            "뛰어난 현실 감각과 경제 관념",
            "목표 지향적인 태도",
            "유연한 대인 관계",
        ],
        "risks": [
            "지나친 결과주의",
            "물질에 대한 집착",
            "과정보다 결과를 중시하는 태도",
        ],
    },
    "관성": {
        "trait": "책임감이 강하고 원칙을 준수하는 반듯한 성향입니다. 조직 생활에 잘 적응하며 명예를 소중히 여깁니다.",
        "strengths": [
            "철저한 자기 관리와 책임감",
            "리더십과 통솔력",
            "원칙과 약속 준수",
        ],
        "risks": ["지나친 보수성과 융통성 부족", "권위적인 태도", "스트레스 관리 필요"],
    },
    "인성": {
        "trait": "깊이 있는 사고와 수용적인 태도를 가진 성향입니다. 배우고 익히는 것을 좋아하며 지혜로운 면모가 있습니다.",
        "strengths": [
            "뛰어난 이해력과 학습 능력",
            "차분하고 신중한 태도",
            "본질을 꿰뚫는 통찰력",
        ],
        "risks": ["실천보다 생각이 앞서는 경향", "지나친 의존성", "현실 감각 부족"],
    },
    "": {
        "trait": "다양한 가능성을 가진 복합적인 성향입니다.",
        "strengths": ["유연한 사고", "다방면의 잠재력"],
        "risks": ["뚜렷한 주관 필요"],
    },
}


# =============================================================================
# Cache Reconstruction Functions
# =============================================================================

router = APIRouter(tags=["reading"])


@router.post(
    "/reading", response_model=ReadingResponse, response_model_exclude_unset=True
)
async def create_reading(
    request: ReadingRequest,
    db: Optional[AsyncSession] = Depends(get_db),
    current_user: Optional[dict] = Depends(get_current_user),
    job_id: Optional[str] = None,
    _rate_limit: None = Depends(
        rate_limit_dependency(limit=3, window_seconds=60, scope="reading_sync")
    ),
) -> ReadingResponse:
    """
    사주 리딩 생성

    - 입력: 생년월일, 시간, 출생지, 모델 선택
    - 출력: 구조화된 사주 해석 (탭별 JSON)
    - 캐시: 동일 생년월일시+성별은 캐시 활용 (오늘 운세/세운/이미지만 실시간)
    """
    start_time = time.time()
    last_time = start_time
    settings = get_settings()
    user_id = current_user.get("user_id") if current_user else None
    response_projection = resolve_reading_projection()
    detail_entitlement_granted = False
    detail_entitlement_source = "reading_reanalyze"

    if job_id:
        job = job_manager.get_job(job_id)
        request_data = job.request_data if job else None
        if isinstance(request_data, dict):
            detail_entitlement_granted = bool(
                request_data.get("detail_entitlement_granted")
            )
            detail_entitlement_source = str(
                request_data.get("detail_entitlement_source") or "reading_reanalyze"
            )

    def build_user_reading_context() -> Optional[dict]:
        context_payload = (
            dict(user_reading_context_json)
            if isinstance(user_reading_context_json, dict)
            else {}
        )
        if detail_entitlement_granted:
            context_payload["reading_access"] = {
                "full_detail": True,
                "source": detail_entitlement_source,
            }
        return context_payload or None

    try:
        await AnalyticsService.track_analysis_event("reading", "started", user_id)
    except Exception:
        pass

    def log_time(tag: str):
        nonlocal last_time
        now = time.time()
        logger.debug(
            f"[TIME] {tag}: {now - last_time:.4f}s (Total: {now - start_time:.4f}s)"
        )
        last_time = now

    if request.model.model_id == "auto" or not request.model.model_id:
        request.model.model_id = await config_service.get_model_main()
        request.model.provider = get_provider_for_model(request.model.model_id)
        if not request.model.reasoning_effort:
            request.model.reasoning_effort = (
                await config_service.get_reasoning_effort_main()
            )

    try:
        # [Lunar Support] 음력인 경우 양력으로 변환 (캐시 조회 전에 수행)
        if request.input.calendar_type == "lunar":
            try:
                l_calendar = KoreanLunarCalendar()
                ly, lm, ld = map(int, request.input.birth_solar.split("-"))
                # 윤달 여부는 현재 입력받지 않으므로 평달로 가정 (False)
                if l_calendar.setLunarDate(ly, lm, ld, False):
                    request.input.birth_solar = l_calendar.getSolarIsoFormat()
                    logger.debug(
                        f"[Conversion] Lunar {ly}-{lm}-{ld} -> Solar {request.input.birth_solar}"
                    )
            except Exception as e:
                logger.warning(f"[warn] Lunar conversion failed: {e}")

        # =================================================================
        # CACHE CHECK: 동일 생년월일시+성별이면 캐시 활용
        # - 고민상세(context.details or input.concern)가 있으면 개인화 응답이므로 캐시를 사용하지 않음
        # Supabase REST API로 캐시 조회 (SQLAlchemy Pooler 호환성 문제 회피)
        # =================================================================
        birth_key = make_birth_key(request.input)
        concern_text = ""
        raw_concern = getattr(request.input, "concern", None)
        if isinstance(raw_concern, str) and raw_concern.strip():
            concern_text = raw_concern.strip()
        if (
            not concern_text
            and request.input.context
            and isinstance(request.input.context.details, str)
        ):
            if request.input.context.details.strip():
                concern_text = request.input.context.details.strip()

        bypass_cache = bool(concern_text)
        current_model_version = (
            f"{request.model.provider.value}:{request.model.model_id}"
        )

        user_reading_context_json = None
        if bypass_cache:
            topic_val = None
            if (
                request.input.context
                and getattr(request.input.context, "topic", None) is not None
            ):
                topic_val = request.input.context.topic.value
            user_reading_context_json = {
                "context": {
                    "topic": topic_val,
                    "details": concern_text,
                }
            }

        if not bypass_cache:
            try:
                cached_dict = get_cached_reading_sync(birth_key)
                if cached_dict:
                    can_reuse_cache, cache_reason = get_cache_reuse_status(
                        cached_dict,
                        current_model_version=current_model_version,
                        current_prompt_version=settings.prompt_version,
                    )
                    if not can_reuse_cache:
                        logger.info(
                            "[CACHE STALE] reason=%s birth_key=%s",
                            cache_reason,
                            birth_key,
                        )
                        cached_dict = None

                if cached_dict:
                    logger.info(f"[CACHE HIT] birth_key={birth_key}")
                    log_time("Cache Lookup (HIT)")

                    async def _reconstruct_task():
                        """응답 재구성 태스크 (병렬 실행용)"""
                        return await _reconstruct_response_from_cache_dict(
                            cache_dict=cached_dict,
                            request=request,
                            settings=settings,
                            saju_image_base64=None,
                            saju_image_prompt=None,
                            latency_ms=0,
                        )

                    # 응답 재구성 (이미지 생성 제거)
                    response = await _reconstruct_task()

                    log_time("Parallel Generation (Fortune + Seun)")

                    # 결과 처리
                    saju_image_base64 = None
                    saju_image_prompt = None

                    if isinstance(response, BaseException):
                        logger.error(f"ERROR: Reconstruct task failed: {response}")
                        raise response

                    # 타입 가드 이후 response는 ReadingResponse로 확정
                    final_response: ReadingResponse = response

                    # 이미지 결과와 latency를 response에 주입
                    latency_ms = int((time.time() - start_time) * 1000)
                    cache_id = str(cached_dict.get("id") or "") or None
                    final_response.meta.cache_id = cache_id
                    final_response.saju_image_base64 = saju_image_base64
                    final_response.saju_image_prompt = saju_image_prompt
                    final_response.meta.latency_ms = latency_ms

                    if user_id:
                        try:
                            cache_id = cached_dict.get("id")
                            if cache_id:
                                reading_id = save_user_reading_supabase(
                                    user_id=user_id,
                                    cache_id=cache_id,
                                    profile_id=request.profile_id,
                                    label=request.input.name or "내 사주",
                                    persona=request.input.persona.value
                                    if request.input.persona
                                    else "classic",
                                    context_json=build_user_reading_context(),
                                    processing_time_ms=latency_ms,
                                )
                                if reading_id:
                                    final_response.meta.reading_id = str(reading_id)
                                    logger.info(
                                        f"[USER READING SAVE - CACHE HIT] user_id={user_id}, reading_id={reading_id}"
                                    )
                                if cache_id and getattr(request, "profile_id", None):
                                    try:
                                        supabase.table("saju_profiles").update(
                                            {"cache_id": str(cache_id)}
                                        ).eq("id", request.profile_id).execute()
                                        logger.info(
                                            "[SAVE GAP] Linked profile %s -> cache %s",
                                            request.profile_id,
                                            cache_id,
                                        )
                                    except Exception as e:
                                        logger.warning(
                                            "[SAVE GAP] Failed to link profile %s to cache %s: %s",
                                            request.profile_id,
                                            cache_id,
                                            e,
                                        )
                        except Exception:
                            logger.exception("User reading save failed (cache hit)")

                    try:
                        await AnalyticsService.track_analysis_event(
                            "reading",
                            "completed",
                            user_id,
                            int((time.time() - start_time) * 1000),
                        )
                    except Exception:
                        pass
                    return project_reading_response(final_response, response_projection)
                else:
                    logger.info(f"[CACHE MISS] birth_key={birth_key}")
                    log_time("Cache Lookup (MISS)")
            except Exception:
                logger.exception("Cache lookup failed, proceeding without cache")
        else:
            logger.info(
                f"[CACHE BYPASS] concern provided (len={len(concern_text)}) birth_key={birth_key}"
            )
            log_time("Cache Bypass (Concern)")

        # =================================================================
        # CACHE MISS: 전체 AI Inference 실행
        # =================================================================

        # 1. Provider 가져오기 (0.0s)
        provider = ProviderFactory.get_provider(request.model.provider)
        log_time("Provider Init")

        # 1.5. 사주 간지 사전 계산 (backend logic) - Sajupy는 빠르므로 먼저 실행
        calculated_pillars = None
        monthly_ganji_list = []
        year, month, day, hour, minute, gender = 0, 0, 0, 0, 0, "male"
        try:
            year, month, day = map(int, request.input.birth_solar.split("-"))
            hour, minute = map(int, request.input.birth_time.split(":"))
            gender = request.input.gender or "male"

            calculated_pillars = get_calculated_pillars(
                year, month, day, hour, minute, gender
            )
            monthly_ganji_list = get_yearly_monthly_ganji(year)

            logger.debug(f"Calculated Pillars: {calculated_pillars}")
        except Exception as e:
            logger.error(f"Failed to calculate pillars: {e}")

        log_time("Sajupy Calc")

        # [병렬화] python_myungri와 bazi_service를 동시에 실행
        from ...services.bazi_service import get_bazi_analysis_async

        python_myungri = None
        raw_myungri = None

        async def _calc_python_myungri():
            if not calculated_pillars:
                return None
            try:
                pillars_for_analysis = {
                    "year": calculated_pillars.get("year", ""),
                    "month": calculated_pillars.get("month", ""),
                    "day": calculated_pillars.get("day", ""),
                    "hour": calculated_pillars.get("hour", ""),
                }
                result = await asyncio.to_thread(
                    calc_advanced, pillars_for_analysis, gender
                )
                logger.info(
                    f"Python Myungri Analysis Success: sipsin={len(result.get('sipsin', {}).get('details', {}))}, interactions={len(result.get('interactions', {}).get('items', []))}"
                )
                return result
            except Exception as pm_err:
                logger.error(f"Failed to calculate python myungri: {pm_err}")
                return None

        async def _calc_bazi_mcp():
            try:
                result = await get_bazi_analysis_async(
                    year, month, day, hour, minute, gender
                )
                if result:
                    logger.info(f"Bazi Analysis Success. Data size: {len(str(result))}")
                else:
                    logger.warning("Bazi Analysis returned empty.")
                return result
            except Exception as me:
                logger.error(f"Failed to calculate myungri data with Bazi MCP: {me}")
                return None

        # 병렬 실행: python_myungri + bazi_mcp
        python_myungri, raw_myungri = await asyncio.gather(
            _calc_python_myungri(), _calc_bazi_mcp(), return_exceptions=True
        )

        # 예외 처리
        if isinstance(python_myungri, BaseException):
            logger.warning(f"WARN: python_myungri task exception: {python_myungri}")
            python_myungri = None
        if isinstance(raw_myungri, BaseException):
            logger.warning(f"WARN: raw_myungri task exception: {raw_myungri}")
            raw_myungri = None

        # 데이터 병합 및 패치
        if raw_myungri and calculated_pillars:
            if "oheng_counts" in calculated_pillars:
                if "chart" in raw_myungri and "five_elements" in raw_myungri["chart"]:
                    raw_myungri["chart"]["five_elements"]["counts"] = (
                        calculated_pillars["oheng_counts"]
                    )
                    raw_myungri["chart"]["five_elements"]["percentages"] = (
                        "계산 불가 (counts 참조)"
                    )
                    logger.debug(
                        f"Patched Bazi five_elements with Sajupy data: {calculated_pillars['oheng_counts']}"
                    )

            if "sinsal_items" in calculated_pillars:
                raw_myungri["korean_shinsal"] = calculated_pillars["sinsal_items"]
                logger.debug(
                    f"Patched Korean Shinsal: {len(calculated_pillars['sinsal_items'])} items"
                )

            if "interactions" in calculated_pillars:
                if "chart" in raw_myungri:
                    raw_myungri["chart"]["interactions"] = calculated_pillars[
                        "interactions"
                    ]
                    logger.debug(
                        f"Patched Interactions: {len(calculated_pillars['interactions'].get('items', []))} items"
                    )

        if python_myungri:
            if raw_myungri is None:
                raw_myungri = {"chart": {}}
            raw_myungri["korean_verified_data"] = python_myungri
            logger.debug(
                f"Injected Python Myungri Data to Prompt: {list(python_myungri.keys())}"
            )

        if not raw_myungri and not python_myungri:
            logger.warning("WARN: Both Bazi Analysis and Python Myungri Data failed.")

        log_time("Parallel Bazi & Myungri Calc")

        # =====================================================================
        # PARALLEL MODE: Feature Flag가 활성화되면 병렬 처리 실행
        # =====================================================================
        if settings.enable_parallel_reading:
            try:
                from ...services.parallel_reading import get_parallel_reading_service

                parallel_service = get_parallel_reading_service(provider)
                merged_data, tab_results = await parallel_service.generate_parallel(
                    input_data=request.input,
                    model_id=request.model.model_id,
                    temperature=request.model.temperature,
                    reasoning_effort=request.model.reasoning_effort or "high",
                    job_id=job_id,
                    calculated_pillars=calculated_pillars,
                    monthly_ganji=monthly_ganji_list,
                    myungri_data=raw_myungri,
                )

                merged_data = parallel_service.apply_fallbacks(
                    merged_data=merged_data,
                    tab_results=tab_results,
                    calculated_pillars=calculated_pillars,
                    python_myungri=python_myungri,
                )

                log_time("Parallel LLM Generation")

                from ...utils.text_postprocessor import postprocess_reading_response

                parsed = postprocess_reading_response(merged_data)

                latency_ms = int((time.time() - start_time) * 1000)

                saju_image_base64 = None
                saju_image_prompt = None

                card_data = _parse_card(parsed.get("card", {}))
                if calculated_pillars and "oheng_counts" in calculated_pillars:
                    sajupy_counts = calculated_pillars["oheng_counts"]
                    card_data.stats = ElementStats(
                        wood=sajupy_counts.get("wood", 0),
                        fire=sajupy_counts.get("fire", 0),
                        earth=sajupy_counts.get("earth", 0),
                        metal=sajupy_counts.get("metal", 0),
                        water=sajupy_counts.get("water", 0),
                    )

                advanced_data = _reconstruct_advanced_from_cache(
                    parsed.get("advanced_analysis", {})
                )

                # =====================================================================
                # [FIX] 병렬 모드에서도 rule-based 데이터로 덮어쓰기 (단일 모드와 동일하게)
                # 십신/신살/합충형파해는 AI 생성이 아닌 확정 계산값을 사용해야 함
                # =====================================================================
                if advanced_data:
                    # 1. 십신 데이터 주입 (python_myungri 우선)
                    if python_myungri and "sipsin" in python_myungri:
                        py_sipsin = python_myungri["sipsin"]
                        sipsin_count = py_sipsin.get("count", {})
                        sipsin_details = py_sipsin.get("details", {})

                        # details에서 position 정보 추출
                        pos_map = {
                            "year_stem": "년간",
                            "year_branch": "년지",
                            "month_stem": "월간",
                            "month_branch": "월지",
                            "day_stem": "일간",
                            "day_branch": "일지",
                            "hour_stem": "시간",
                            "hour_branch": "시지",
                        }
                        sipsin_positions = {}
                        for pos_key, data in sipsin_details.items():
                            sipsin_name = data.get("sipsin", "")
                            if sipsin_name and sipsin_name != "일간":
                                if sipsin_name not in sipsin_positions:
                                    sipsin_positions[sipsin_name] = []
                                sipsin_positions[sipsin_name].append(
                                    pos_map.get(pos_key, pos_key)
                                )

                        # SipsinItem 생성
                        sipsin_items = []
                        for name, cnt in sipsin_count.items():
                            if cnt > 0:
                                sipsin_items.append(
                                    SipsinItem(
                                        name=name,
                                        count=cnt,
                                        positions=sipsin_positions.get(name, []),
                                    )
                                )

                        # 덮어쓰기 (AI 생성값 대신 rule-based 값 사용)
                        advanced_data.sipsin.distribution = sipsin_items
                        advanced_data.sipsin.dominant = py_sipsin.get(
                            "dominant", advanced_data.sipsin.dominant
                        )
                        advanced_data.sipsin.weak = py_sipsin.get(
                            "weak", advanced_data.sipsin.weak
                        )
                        logger.debug(
                            f"DEBUG [PARALLEL]: Injected rule-based sipsin: {len(sipsin_items)} items, dominant={advanced_data.sipsin.dominant}"
                        )

                    # 2. 신살 데이터 주입 (calculated_pillars 우선)
                    if calculated_pillars and calculated_pillars.get("sinsal_items"):
                        sinsal_items = []
                        for item in calculated_pillars["sinsal_items"]:
                            try:
                                sinsal_items.append(SinsalItem(**item))
                            except (TypeError, ValueError):
                                pass
                        advanced_data.sinsal.items = sinsal_items
                        logger.debug(
                            f"DEBUG [PARALLEL]: Injected rule-based sinsal: {len(sinsal_items)} items"
                        )
                    elif python_myungri and "sinsal" in python_myungri:
                        sinsal_items = []
                        for item in python_myungri["sinsal"].get("items", []):
                            try:
                                sinsal_items.append(SinsalItem(**item))
                            except (TypeError, ValueError):
                                pass
                        advanced_data.sinsal.items = sinsal_items
                        logger.debug(
                            f"DEBUG [PARALLEL]: Injected python_myungri sinsal: {len(sinsal_items)} items"
                        )

                    # 3. 합충형파해 데이터 주입 (calculated_pillars 우선)
                    if calculated_pillars and calculated_pillars.get("interactions"):
                        interaction_items = []
                        for item in calculated_pillars["interactions"].get("items", []):
                            try:
                                interaction_items.append(InteractionItem(**item))
                            except (TypeError, ValueError):
                                pass
                        advanced_data.interactions.items = interaction_items
                        advanced_data.interactions.gongmang = calculated_pillars[
                            "interactions"
                        ].get("gongmang", [])
                        logger.debug(
                            f"DEBUG [PARALLEL]: Injected rule-based interactions: {len(interaction_items)} items"
                        )
                    elif python_myungri and "interactions" in python_myungri:
                        interaction_items = []
                        for item in python_myungri["interactions"].get("items", []):
                            try:
                                interaction_items.append(InteractionItem(**item))
                            except (TypeError, ValueError):
                                pass
                        advanced_data.interactions.items = interaction_items
                        advanced_data.interactions.gongmang = python_myungri[
                            "interactions"
                        ].get("gongmang", [])
                        logger.debug(
                            f"DEBUG [PARALLEL]: Injected python_myungri interactions: {len(interaction_items)} items"
                        )

                    # 4. 확정 데이터 주입 (음양, 신강/신약, 일간 오행)
                    if calculated_pillars:
                        advanced_data.yinyang_ratio = calculated_pillars.get(
                            "yinyang_ratio", {"yang": 4, "yin": 4}
                        )
                        advanced_data.strength = calculated_pillars.get(
                            "strength", advanced_data.strength
                        )
                        advanced_data.day_master = calculated_pillars.get(
                            "day_master", advanced_data.day_master
                        )

                character_data = None
                if calculated_pillars:
                    day_pillar = calculated_pillars.get("day", "")
                    if day_pillar and len(day_pillar) >= 1:
                        from ...schemas.tabs import SajuCharacter

                        character_data = SajuCharacter(
                            **get_saju_character(day_pillar[0])
                        )

                tabs_data = _parse_tabs(parsed.get("tabs", {}))

                if calculated_pillars and tabs_data.money:
                    base_balance = calculated_pillars.get("base_balance_weights", {})
                    day_master = calculated_pillars.get("day_master", "")
                    if base_balance and day_master:
                        try:
                            _period_els = calculated_pillars.get("oheng_counts", {})
                            if _period_els:
                                _scores = compute_scores(
                                    _period_els, day_master, base_balance
                                )
                                tabs_data.money.wealth_grade = wealth_grade(
                                    _scores.get("money", 50)
                                )
                        except Exception as e:
                            logger.warning(f"wealth_grade injection failed: {e}")

                response = ReadingResponse(
                    one_liner=parsed.get("one_liner", ""),
                    pillars=PillarsData(**parsed.get("pillars", {}))
                    if parsed.get("pillars")
                    else PillarsData(),
                    card=card_data,
                    saju_dna=parsed.get("saju_dna"),
                    hidden_personality=parsed.get("hidden_personality"),
                    superpower=parsed.get("superpower"),
                    hashtags=parsed.get("hashtags"),
                    famous_same_stem=parsed.get("famous_same_stem"),
                    yearly_predictions=parsed.get("yearly_predictions"),
                    character=character_data,
                    tabs=tabs_data,
                    advanced_analysis=advanced_data,
                    rendered_markdown="",
                    saju_image_base64=saju_image_base64,
                    saju_image_prompt=saju_image_prompt,
                    meta=MetaData(
                        provider=request.model.provider.value,
                        model_id=request.model.model_id,
                        prompt_version=settings.prompt_version,
                        latency_ms=latency_ms,
                    ),
                )

                cache_id = None
                should_persist_authoritative_reading = bool(user_id)
                cache_storage_key = (
                    birth_key if not bypass_cache else f"reading:{uuid.uuid4().hex}"
                )
                if not bypass_cache or should_persist_authoritative_reading:
                    try:
                        cache_id = save_to_cache_supabase(
                            cache_storage_key, response, current_model_version
                        )
                        if cache_id:
                            logger.info(
                                f"[PARALLEL CACHE SAVE] SUCCESS! storage_key={cache_storage_key}, cache_id={cache_id}"
                            )
                        log_time("Cache Save (Parallel)")
                    except Exception as cache_save_err:
                        logger.warning(
                            f"WARN: Parallel cache save failed: {cache_save_err}"
                        )
                else:
                    logger.info(
                        f"[PARALLEL CACHE SAVE SKIP] bypass_cache=True birth_key={birth_key}"
                    )

                if user_id and cache_id is not None:
                    try:
                        reading_id = save_user_reading_supabase(
                            user_id=user_id,
                            cache_id=str(cache_id),
                            profile_id=request.profile_id,
                            label=request.input.name or "내 사주",
                            persona=request.input.persona.value
                            if request.input.persona
                            else "classic",
                            context_json=build_user_reading_context(),
                            processing_time_ms=latency_ms,
                        )
                        if reading_id:
                            response.meta.reading_id = str(reading_id)
                            logger.info(
                                f"[PARALLEL USER READING SAVE] user_id={user_id}, reading_id={reading_id}"
                            )
                        if cache_id and getattr(request, "profile_id", None):
                            try:
                                supabase.table("saju_profiles").update(
                                    {"cache_id": str(cache_id)}
                                ).eq("id", request.profile_id).execute()
                                logger.info(
                                    "[SAVE GAP] Linked profile %s -> cache %s",
                                    request.profile_id,
                                    cache_id,
                                )
                            except Exception as e:
                                logger.warning(
                                    "[SAVE GAP] Failed to link profile %s to cache %s: %s",
                                    request.profile_id,
                                    cache_id,
                                    e,
                                )
                    except Exception as user_reading_err:
                        logger.warning(
                            f"WARN: Parallel user reading save failed: {user_reading_err}"
                        )

                response.meta.cache_id = str(cache_id) if cache_id is not None else None

                try:
                    await AnalyticsService.track_analysis_event(
                        "reading",
                        "completed",
                        user_id,
                        int((time.time() - start_time) * 1000),
                    )
                except Exception:
                    pass
                return project_reading_response(response, response_projection)

            except Exception:
                logger.exception("Parallel mode failed, falling back to single mode")

        # =====================================================================
        # SINGLE MODE: 기존 단일 LLM 호출 방식 (Fallback)
        # =====================================================================

        # 2. 프롬프트 빌드
        prompt_manager = get_prompt_manager()
        settings = get_settings()
        prompt = prompt_manager.build_prompt(
            input_data=request.input,
            version=settings.prompt_version,
            calculated_pillars=calculated_pillars,
            monthly_ganji=monthly_ganji_list,
            myungri_data=raw_myungri,  # 확정 명리학 데이터 전달
        )
        log_time("Prompt Build")

        # 3. LLM 호출 (Retry Logic)
        max_retries = 2
        response_text = ""
        success = False

        for attempt in range(max_retries + 1):
            try:
                current_effort = request.model.reasoning_effort or "high"

                # 재시도 시 전략 변경
                if attempt > 0:
                    logger.debug(f"DEBUG: LLM 호출 재시도 {attempt}회차...")
                    # 타임아웃/부하 문제일 수 있으므로 effort 조정
                    if attempt == max_retries:
                        current_effort = "medium"

                response_text = await provider.generate(
                    prompt=prompt,
                    model_id=request.model.model_id,
                    temperature=request.model.temperature,
                    response_format={"type": "json_object"},
                    reasoning_effort=current_effort,
                )

                # 응답 검증: JSON 형식 여부 및 최소 길이 확인
                cleaned = response_text.strip()
                if "{" in cleaned and "}" in cleaned and len(cleaned) > 200:
                    success = True
                    break
                else:
                    logger.warning(f"WARN: 응답이 불완전함 (길이: {len(cleaned)})")

            except Exception as e:
                logger.warning(
                    f"WARN: LLM 호출 에러 ({attempt + 1}/{max_retries + 1}): {e}"
                )
                await asyncio.sleep(1)  # 비동기 백오프

        if not success:
            logger.error(
                "ERROR: 모든 LLM 호출 시도 실패. 강력한 Fallback 로직으로 복구 시도."
            )
            response_text = "{}"  # 빈 JSON으로 진행하여 Fallback 유도
        log_time("LLM Generation")

        # 4. JSON 파싱 (공통 유틸 사용)
        from ...utils.json_parser import parse_llm_json

        logger.debug(f"DEBUG: 원본 응답 길이: {len(response_text)}")
        parsed = parse_llm_json(response_text)

        if parsed:
            logger.debug(f"DEBUG: JSON 파싱 성공, 키: {list(parsed.keys())}")
        else:
            logger.warning("WARN: JSON 파싱 실패, 빈 객체로 진행")

        # 4.5 텍스트 후처리 (한자에 한글 발음 병기)
        from ...utils.text_postprocessor import postprocess_reading_response

        parsed = postprocess_reading_response(parsed)

        # [Safety] advanced_analysis 누락 방지 (AI가 빼먹었을 경우 강제 주입)
        if isinstance(parsed, dict):
            if "advanced_analysis" not in parsed:
                parsed["advanced_analysis"] = {}
            # 혹시 null인 경우 대비
            if not parsed["advanced_analysis"]:
                parsed["advanced_analysis"] = {}

            adv = parsed["advanced_analysis"]

            # 1. 신살 누락 시 강제 주입 (Sajupy 계산값 활용)
            if not adv.get("sinsal") or not adv["sinsal"].get("items"):
                if calculated_pillars and "sinsal_items" in calculated_pillars:
                    logger.debug(
                        "DEBUG: AI 응답에 신살 데이터 누락 -> 계산된 데이터 주입"
                    )
                    sinsal_list = calculated_pillars["sinsal_items"]
                    summary_parts = []
                    for item in sinsal_list:
                        if item.get("type") == "귀인":
                            summary_parts.append(f"{item['name']}")

                    summary_text = f"총 {len(sinsal_list)}개의 신살이 있습니다. "
                    if summary_parts:
                        summary_text += (
                            ", ".join(summary_parts[:3])
                            + " 등의 귀한 기운이 함께합니다."
                        )
                    else:
                        summary_text += "각 신살이 가진 특별한 의미를 확인해보세요."

                    adv["sinsal"] = {"items": sinsal_list, "summary": summary_text}

            # 2. 원국 요약 누락 시 강제 주입
            if not adv.get("wonguk_summary") or len(adv["wonguk_summary"]) < 5:
                counts = (
                    calculated_pillars.get("oheng_counts", {})
                    if calculated_pillars
                    else {}
                )
                korean_map = {
                    "wood": "목",
                    "fire": "화",
                    "earth": "토",
                    "metal": "금",
                    "water": "수",
                }
                summary_text = "오행 구성: " + ", ".join(
                    [f"{korean_map.get(k, k)} {v}" for k, v in counts.items()]
                )
                adv["wonguk_summary"] = summary_text
                logger.debug(
                    f"DEBUG: AI 응답에 원국 요약 누락 -> 오행 카운트 주입: {summary_text}"
                )

            # 3. 십신 설명 누락 시 강제 주입 (Fallback)
            if not adv.get("sipsin"):
                adv["sipsin"] = {}
            if not adv["sipsin"].get("core_trait"):
                dom = ""
                if python_myungri and "sipsin" in python_myungri:
                    dom = python_myungri["sipsin"].get("dominant", "")

                fallback = SIPSIN_FALLBACK_INFO.get(dom, SIPSIN_FALLBACK_INFO[""])
                adv["sipsin"]["core_trait"] = fallback["trait"]
                if not adv["sipsin"].get("strengths"):
                    adv["sipsin"]["strengths"] = fallback["strengths"]
                if not adv["sipsin"].get("risks"):
                    adv["sipsin"]["risks"] = fallback["risks"]
                if not adv["sipsin"].get("dominant"):
                    adv["sipsin"]["dominant"] = dom
                logger.debug(
                    f"DEBUG: AI 응답에 십신 설명 누락 -> Fallback 텍스트 주입 ({dom})"
                )

            parsed["advanced_analysis"] = adv

        logger.debug("DEBUG: 텍스트 후처리 및 누락 데이터 보강 완료")

        # 5. 응답 구조화
        latency_ms = int((time.time() - start_time) * 1000)
        log_time("Parsing & Postprocess")

        # 6. 사주 이미지 생성 (선택적) - 이제 별도 엔드포인트로 이동
        saju_image_base64 = None
        saju_image_prompt = None

        # 7. 확정적 명리학 계산 (Bazi MCP 데이터와 AI 분석 데이터 병합 - Fail Safe)
        advanced_data = None
        SIP_SIN_HANJA_MAP = {
            "比肩": "비견",
            "劫财": "겁재",
            "食神": "식신",
            "伤官": "상관",
            "偏财": "편재",
            "正财": "정재",
            "七杀": "편관",
            "正官": "정관",
            "偏印": "편인",
            "正印": "정인",
        }

        try:
            # AI가 생성한 원본 데이터 가져오기
            ai_adv = (
                parsed.get("advanced_analysis", {}) if isinstance(parsed, dict) else {}
            )
            if not isinstance(ai_adv, dict):
                ai_adv = {}

            # --- 십신 데이터 준비 (우선순위: python_myungri > Bazi MCP > AI) ---
            sipsin_items = []
            sipsin_dominant = ""
            sipsin_weak = ""

            # 1) Python 계산 데이터 (최우선)
            if python_myungri and "sipsin" in python_myungri:
                py_sipsin = python_myungri["sipsin"]
                sipsin_count = py_sipsin.get("count", {})
                sipsin_details = py_sipsin.get("details", {})
                sipsin_dominant = py_sipsin.get("dominant", "")
                sipsin_weak = py_sipsin.get("weak", "")

                # details에서 position 정보 추출
                pos_map = {
                    "year_stem": "년간",
                    "year_branch": "년지",
                    "month_stem": "월간",
                    "month_branch": "월지",
                    "day_stem": "일간",
                    "day_branch": "일지",
                    "hour_stem": "시간",
                    "hour_branch": "시지",
                }
                sipsin_positions = {}  # {십신명: [위치들]}
                for pos_key, data in sipsin_details.items():
                    sipsin_name = data.get("sipsin", "")
                    if sipsin_name and sipsin_name != "일간":
                        if sipsin_name not in sipsin_positions:
                            sipsin_positions[sipsin_name] = []
                        sipsin_positions[sipsin_name].append(
                            pos_map.get(pos_key, pos_key)
                        )

                # SipsinItem 생성
                for name, cnt in sipsin_count.items():
                    if cnt > 0:
                        sipsin_items.append(
                            SipsinItem(
                                name=name,
                                count=cnt,
                                positions=sipsin_positions.get(name, []),
                            )
                        )
                logger.debug(
                    f"DEBUG: Python sipsin used: {len(sipsin_items)} items, dominant={sipsin_dominant}"
                )

            # 2) Bazi MCP fallback
            elif raw_myungri and "chart" in raw_myungri:
                bazi_sipsin_map = {}
                chart = raw_myungri["chart"]
                ten_gods = chart.get("ten_gods", {})
                # 개수
                for hanja, count in ten_gods.get("distribution", {}).items():
                    kor_name = SIP_SIN_HANJA_MAP.get(hanja, hanja)
                    if kor_name not in bazi_sipsin_map:
                        bazi_sipsin_map[kor_name] = {"count": 0, "positions": []}
                    bazi_sipsin_map[kor_name]["count"] = count
                # 위치
                pos_map = {"year": "년", "month": "월", "day": "일", "hour": "시"}
                for pillar_key, gods in ten_gods.get("ten_gods_by_pillar", {}).items():
                    kor_pillar = pos_map.get(pillar_key, pillar_key)
                    if gods.get("gan_ten_god"):
                        name = SIP_SIN_HANJA_MAP.get(
                            gods["gan_ten_god"], gods["gan_ten_god"]
                        )
                        if name in bazi_sipsin_map:
                            bazi_sipsin_map[name]["positions"].append(f"{kor_pillar}간")
                    if gods.get("zhi_ten_god"):
                        name = SIP_SIN_HANJA_MAP.get(
                            gods["zhi_ten_god"], gods["zhi_ten_god"]
                        )
                        if name in bazi_sipsin_map:
                            bazi_sipsin_map[name]["positions"].append(f"{kor_pillar}지")

                for name, meta in bazi_sipsin_map.items():
                    if meta["count"] > 0:
                        sipsin_items.append(
                            SipsinItem(
                                name=name,
                                count=meta["count"],
                                positions=meta["positions"],
                            )
                        )
                sipsin_dominant = (
                    ai_adv.get("sipsin", {}).get("dominant", "")
                    if isinstance(ai_adv.get("sipsin"), dict)
                    else ""
                )
                sipsin_weak = (
                    ai_adv.get("sipsin", {}).get("weak", "")
                    if isinstance(ai_adv.get("sipsin"), dict)
                    else ""
                )
                logger.debug(f"DEBUG: Bazi MCP sipsin used: {len(sipsin_items)} items")

            # 3) AI fallback
            else:
                ai_sipsin_dist = (
                    ai_adv.get("sipsin", {}).get("distribution", [])
                    if isinstance(ai_adv.get("sipsin"), dict)
                    else []
                )
                if ai_sipsin_dist and isinstance(ai_sipsin_dist, list):
                    for item in ai_sipsin_dist:
                        try:
                            sipsin_items.append(SipsinItem(**item))
                        except (TypeError, ValueError):
                            pass
                sipsin_dominant = (
                    ai_adv.get("sipsin", {}).get("dominant", "")
                    if isinstance(ai_adv.get("sipsin"), dict)
                    else ""
                )
                sipsin_weak = (
                    ai_adv.get("sipsin", {}).get("weak", "")
                    if isinstance(ai_adv.get("sipsin"), dict)
                    else ""
                )
                logger.debug(
                    f"DEBUG: AI sipsin fallback used: {len(sipsin_items)} items"
                )

            # --- Chart 데이터 준비 ---
            chart = raw_myungri.get("chart", {}) if raw_myungri else {}

            # 항목별 생성 helper (에러 무시)
            def safe_list(cls, data_list):
                res = []
                if isinstance(data_list, list):
                    for d in data_list:
                        try:
                            res.append(cls(**d))
                        except (TypeError, ValueError):
                            pass
                return res

            # 최종 생성
            # --- Interactions 데이터 (우선순위: calculated_pillars > python_myungri > AI) ---
            # [변경] saju_calculator.py의 로직이 최신이므로 calculated_pillars를 우선 사용
            if calculated_pillars and calculated_pillars.get("interactions"):
                interaction_items = safe_list(
                    InteractionItem, calculated_pillars["interactions"].get("items", [])
                )
                gongmang_list = calculated_pillars["interactions"].get("gongmang", [])
                logger.debug(
                    f"DEBUG: Calculated pillars interactions used: {len(interaction_items)} items"
                )
            elif python_myungri and "interactions" in python_myungri:
                py_int = python_myungri["interactions"]
                interaction_items = safe_list(InteractionItem, py_int.get("items", []))
                gongmang_list = py_int.get("gongmang", [])
                logger.debug(
                    f"DEBUG: Python interactions fallback used: {len(interaction_items)} items"
                )
            else:
                interaction_items = safe_list(
                    InteractionItem, ai_adv.get("interactions", {}).get("items", [])
                )
                gongmang_list = ai_adv.get("interactions", {}).get("gongmang", [])

            # --- Sinsal 데이터 (우선순위: calculated_pillars > python_myungri > AI) ---
            if calculated_pillars and calculated_pillars.get("sinsal_items"):
                sinsal_items = safe_list(SinsalItem, calculated_pillars["sinsal_items"])
                logger.debug(
                    f"DEBUG: Calculated pillars sinsal used: {len(sinsal_items)} items"
                )
            elif python_myungri and "sinsal" in python_myungri:
                sinsal_items = safe_list(
                    SinsalItem, python_myungri["sinsal"].get("items", [])
                )
                logger.debug(
                    f"DEBUG: Python sinsal fallback used: {len(sinsal_items)} items"
                )
            else:
                sinsal_items = safe_list(
                    SinsalItem, ai_adv.get("sinsal", {}).get("items", [])
                )

            advanced_data = AdvancedAnalysis(
                wonguk_summary=ai_adv.get("wonguk_summary")
                or "오행과 십신을 분석하여 나만의 에너지 흐름을 파악합니다.",
                # 확정적 데이터 (Sajupy 계산값)
                yinyang_ratio=calculated_pillars.get(
                    "yinyang_ratio", {"yang": 4, "yin": 4}
                )
                if calculated_pillars
                else {"yang": 4, "yin": 4},
                strength=python_myungri.get("strength", "")
                if python_myungri
                else (
                    calculated_pillars.get("strength", "") if calculated_pillars else ""
                ),
                day_master=calculated_pillars.get("day_master", "")
                if calculated_pillars
                else "",
                sipsin=SipsinAnalysis(
                    distribution=sipsin_items,
                    dominant=sipsin_dominant,
                    weak=sipsin_weak,
                    core_trait=ai_adv.get("sipsin", {}).get("core_trait", "")
                    if isinstance(ai_adv.get("sipsin"), dict)
                    else "",
                    strengths=ai_adv.get("sipsin", {}).get("strengths", [])
                    if isinstance(ai_adv.get("sipsin"), dict)
                    else [],
                    risks=ai_adv.get("sipsin", {}).get("risks", [])
                    if isinstance(ai_adv.get("sipsin"), dict)
                    else [],
                ),
                geokguk_yongsin=GeokgukYongsin(**ai_adv.get("geokguk_yongsin", {}))
                if ai_adv.get("geokguk_yongsin")
                else GeokgukYongsin(),
                interactions=InteractionAnalysis(
                    items=interaction_items,
                    gongmang=gongmang_list,
                    gongmang_meaning=ai_adv.get("interactions", {}).get(
                        "gongmang_meaning", ""
                    ),
                ),
                sinsal=SinsalAnalysis(
                    items=sinsal_items,
                    summary=ai_adv.get("sinsal", {}).get("summary", ""),
                ),
                daeun=DaeunAnalysis(**ai_adv.get("daeun", {}))
                if ai_adv.get("daeun")
                else DaeunAnalysis(),
                seun=safe_list(SeunAnalysis, ai_adv.get("seun")),
                practical=PracticalSummary(**ai_adv.get("practical", {}))
                if ai_adv.get("practical")
                else PracticalSummary(),
                time_uncertainty_note=ai_adv.get("time_uncertainty_note", ""),
            )
            logger.debug(
                f"DEBUG: AdvancedAnalysis 생성 성공 (sipsin: {len(sipsin_items)}, interactions: {len(interaction_items)}, sinsal: {len(sinsal_items)})"
            )

        except Exception:
            logger.exception("확정 분석 스키마 변환 실패")

            # Fallback: 최소한의 빈 객체라도 반환하여 UI가 렌더링되도록 함
            try:
                advanced_data = AdvancedAnalysis(
                    wonguk_summary="데이터 분석 중 일부 오류가 발생했으나, 기본 결과를 표시합니다.",
                    sipsin=SipsinAnalysis(),
                    interactions=InteractionAnalysis(),
                    sinsal=SinsalAnalysis(),
                    daeun=DaeunAnalysis(),
                    practical=PracticalSummary(),
                )
            except Exception:
                advanced_data = None

        # 오행 스탯 확정 (Sajupy 계산값 사용 - AI가 만든 값 대신)
        card_data = _parse_card(parsed.get("card", {}))
        if calculated_pillars and "oheng_counts" in calculated_pillars:
            sajupy_counts = calculated_pillars["oheng_counts"]
            card_data.stats = ElementStats(
                wood=sajupy_counts.get("wood", 0),
                fire=sajupy_counts.get("fire", 0),
                earth=sajupy_counts.get("earth", 0),
                metal=sajupy_counts.get("metal", 0),
                water=sajupy_counts.get("water", 0),
            )
            logger.debug(
                f"DEBUG: card.stats를 Sajupy 계산값으로 덮어씀: {sajupy_counts}"
            )

        character_data_2 = None
        if calculated_pillars:
            day_pillar_2 = calculated_pillars.get("day", "")
            if day_pillar_2 and len(day_pillar_2) >= 1:
                from ...schemas.tabs import SajuCharacter

                character_data_2 = SajuCharacter(**get_saju_character(day_pillar_2[0]))

        tabs_data_2 = _parse_tabs(parsed.get("tabs", {}))

        if calculated_pillars and tabs_data_2.money:
            base_balance_2 = calculated_pillars.get("base_balance_weights", {})
            day_master_2 = calculated_pillars.get("day_master", "")
            if base_balance_2 and day_master_2:
                try:
                    _period_els_2 = calculated_pillars.get("oheng_counts", {})
                    if _period_els_2:
                        _scores_2 = compute_scores(
                            _period_els_2, day_master_2, base_balance_2
                        )
                        tabs_data_2.money.wealth_grade = wealth_grade(
                            _scores_2.get("money", 50)
                        )
                except Exception as e:
                    logger.warning(f"wealth_grade injection failed: {e}")

        response = ReadingResponse(
            one_liner=parsed.get("one_liner", ""),
            pillars=PillarsData(**parsed.get("pillars", {}))
            if parsed.get("pillars")
            else PillarsData(),
            card=card_data,
            saju_dna=parsed.get("saju_dna"),
            hidden_personality=parsed.get("hidden_personality"),
            superpower=parsed.get("superpower"),
            hashtags=parsed.get("hashtags"),
            famous_same_stem=parsed.get("famous_same_stem"),
            yearly_predictions=parsed.get("yearly_predictions"),
            character=character_data_2,
            tabs=tabs_data_2,
            advanced_analysis=advanced_data,
            rendered_markdown=response_text if not parsed else "",
            saju_image_base64=saju_image_base64,
            saju_image_prompt=saju_image_prompt,
            meta=MetaData(
                provider=request.model.provider.value,
                model_id=request.model.model_id,
                prompt_version=settings.prompt_version,
                latency_ms=latency_ms,
            ),
        )
        cache_id = None
        should_persist_authoritative_reading = bool(user_id)
        cache_storage_key = (
            birth_key if not bypass_cache else f"reading:{uuid.uuid4().hex}"
        )
        if not bypass_cache or should_persist_authoritative_reading:
            try:
                cache_id = save_to_cache_supabase(
                    cache_storage_key, response, current_model_version
                )
                if cache_id:
                    logger.info(
                        f"[CACHE SAVE] SUCCESS! storage_key={cache_storage_key}, cache_id={cache_id}"
                    )
                else:
                    logger.error(
                        f"[CACHE SAVE] Failed to save: storage_key={cache_storage_key}"
                    )
                log_time("Cache Save")
            except Exception:
                logger.exception("Cache save failed (non-fatal)")
        else:
            logger.info(f"[CACHE SAVE SKIP] bypass_cache=True birth_key={birth_key}")

        logger.debug(
            f"[DEBUG USER READING] user_id={user_id}, cache_id={cache_id}, type(cache_id)={type(cache_id)}"
        )
        response.meta.cache_id = str(cache_id) if cache_id is not None else None
        if user_id and cache_id is not None:
            try:
                reading_id = save_user_reading_supabase(
                    user_id=user_id,
                    cache_id=str(cache_id),
                    profile_id=request.profile_id,
                    label=request.input.name or "내 사주",
                    persona=request.input.persona.value
                    if request.input.persona
                    else "classic",
                    context_json=build_user_reading_context(),
                    processing_time_ms=latency_ms,
                )
                if reading_id:
                    response.meta.reading_id = str(reading_id)
                    logger.info(
                        f"[USER READING SAVE] SUCCESS! user_id={user_id}, reading_id={reading_id}"
                    )
                else:
                    logger.warning("[USER READING SAVE] Failed but non-fatal")
                if cache_id and getattr(request, "profile_id", None):
                    try:
                        supabase.table("saju_profiles").update(
                            {"cache_id": str(cache_id)}
                        ).eq("id", request.profile_id).execute()
                        logger.info(
                            "[SAVE GAP] Linked profile %s -> cache %s",
                            request.profile_id,
                            cache_id,
                        )
                    except Exception as e:
                        logger.warning(
                            "[SAVE GAP] Failed to link profile %s to cache %s: %s",
                            request.profile_id,
                            cache_id,
                            e,
                        )
                log_time("User Reading Save")
            except Exception:
                logger.exception("User reading save failed")
        else:
            logger.debug(
                "[DEBUG USER READING] SKIPPED - user_id is None or cache_id is None"
            )

        try:
            await AnalyticsService.track_analysis_event(
                "reading", "completed", user_id, int((time.time() - start_time) * 1000)
            )
        except Exception:
            pass
        return project_reading_response(response, response_projection)

    except Exception as e:
        logger.exception("Reading creation failed: %s", e)
        try:
            await AnalyticsService.track_analysis_event(
                "reading", "failed", user_id, error_message=str(e)
            )
        except Exception:
            pass
        raise HTTPException(
            status_code=500,
            detail="리딩 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
        )


@router.get("/models", response_model=ModelsResponse)
async def get_models() -> ModelsResponse:
    """사용 가능한 모델 목록 조회"""
    models = []

    # OpenAI 분석 모드 모델 (ID 동기화)
    models.extend(
        [
            ModelInfo(
                id="saju-quick",
                name="빠른 분석 (Quick)",
                provider=Provider.OPENAI,
                description="기본적인 사주 해석 (빠름)",
                is_recommended=False,
            ),
            ModelInfo(
                id="saju-deep",
                name="정밀 분석 (Standard)",
                provider=Provider.OPENAI,
                description="상세하고 논리적인 해석 (추천)",
                is_recommended=True,
            ),
            ModelInfo(
                id="saju-pro",
                name="심층 추론 (Pro)",
                provider=Provider.OPENAI,
                description="최고 수준의 깊이와 통찰 (느림)",
                is_recommended=False,
            ),
        ]
    )

    # Gemini 모델
    models.extend(
        [
            ModelInfo(
                id="gemini-3-flash-preview",
                name="Gemini 3 Flash Preview",
                provider=Provider.GOOGLE,
                description="최신 빠른 모델 (Preview)",
                is_recommended=True,
            ),
            ModelInfo(
                id="gemini-2.0-flash",
                name="Gemini 2.0 Flash",
                provider=Provider.GOOGLE,
                description="이전 세대 빠른 모델",
            ),
            ModelInfo(
                id="gemini-1.5-pro",
                name="Gemini 1.5 Pro",
                provider=Provider.GOOGLE,
                description="긴 컨텍스트 분석에 적합",
            ),
            ModelInfo(
                id="gemini-1.5-flash",
                name="Gemini 1.5 Flash",
                provider=Provider.GOOGLE,
                description="빠르고 효율적",
            ),
        ]
    )

    # Claude 모델
    models.extend(
        [
            ModelInfo(
                id="claude-sonnet-4-20250514",
                name="Claude Sonnet 4",
                provider=Provider.ANTHROPIC,
                description="균형잡힌 성능",
                is_recommended=True,
            ),
            ModelInfo(
                id="claude-3-5-sonnet-20241022",
                name="Claude 3.5 Sonnet",
                provider=Provider.ANTHROPIC,
                description="빠르고 똑똑함",
            ),
        ]
    )

    return ModelsResponse(models=models)


@router.get("/health")
async def health_check():
    """헬스체크"""
    return {"status": "ok", "service": "saju-backend"}


@router.get("/config/features")
async def get_feature_flags() -> dict[str, bool]:
    config = ConfigService()
    flags: dict[str, bool] = {}
    all_config = await config.get_all()

    for key, value in all_config.items():
        if key.startswith("feature_") and key.endswith("_enabled"):
            flags[key] = str(value).lower() in ("true", "1", "yes")

    return flags


# TODO OPS-6: Health endpoint should check DB connectivity and LLM provider status.
# TODO OPS-6: Consider: /health/ready (full check) vs /health/live (simple ping).


# =============================================================================
# Helper Functions
# =============================================================================

router.add_api_route(
    "/reading/start",
    start_reading_job,
    methods=["POST"],
    response_model=JobStartResponse,
)
router.add_api_route(
    "/reading/status/{job_id}",
    get_reading_status,
    methods=["GET"],
    response_model=JobStatusResponse,
    response_model_exclude_unset=True,
)
router.add_api_route(
    "/reading/{reading_id}",
    get_reading_detail,
    methods=["GET"],
    response_model=ReadingResponse,
    response_model_exclude_unset=True,
)
router.add_api_route(
    "/reading/bootstrap",
    bootstrap_resume_reading,
    methods=["POST"],
    response_model=ReadingResumeBootstrapResponse,
)
router.add_api_route(
    "/cache/by-params",
    get_cached_reading_by_params,
    methods=["GET"],
)
router.add_api_route(
    "/cache/by-profile/{profile_id}",
    get_cached_reading_by_profile,
    methods=["GET"],
)
router.add_api_route(
    "/cache/{birth_key}",
    get_cached_reading_by_key,
    methods=["GET"],
)
