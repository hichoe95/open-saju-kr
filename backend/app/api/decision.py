from fastapi import APIRouter, HTTPException, Depends
from ..schemas import DecisionResponse, BirthInput, PersonaType
from ..utils.saju_calculator import get_calculated_pillars
from ..providers.factory import ProviderFactory
from ..providers.base import llm_call_with_retry
from ..utils.text_postprocessor import postprocess_reading_response
from ..config import get_settings
from .deps import rate_limit_dependency, get_current_user_id
from .auth import get_current_user
from .payment import charge_for_paid_feature, refund_on_failure, FEATURE_PRICES
from ..services.analytics_service import AnalyticsService
from ..services.config_service import config_service, get_provider_for_model
from ..prompt_manager import PromptManager
from pydantic import BaseModel, Field
from typing import Optional
import json
import time
from ..utils.json_parser import parse_llm_json
import logging
from korean_lunar_calendar import KoreanLunarCalendar

router = APIRouter(tags=["decision"])
logger = logging.getLogger(__name__)

AI_CHAT_PRICE = FEATURE_PRICES.get("ai_chat", 50)
prompt_manager = PromptManager()


# 확장된 Decision Input (사주 분석 결과 포함)
class ExtendedDecisionInput(BaseModel):
    birth_input: BirthInput
    question: str = Field(..., max_length=2000, description="질문 (최대 2000자)")
    domain: str = "general"
    saju_context: Optional[str] = Field(
        default=None, max_length=10000, description="사주 분석 결과 요약 (최대 10000자)"
    )


