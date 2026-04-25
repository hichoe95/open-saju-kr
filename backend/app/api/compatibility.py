import time
import json
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from ..schemas import CompatibilityRequest, CompatibilityResponse, MetaData
from ..providers.factory import ProviderFactory
from ..providers.base import llm_call_with_retry
from ..prompt_manager import get_prompt_manager
from ..config import get_settings
from ..utils.saju_calculator import get_calculated_pillars
from ..utils.birth_normalizer import normalize_birth_to_solar
from .deps import rate_limit_dependency, get_current_user_id
from .auth import get_current_user
from .payment import charge_for_paid_feature, refund_on_failure, FEATURE_PRICES
from ..services.analytics_service import AnalyticsService
from ..services.config_service import config_service, get_provider_for_model
from ..services.compatibility_job_service import (
    get_compatibility_job_status,
    start_compatibility_job,
)
from ..schemas.job import (
    CompatibilityJobStartRequest,
    CompatibilityJobStartResponse,
    CompatibilityJobStatusResponse,
)

router = APIRouter(prefix="/analyze", tags=["compatibility"])
logger = logging.getLogger(__name__)

COMPATIBILITY_PRICE = FEATURE_PRICES.get("compatibility", 50)


async def generate_compatibility_result(
    request: CompatibilityRequest,
    user_id: Optional[str] = None,
) -> CompatibilityResponse:
    def calc_saju(user_input):
        birth_solar = normalize_birth_to_solar(
            user_input.birth_solar,
            getattr(user_input, "calendar_type", "solar"),
        )
        y, m, d = map(int, birth_solar.split("-"))
        h, mi = map(int, user_input.birth_time.split(":"))
        gender = user_input.gender or "male"
        return get_calculated_pillars(y, m, d, h, mi, gender)

    try:
        pillars_a = calc_saju(request.user_a)
        pillars_b = calc_saju(request.user_b)
        if not pillars_a or not pillars_b:
            raise ValueError("Saju calculation failed")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid birth data: {str(e)}")

    start_time = time.time()

    if user_id:
        try:
            await AnalyticsService.track_analysis_event(
                "compatibility", "started", user_id
            )
        except Exception:
            pass

    model_id = await config_service.get_model_compatibility()
    reasoning_effort = await config_service.get_reasoning_effort_compatibility()
    provider = ProviderFactory.get_provider(get_provider_for_model(model_id))

    prompt_manager = get_prompt_manager()
    settings = get_settings()

    prompt = prompt_manager.build_compatibility_prompt(
        user_a_input=request.user_a,
        user_a_pillars=pillars_a,
        user_a_oheng=pillars_a.get("oheng_counts", {}),
        user_b_input=request.user_b,
        user_b_pillars=pillars_b,
        user_b_oheng=pillars_b.get("oheng_counts", {}),
        version=settings.prompt_version,
        scenario=request.scenario,
    )

    response_text = await llm_call_with_retry(
        provider.generate,
        prompt=prompt,
        model_id=model_id,
        temperature=request.model.temperature,
        response_format={"type": "json_object"},
        reasoning_effort=reasoning_effort,
    )

    cleaned_response = response_text.strip()
    if cleaned_response.startswith("```"):
        cleaned_response = cleaned_response.strip("`").replace("json", "").strip()

    try:
        parsed = json.loads(cleaned_response)
    except json.JSONDecodeError as je:
        logger.error(
            f"[COMPATIBILITY] JSON parsing failed: {je}, raw: {response_text[:500]}"
        )
        if user_id:
            try:
                await AnalyticsService.track_analysis_event(
                    "compatibility", "failed", user_id, error_message="json_parse_error"
                )
            except Exception:
                pass
        raise HTTPException(
            status_code=500, detail="궁합 분석 응답 파싱에 실패했습니다."
        )

    latency_ms = int((time.time() - start_time) * 1000)

    response = CompatibilityResponse(
        summary=parsed.get("summary", ""),
        score=parsed.get("score", 0),
        keyword=parsed.get("keyword", ""),
        personality_fit=parsed.get("personality_fit", ""),
        element_balance=parsed.get("element_balance", ""),
        conflict_points=parsed.get("conflict_points", ""),
        advice=parsed.get("advice", ""),
        full_text=parsed.get("full_text"),
        meta=MetaData(
            provider=get_provider_for_model(model_id).value,
            model_id=model_id,
            prompt_version=settings.prompt_version,
            latency_ms=latency_ms,
        ),
    )

    if user_id:
        try:
            await AnalyticsService.track_analysis_event(
                "compatibility", "completed", user_id, latency_ms
            )
        except Exception:
            pass

    return response


