"""
기운 캘린더(년/월/일 흐름) API 라우터

- 기본은 LLM 없이 규칙 기반으로 점수/구간을 계산합니다.
"""

from datetime import date
import calendar
import json
import logging
import time
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel

from sajupy import calculate_saju

from ..config import get_settings
from ..db.supabase_client import supabase
from ..providers.base import llm_call_with_retry
from ..providers.factory import ProviderFactory
from ..schemas import (
    FlowMonthlyRequest,
    FlowMonthlyResponse,
    FlowMonthlyPoint,
    FlowDailyRequest,
    FlowDailyResponse,
    FlowDailyPoint,
    FlowDetailRequest,
    FlowDetailResponse,
    FlowAiAdviceRequest,
    FlowAiAdviceResponse,
    FlowScores,
    FlowHighlights,
    ElementStats,
    Provider,
)
from ..services.analytics_service import AnalyticsService
from ..services.config_service import config_service, get_provider_for_model
from ..utils.flow_calculator import (
    merge_weighted_pillars,
    compute_balance_weights,
    compute_scores,
    score_badge,
    category_note,
    highlight_windows,
    format_ganji,
    build_detail_advice,
    relation_strengths,
    REL_KO,
    dominant_elements,
    ELEMENT_KO,
)
from ..utils.saju_calculator import get_calculated_pillars
from ..utils.birth_normalizer import normalize_birth_to_solar
from ..utils.text_postprocessor import postprocess_reading_response
from .auth import get_current_user
from .deps import rate_limit_dependency, get_current_user_id
from .payment import charge_for_paid_feature, refund_on_failure, FEATURE_PRICES

logger = logging.getLogger(__name__)

FLOW_AI_ADVICE_PRICE = FEATURE_PRICES.get("flow_ai_advice", 20)


router = APIRouter(tags=["flow"])


class SavedAdviceResponse(BaseModel):
    found: bool
    advice: Optional[dict] = None
    created_at: Optional[str] = None


@router.get(
    "/flow/ai-advice/{profile_id}/{date_str}", response_model=SavedAdviceResponse
)
async def get_saved_ai_advice(
    profile_id: str,
    date_str: str,
    category: str = Query(default="general"),
    user_id: str = Depends(get_current_user_id),
) -> SavedAdviceResponse:
    """저장된 AI 조언 조회 (결제 없이 캐시된 결과 반환)"""
    try:
        res = (
            supabase.table("user_flow_advices")
            .select("*")
            .eq("user_id", user_id)
            .eq("profile_id", profile_id)
            .eq("target_date", date_str)
            .eq("category", category)
            .single()
            .execute()
        )

        if res.data and isinstance(res.data, dict):
            advice_data = res.data.get("advice_data")
            return SavedAdviceResponse(
                found=True,
                advice=advice_data if isinstance(advice_data, dict) else None,
                created_at=str(res.data.get("created_at", "")),
            )
    except Exception as e:
        logger.debug(f"No saved advice found: {e}")

    return SavedAdviceResponse(found=False)


def _parse_birth_input(birth_input):
    try:
        birth_solar = normalize_birth_to_solar(
            birth_input.birth_solar,
            getattr(birth_input, "calendar_type", "solar"),
        )
        y, m, d = map(int, birth_solar.split("-"))
        hh, mm = map(int, birth_input.birth_time.split(":"))
        gender_for_calc = birth_input.gender or "male"
        return y, m, d, hh, mm, gender_for_calc
    except (ValueError, AttributeError) as e:
        raise HTTPException(
            status_code=400, detail=f"birth_input 형식이 올바르지 않습니다: {e}"
        )


def _elements_to_stats(elements: dict) -> ElementStats:
    return ElementStats(
        wood=float(elements.get("wood", 0.0)),
        fire=float(elements.get("fire", 0.0)),
        earth=float(elements.get("earth", 0.0)),
        metal=float(elements.get("metal", 0.0)),
        water=float(elements.get("water", 0.0)),
    )