@router.post("/decision", response_model=DecisionResponse)
async def create_decision(
    input_data: ExtendedDecisionInput,
    current_user: Optional[dict] = Depends(get_current_user),
    user_id: str = Depends(get_current_user_id),
    _rate_limit: None = Depends(
        rate_limit_dependency(get_settings().rate_limit_per_minute, scope="decision")
    ),
):
    if not current_user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다")

    b = input_data.birth_input
    birth_solar = b.birth_solar

    if b.calendar_type == "lunar":
        try:
            l_calendar = KoreanLunarCalendar()
            ly, lm, ld = map(int, birth_solar.split("-"))
            if l_calendar.setLunarDate(ly, lm, ld, False):
                method_name = "getSolarIsoFormat"
                get_solar_iso = getattr(l_calendar, method_name, None)
                if callable(get_solar_iso):
                    solar_value = get_solar_iso()
                    birth_solar = str(solar_value)
                logger.debug(f"Lunar {ly}-{lm}-{ld} -> Solar {birth_solar}")
        except Exception as e:
            logger.warning(f"Lunar conversion failed: {e}")

    try:
        birth_year, birth_month, birth_day = map(int, birth_solar.split("-"))
        hour, minute = 0, 0
        if b.birth_time:
            hour, minute = map(int, b.birth_time.split(":"))

        pillars_dict = get_calculated_pillars(
            birth_year, birth_month, birth_day, hour, minute
        )
        if not pillars_dict:
            raise ValueError("Saju calculation failed")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid birth data: {str(e)}")

    ai_chat_price = await config_service.get_feature_price("ai_chat", AI_CHAT_PRICE)
    payment = await charge_for_paid_feature(
        user_id, "ai_chat", ai_chat_price, "AI 도사 상담"
    )
    if not payment.success:
        if "부족" in (payment.error or ""):
            raise HTTPException(status_code=402, detail=payment.error)
        raise HTTPException(status_code=400, detail=payment.error or "결제 처리 실패")

    start_time = time.time()
    try:
        await AnalyticsService.track_analysis_event("ai_chat", "started", user_id)
    except Exception:
        pass

    # 2. 분야별 맥락 설정
    domain_context = {
        "general": "일반적인 인생 고민",
        "love": "연애, 썸, 관계에 대한 고민",
        "money": "금전, 투자, 재테크에 대한 고민",
        "career": "이직, 취업, 커리어에 대한 고민",
        "study": "학업, 시험, 진로에 대한 고민",
        "health": "건강에 대한 고민",
    }

    domain_name = domain_context.get(input_data.domain, "일반적인 고민")
    gender_label = "남성" if b.gender == "male" else "여성"
    calendar_label = "양력" if b.calendar_type == "solar" else "음력"
    context_topic = b.context.topic.value if b.context else "general"
    context_details = b.context.details if b.context and b.context.details else "없음"

    # 한국 시간 기준 현재 시각
    from datetime import datetime, timedelta, timezone

    kst = datetime.now(timezone.utc) + timedelta(hours=9)
    current_time_str = kst.strftime("%Y년 %m월 %d일 %H시 %M분")

    persona = b.persona or PersonaType.CLASSIC
    persona_prompt = prompt_manager.get_persona_prompt(persona)

    # 4. 프롬프트 구성 (페르소나 + 사주 분석 결과 포함)
    prompt = f"""{persona_prompt}

사용자의 사주 정보와 이전 분석 결과를 참고하여, 구체적인 질문에 대해 실질적인 조언을 제공해주세요.
중요: 위 [페르소나] 지침의 말투와 톤을 철저히 따라 응답하세요.

[현재 시각 (기준)]
{current_time_str}

[사용자 기본 정보]
- 이름(있으면): {b.name or "미입력"}
- 생년월일시: {birth_solar} {b.birth_time}
- 음력 생년월일(있으면): {b.birth_lunar or "미입력"}
- 달력 기준: {calendar_label}
- 성별: {gender_label}
- 출생지/국가: {b.birth_place}
- 기준 시간대: {b.timezone}
- 상담 주제: {context_topic}
- 고민 상세: {context_details}
- 사주 간지: 
  년주: {pillars_dict["year"]}
  월주: {pillars_dict["month"]}
  일주: {pillars_dict["day"]}
  시주: {pillars_dict["hour"]}

[이전 사주 분석 맥락]
{input_data.saju_context or "분석 정보 없음"}

[질문 분야]
{domain_name}

[사용자의 구체적 질문]
{input_data.question}

---

위 정보를 기반으로 아래 JSON 형식으로 답변해주세요.
모든 내용은 한국어로 작성하고, 사주 분석 결과를 참고하여 맞춤형 조언을 제공하세요.

{{
  "recommendation": "go" 또는 "wait" 또는 "no" (go: 진행해도 좋음, wait: 조금 기다려볼 것, no: 재고 필요),
  "summary": "결론을 1-2문장으로 요약",
  "pros": ["이 결정의 장점/기회 3개"],
  "cons": ["이 결정의 단점/리스크 3개"],
  "risk_checks": ["주의해야 할 점 2-3개"],
  "next_actions": ["당장 해야 할 구체적인 행동 2-3개"],
  "advice": "도사가 사용자에게 직접 말하듯이 건네는 조언. (3~5문장, 위 [페르소나] 지침의 말투/톤을 정확히 반영하여 작성)",
  "disclaimer": "사주는 참고용이며 최종 결정은 본인의 판단에 따르세요."
}}

응답은 반드시 유효한 JSON 형식으로만 작성하세요. 마크다운 코드블록을 사용하지 마세요.
"""

    try:
        model_id = await config_service.get_model_decision()
        reasoning_effort = await config_service.get_reasoning_effort_decision()
        provider = ProviderFactory.get_provider(get_provider_for_model(model_id))

        response_text = await llm_call_with_retry(
            provider.generate,
            prompt=prompt,
            model_id=model_id,
            temperature=0.7,
            response_format={"type": "json_object"},
            reasoning_effort=reasoning_effort,
        )

        data = parse_llm_json(response_text)

        if not data:
            logger.error(f"JSON parsing failed, raw response: {response_text[:500]}")
            raise json.JSONDecodeError("Empty result", response_text, 0)

        data = postprocess_reading_response(data)

        try:
            await AnalyticsService.track_analysis_event(
                "ai_chat", "completed", user_id, int((time.time() - start_time) * 1000)
            )
        except Exception:
            pass
        return DecisionResponse(**data)

    except json.JSONDecodeError as je:
        logger.error(f"JSON Parse Error in decision API: {je}")
        try:
            await AnalyticsService.track_analysis_event(
                "ai_chat", "failed", user_id, error_message="JSON parse error"
            )
        except Exception:
            pass
        refunded = False
        if payment.transaction_id:
            refunded = await refund_on_failure(
                user_id,
                payment.transaction_id,
                "AI 응답 파싱 오류",
                feature_key="ai_chat",
            )
        detail = "AI 응답 형식이 올바르지 않습니다. " + (
            "엽전이 환불되었습니다."
            if refunded
            else "환불 처리에 실패했습니다. 고객센터에 문의해주세요."
        )
        raise HTTPException(status_code=500, detail=detail)
    except HTTPException:
        if payment.transaction_id:
            await refund_on_failure(
                user_id,
                payment.transaction_id,
                "서비스 오류 환불",
                feature_key="ai_chat",
            )
        raise
    except Exception as e:
        logger.exception("Error in decision API")
        try:
            await AnalyticsService.track_analysis_event(
                "ai_chat", "failed", user_id, error_message=str(e)
            )
        except Exception:
            pass
        refunded = False
        if payment.transaction_id:
            refunded = await refund_on_failure(
                user_id, payment.transaction_id, "서비스 오류", feature_key="ai_chat"
            )
        detail = "결정 분석 중 오류가 발생했습니다. " + (
            "엽전이 환불되었습니다."
            if refunded
            else "환불 처리에 실패했습니다. 고객센터에 문의해주세요."
        )
        raise HTTPException(status_code=500, detail=detail)