@router.post("/compatibility/start", response_model=CompatibilityJobStartResponse)
async def start_compatibility_analysis(
    request: CompatibilityJobStartRequest,
    background_tasks: BackgroundTasks,
    current_user: Optional[dict] = Depends(get_current_user),
    user_id: str = Depends(get_current_user_id),
    _rate_limit: None = Depends(
        rate_limit_dependency(
            get_settings().rate_limit_per_minute, scope="compatibility_start"
        )
    ),
) -> CompatibilityJobStartResponse:
    if not current_user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다")

    compatibility_price = await config_service.get_feature_price(
        "compatibility", COMPATIBILITY_PRICE
    )
    status = await start_compatibility_job(
        user_id, request, compatibility_price, background_tasks
    )
    return CompatibilityJobStartResponse(
        job_id=status.job_id,
        status=status.status,
        progress=status.progress,
        message="궁합 분석이 시작되었습니다. 결과를 불러오는 중입니다.",
    )


@router.get(
    "/compatibility/status/{job_id}", response_model=CompatibilityJobStatusResponse
)
async def get_compatibility_analysis_status(
    job_id: str,
    current_user: Optional[dict] = Depends(get_current_user),
    user_id: str = Depends(get_current_user_id),
) -> CompatibilityJobStatusResponse:
    if not current_user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다")
    return await get_compatibility_job_status(job_id, user_id)


@router.post("/compatibility", response_model=CompatibilityResponse)
async def analyze_compatibility(
    request: CompatibilityRequest,
    current_user: Optional[dict] = Depends(get_current_user),
    user_id: str = Depends(get_current_user_id),
    _rate_limit: None = Depends(
        rate_limit_dependency(
            get_settings().rate_limit_per_minute, scope="compatibility"
        )
    ),
) -> CompatibilityResponse:
    if not current_user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다")
    compatibility_price = await config_service.get_feature_price(
        "compatibility", COMPATIBILITY_PRICE
    )
    payment = await charge_for_paid_feature(
        user_id, "compatibility", compatibility_price, "AI 궁합 분석"
    )
    if not payment.success:
        if "부족" in (payment.error or ""):
            raise HTTPException(status_code=402, detail=payment.error)
        raise HTTPException(status_code=400, detail=payment.error or "결제 처리 실패")

    try:
        return await generate_compatibility_result(request, user_id=user_id)

    except HTTPException:
        if payment.transaction_id:
            await refund_on_failure(user_id, payment.transaction_id, "서비스 오류 환불")
        raise
    except Exception as e:
        logger.exception("Error in compatibility API")
        try:
            await AnalyticsService.track_analysis_event(
                "compatibility", "failed", user_id, error_message=str(e)
            )
        except Exception:
            pass
        refunded = False
        if payment.transaction_id:
            refunded = await refund_on_failure(
                user_id, payment.transaction_id, "서비스 오류"
            )
        detail = "궁합 분석 중 오류가 발생했습니다. " + (
            "엽전이 환불되었습니다."
            if refunded
            else "환불 처리에 실패했습니다. 고객센터에 문의해주세요."
        )
        raise HTTPException(status_code=500, detail=detail)