@router.post("/flow/monthly", response_model=FlowMonthlyResponse)
async def flow_monthly(
    request: FlowMonthlyRequest,
    _rate_limit: None = Depends(rate_limit_dependency(60, scope="flow")),
) -> FlowMonthlyResponse:
    birth_y, birth_m, birth_d, birth_h, birth_min, gender_for_calc = _parse_birth_input(
        request.birth_input
    )

    base = get_calculated_pillars(
        birth_y, birth_m, birth_d, birth_h, birth_min, gender_for_calc
    )
    if not base:
        raise HTTPException(status_code=500, detail="사주 계산에 실패했습니다.")

    base_counts = base.get("oheng_counts", {})
    balance_weights = compute_balance_weights(base_counts)
    day_master = base.get("day_master", "")

    points: list[FlowMonthlyPoint] = []
    for month in range(1, 13):
        # 월의 중심(15일 12시) 기준으로 월기운을 대표값으로 사용
        res = calculate_saju(request.year, month, 15, 12, 0)
        year_pillar = res.get("year_pillar", "")
        month_pillar = res.get("month_pillar", "")

        period_elements = merge_weighted_pillars(
            (month_pillar, 0.7), (year_pillar, 0.3)
        )
        scores = compute_scores(
            period_elements=period_elements,
            day_master_korean_or_eng=day_master,
            base_balance_weights=balance_weights,
            gender=request.birth_input.gender,
        )

        category_key = (
            request.category.value
            if hasattr(request.category, "value")
            else str(request.category)
        )
        selected = int(scores.get(category_key, scores["general"]))
        rels = relation_strengths(period_elements, day_master)
        top_rel = max(rels.keys(), key=lambda k: rels[k])
        dom_elems = dominant_elements(period_elements, top_n=1)
        elem_tag = ELEMENT_KO[dom_elems[0]] if dom_elems else ""

        points.append(
            FlowMonthlyPoint(
                month=month,
                label=f"{month}월",
                ganji=format_ganji(month_pillar),
                elements=_elements_to_stats(period_elements),
                scores=FlowScores(**scores),
                badge=score_badge(selected),
                note=f"{REL_KO[top_rel]} 흐름{(' · ' + elem_tag) if elem_tag else ''} · {category_note(category_key, selected)}",
            )
        )

    labels = [p.label for p in points]
    scores_for_cat = [
        int(
            getattr(
                p.scores,
                request.category.value
                if hasattr(request.category, "value")
                else str(request.category),
                p.scores.general,
            )
        )
        for p in points
    ]
    highlights = highlight_windows(
        labels, scores_for_cat, good_min_len=2, caution_min_len=2
    )

    return FlowMonthlyResponse(
        year=request.year,
        category=request.category,
        points=points,
        highlights=FlowHighlights(**highlights),
    )


@router.post("/flow/daily", response_model=FlowDailyResponse)
async def flow_daily(
    request: FlowDailyRequest,
    _rate_limit: None = Depends(rate_limit_dependency(60, scope="flow")),
) -> FlowDailyResponse:
    if request.month < 1 or request.month > 12:
        raise HTTPException(status_code=400, detail="month는 1~12 사이여야 합니다.")

    birth_y, birth_m, birth_d, birth_h, birth_min, gender_for_calc = _parse_birth_input(
        request.birth_input
    )
    base = get_calculated_pillars(
        birth_y, birth_m, birth_d, birth_h, birth_min, gender_for_calc
    )
    if not base:
        raise HTTPException(status_code=500, detail="사주 계산에 실패했습니다.")

    base_counts = base.get("oheng_counts", {})
    balance_weights = compute_balance_weights(base_counts)
    day_master = base.get("day_master", "")

    last_day = calendar.monthrange(request.year, request.month)[1]
    points: list[FlowDailyPoint] = []
    for d in range(1, last_day + 1):
        res = calculate_saju(request.year, request.month, d, 12, 0)
        year_pillar = res.get("year_pillar", "")
        month_pillar = res.get("month_pillar", "")
        day_pillar = res.get("day_pillar", "")

        period_elements = merge_weighted_pillars(
            (day_pillar, 0.6), (month_pillar, 0.3), (year_pillar, 0.1)
        )
        scores = compute_scores(
            period_elements=period_elements,
            day_master_korean_or_eng=day_master,
            base_balance_weights=balance_weights,
            gender=request.birth_input.gender,
        )

        category_key = (
            request.category.value
            if hasattr(request.category, "value")
            else str(request.category)
        )
        selected = int(scores.get(category_key, scores["general"]))

        points.append(
            FlowDailyPoint(
                date=date(request.year, request.month, d).isoformat(),
                day=d,
                ganji=format_ganji(day_pillar),
                elements=_elements_to_stats(period_elements),
                scores=FlowScores(**scores),
                badge=score_badge(selected),
            )
        )

    labels = [p.date for p in points]
    scores_for_cat = [
        int(
            getattr(
                p.scores,
                request.category.value
                if hasattr(request.category, "value")
                else str(request.category),
                p.scores.general,
            )
        )
        for p in points
    ]
    highlights = highlight_windows(
        labels, scores_for_cat, good_min_len=3, caution_min_len=3
    )

    return FlowDailyResponse(
        year=request.year,
        month=request.month,
        category=request.category,
        points=points,
        highlights=FlowHighlights(**highlights),
    )


@router.post("/flow/detail", response_model=FlowDetailResponse)
async def flow_detail(
    request: FlowDetailRequest,
    _rate_limit: None = Depends(rate_limit_dependency(30, scope="flow")),
) -> FlowDetailResponse:
    try:
        y, m, d = map(int, request.date.split("-"))
        _ = date(y, m, d)  # validate
    except (ValueError, AttributeError) as e:
        raise HTTPException(
            status_code=400, detail=f"date는 YYYY-MM-DD 형식이어야 합니다: {e}"
        )

    birth_y, birth_m, birth_d, birth_h, birth_min, gender_for_calc = _parse_birth_input(
        request.birth_input
    )
    base = get_calculated_pillars(
        birth_y, birth_m, birth_d, birth_h, birth_min, gender_for_calc
    )
    if not base:
        raise HTTPException(status_code=500, detail="사주 계산에 실패했습니다.")

    base_counts = base.get("oheng_counts", {})
    balance_weights = compute_balance_weights(base_counts)
    day_master = base.get("day_master", "")

    res = calculate_saju(y, m, d, 12, 0)
    year_pillar = res.get("year_pillar", "")
    month_pillar = res.get("month_pillar", "")
    day_pillar = res.get("day_pillar", "")

    period_elements = merge_weighted_pillars(
        (day_pillar, 0.6), (month_pillar, 0.3), (year_pillar, 0.1)
    )
    scores = compute_scores(
        period_elements=period_elements,
        day_master_korean_or_eng=day_master,
        base_balance_weights=balance_weights,
        gender=request.birth_input.gender,
    )

    category_key = (
        request.category.value
        if hasattr(request.category, "value")
        else str(request.category)
    )
    selected = int(scores.get(category_key, scores["general"]))

    advice = build_detail_advice(
        category=category_key,
        score=selected,
        period_elements=period_elements,
        day_master=day_master,
        base_counts=base_counts,
        date_key=request.date,
        day_pillar=day_pillar,
        natal_pillars={
            "year": str(base.get("year", ""))[:2],
            "month": str(base.get("month", ""))[:2],
            "day": str(base.get("day", ""))[:2],
            "hour": str(base.get("hour", ""))[:2],
        },
    )

    return FlowDetailResponse(
        date=request.date,
        category=request.category,
        year_ganji=format_ganji(year_pillar),
        month_ganji=format_ganji(month_pillar),
        day_ganji=format_ganji(day_pillar),
        seed_pillar=format_ganji(day_pillar),
        elements=_elements_to_stats(period_elements),
        scores=FlowScores(**scores),
        summary=str(advice.get("summary", "")),
        why=list(advice.get("why", []) or []),
        do=list(advice.get("do", []) or []),
        dont=list(advice.get("dont", []) or []),
        caution_note=str(advice.get("caution_note", "")),
    )


@router.post("/flow/ai-advice", response_model=FlowAiAdviceResponse)
async def flow_ai_advice(
    request: FlowAiAdviceRequest,
    current_user: Optional[dict] = Depends(get_current_user),
    user_id: str = Depends(get_current_user_id),
    _rate_limit: None = Depends(
        rate_limit_dependency(get_settings().rate_limit_per_minute, scope="flow_ai")
    ),
) -> FlowAiAdviceResponse:
    start_time = time.time()
    if not current_user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다")

    try:
        y, m, d = map(int, request.date.split("-"))
        _ = date(y, m, d)
    except (ValueError, AttributeError) as e:
        raise HTTPException(
            status_code=400, detail=f"date는 YYYY-MM-DD 형식이어야 합니다: {e}"
        )

    birth_y, birth_m, birth_d, birth_h, birth_min, gender_for_calc = _parse_birth_input(
        request.birth_input
    )
    base = get_calculated_pillars(
        birth_y, birth_m, birth_d, birth_h, birth_min, gender_for_calc
    )
    if not base:
        raise HTTPException(status_code=500, detail="사주 계산에 실패했습니다.")

    flow_ai_advice_price = await config_service.get_feature_price(
        "flow_ai_advice", FLOW_AI_ADVICE_PRICE
    )
    payment = await charge_for_paid_feature(
        user_id, "flow_ai_advice", flow_ai_advice_price, "기운 캘린더 AI 조언"
    )
    if not payment.success:
        if "부족" in (payment.error or ""):
            raise HTTPException(status_code=402, detail=payment.error)
        raise HTTPException(status_code=400, detail=payment.error or "결제 처리 실패")

    try:
        await AnalyticsService.track_analysis_event(
            "flow_ai_advice", "started", user_id
        )
    except Exception:
        pass

    base_counts = base.get("oheng_counts", {})
    balance_weights = compute_balance_weights(base_counts)
    day_master = base.get("day_master", "")
    strength = base.get("strength", "")

    res = calculate_saju(y, m, d, 12, 0)
    year_pillar = res.get("year_pillar", "")
    month_pillar = res.get("month_pillar", "")
    day_pillar = res.get("day_pillar", "")

    period_elements = merge_weighted_pillars(
        (day_pillar, 0.6), (month_pillar, 0.3), (year_pillar, 0.1)
    )
    scores = compute_scores(
        period_elements=period_elements,
        day_master_korean_or_eng=day_master,
        base_balance_weights=balance_weights,
        gender=request.birth_input.gender,
    )

    category_key = (
        request.category.value
        if hasattr(request.category, "value")
        else str(request.category)
    )
    selected = int(scores.get(category_key, scores["general"]))
    badge = score_badge(selected)

    # 규칙 기반 요약을 함께 제공해서 LLM이 '흔들리지 않게' 가드합니다.
    deterministic = build_detail_advice(
        category=category_key,
        score=selected,
        period_elements=period_elements,
        day_master=day_master,
        base_counts=base_counts,
        date_key=request.date,
        day_pillar=day_pillar,
        natal_pillars={
            "year": str(base.get("year", ""))[:2],
            "month": str(base.get("month", ""))[:2],
            "day": str(base.get("day", ""))[:2],
            "hour": str(base.get("hour", ""))[:2],
        },
    )

    korean_map = {
        "wood": "목",
        "fire": "화",
        "earth": "토",
        "metal": "금",
        "water": "수",
    }
    counts_text = ", ".join(
        [
            f"{korean_map.get(k, k)} {base_counts.get(k, 0)}"
            for k in ["wood", "fire", "earth", "metal", "water"]
        ]
    )

    prompt = f"""
[목표]
사용자의 '원국(사주)' + 선택한 날짜의 '기운(년/월/일 간지)'를 바탕으로,
선택 카테고리({category_key}) 관점에서 '좋은 점/나쁜 점/해야 할 것/조심할 것'을 더 자세히 설명하세요.

[사용자 정보]
- 생년월일시: {request.birth_input.birth_solar} {request.birth_input.birth_time}
- 원국 간지: 년주 {base.get("year", "")}, 월주 {base.get("month", "")}, 일주 {base.get("day", "")}, 시주 {base.get("hour", "")}
- 일간 오행: {day_master}
- 신강/신약: {strength}
- 오행 분포(카운트): {counts_text}

[선택 날짜]
- 날짜: {request.date}
- 간지: 년 {format_ganji(year_pillar)} / 월 {format_ganji(month_pillar)} / 일 {format_ganji(day_pillar)}
- 점수: {selected}/100 ({badge})

[규칙 기반 힌트(방향성 고정)]
- 한줄 요약: {deterministic.get("summary", "")}
- 왜: {json.dumps(deterministic.get("why", []), ensure_ascii=False)}
- 하면 좋은 것: {json.dumps(deterministic.get("do", []), ensure_ascii=False)}
- 피하면 좋은 것: {json.dumps(deterministic.get("dont", []), ensure_ascii=False)}

[작성 규칙]
- 과장/공포 조장/단정 금지. '가능성'과 '운영법' 위주로.
- 너무 뻔한 말 대신, 사용자가 오늘 바로 실행 가능한 수준으로 구체화.
- 문장은 기계적인 항목 나열보다, 현재 흐름 -> 갈림길 -> 대응이 이어지는 해설처럼 자연스럽게 연결.
- 아래 JSON 형식으로만 응답. 마크다운/코드블록 금지.

{{
  "headline": "오늘의 한 줄 헤드라인(짧게)",
  "summary": "3~4문장 요약. 짧더라도 흐름이 이어지게 작성",
  "good_points": ["좋은 점 4~6개"],
  "bad_points": ["나쁜 점/리스크 4~6개"],
  "do": ["해야 할 것 4~6개"],
  "dont": ["조심/피해야 할 것 4~6개"],
  "detailed": "8~14문장 정도의 상세 설명(문단 가능, 보고서처럼 끊지 말고 이야기하듯 연결)",
  "disclaimer": "사주는 참고용이며 최종 판단은 본인에게 있다는 고지"
}}
""".strip()

    try:
        model_id = await config_service.get_model_flow()
        reasoning_effort = await config_service.get_reasoning_effort_flow()
        provider = ProviderFactory.get_provider(get_provider_for_model(model_id))
        response_text = await llm_call_with_retry(
            provider.generate,
            prompt=prompt,
            model_id=model_id,
            temperature=0.9,
            response_format={"type": "json_object"},
            reasoning_effort=reasoning_effort,
        )

        cleaned_text = (response_text or "").strip()

        if cleaned_text.startswith("```"):
            lines = cleaned_text.split("\n")
            if lines and lines[-1].strip() == "```":
                lines = lines[1:-1]
            else:
                lines = lines[1:]
            cleaned_text = "\n".join(lines).strip()

        if not cleaned_text.startswith("{"):
            start = cleaned_text.find("{")
            end = cleaned_text.rfind("}")
            if start != -1 and end != -1:
                cleaned_text = cleaned_text[start : end + 1]

        data = json.loads(cleaned_text)
        data = postprocess_reading_response(data)

        # 누락 방어
        data.setdefault("headline", "")
        data.setdefault("summary", "")
        data.setdefault("good_points", [])
        data.setdefault("bad_points", [])
        data.setdefault("do", [])
        data.setdefault("dont", [])
        data.setdefault("detailed", "")
        data.setdefault(
            "disclaimer", "사주는 참고용이며 최종 판단은 본인에게 있습니다."
        )

        response = FlowAiAdviceResponse(
            date=request.date,
            category=request.category,
            headline=str(data.get("headline", "")),
            summary=str(data.get("summary", "")),
            good_points=list(data.get("good_points", []) or []),
            bad_points=list(data.get("bad_points", []) or []),
            do=list(data.get("do", []) or []),
            dont=list(data.get("dont", []) or []),
            detailed=str(data.get("detailed", "")),
            disclaimer=str(data.get("disclaimer", "")),
        )

        if request.profile_id:
            try:
                supabase.table("user_flow_advices").upsert(
                    {
                        "user_id": user_id,
                        "profile_id": request.profile_id,
                        "target_date": request.date,
                        "category": category_key,
                        "advice_data": response.model_dump(),
                    },
                    on_conflict="user_id,profile_id,target_date,category",
                ).execute()
            except Exception as save_err:
                logger.warning(f"Failed to save AI advice to DB: {save_err}")

        try:
            await AnalyticsService.track_analysis_event(
                "flow_ai_advice",
                "completed",
                user_id,
                int((time.time() - start_time) * 1000),
            )
        except Exception:
            pass
        return response
    except HTTPException:
        if payment.transaction_id:
            await refund_on_failure(
                user_id,
                payment.transaction_id,
                "서비스 오류 환불",
                feature_key="flow_ai_advice",
            )
        raise
    except Exception as e:
        logger.exception("Error in flow AI advice API")
        try:
            await AnalyticsService.track_analysis_event(
                "flow_ai_advice", "failed", user_id, error_message=str(e)
            )
        except Exception:
            pass
        refunded = False
        if payment.transaction_id:
            refunded = await refund_on_failure(
                user_id,
                payment.transaction_id,
                "AI 조언 생성 오류",
                feature_key="flow_ai_advice",
            )
        detail = "AI 상세 조언 생성 중 오류가 발생했습니다. " + (
            "엽전이 환불되었습니다."
            if refunded
            else "환불 처리에 실패했습니다. 고객센터에 문의해주세요."
        )
        raise HTTPException(status_code=502, detail=detail)
