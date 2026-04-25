"""
오늘의 운세 (Daily Fortune) API

- GET /eligibility/{profile_id}: 생성 자격 확인
- GET /today/{profile_id}: 오늘 운세 조회
- POST /generate: 운세 생성 (코인 차감 포함)
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, datetime
import pytz
import json
import time
import asyncio
import logging
import re
from cryptography.exceptions import InvalidTag

from .deps import get_current_user_id, rate_limit_dependency
from ..db.supabase_client import supabase, db_execute
from ..providers.factory import ProviderFactory
from ..utils.saju_calculator import get_calculated_pillars
from ..utils.birth_normalizer import normalize_birth_to_solar
from ..services.config_service import config_service, get_provider_for_model
from ..services.analytics_service import analytics
from ..services.notification_service import notifier
from sajupy import calculate_saju

router = APIRouter(prefix="/api/daily-fortune", tags=["daily-fortune"])
logger = logging.getLogger(__name__)

KST = pytz.timezone("Asia/Seoul")

# 상수
DEFAULT_DAILY_FORTUNE_COST = 20
MAX_RETRIES = 3
RETRY_DELAYS = [1, 2, 4]  # Exponential backoff (seconds)
DEFAULT_MODEL = "gpt-5.4-nano"
PROMPT_VERSION = "v1"

KOREAN_WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"]


async def get_daily_fortune_cost() -> int:
    return await config_service.get_feature_price(
        "daily_fortune_price", DEFAULT_DAILY_FORTUNE_COST
    )


# =============================================================================
# Pydantic Schemas
# =============================================================================


class DailyFortuneEligibilityResponse(BaseModel):
    """오늘의 운세 생성 자격 확인 응답"""

    can_generate: bool = Field(..., description="생성 가능 여부")
    is_free: bool = Field(..., description="무료 여부")
    cost: int = Field(..., description="필요 코인 (무료면 0)")
    reason: str = Field(..., description="상태 메시지")
    existing_fortune_id: Optional[str] = Field(None, description="이미 생성된 운세 ID")
    days_since_profile_created: Optional[int] = Field(
        None, description="프로필 생성 후 경과 일수"
    )
    user_balance: Optional[int] = Field(None, description="현재 코인 잔액")
    today_kst: str = Field(..., description="오늘 날짜 (KST, YYYY-MM-DD)")
    formatted_date: str = Field(
        ..., description="표시용 날짜 (예: 2026년 1월 26일 (월))"
    )


class DailyFortuneGenerateRequest(BaseModel):
    """오늘의 운세 생성 요청"""

    profile_id: str = Field(..., description="프로필 ID")


class DailyFortuneLuckyItem(BaseModel):
    """행운 아이템"""

    name: str
    description: str
    icon: Optional[str] = None


class DailyFortuneData(BaseModel):
    """오늘의 운세 데이터"""

    today_message: str = Field(..., description="오늘의 한마디")
    today_advice: str = Field(..., description="오늘의 조언")
    today_warning: Optional[str] = Field(None, description="오늘의 주의사항")
    lucky_color: DailyFortuneLuckyItem = Field(..., description="행운의 색")
    lucky_number: DailyFortuneLuckyItem = Field(..., description="행운의 숫자")
    lucky_direction: DailyFortuneLuckyItem = Field(..., description="행운의 방향")
    lucky_food: DailyFortuneLuckyItem = Field(..., description="행운의 음식")
    lucky_activity: DailyFortuneLuckyItem = Field(..., description="행운의 활동")
    golden_time: str = Field(..., description="황금 시간대")
    avoid_time: Optional[str] = Field(None, description="피해야 할 시간대")
    overall_score: int = Field(..., ge=1, le=100, description="총운 점수 (1-100)")
    today_love: Optional[str] = Field(None, description="오늘의 연애운")
    today_money: Optional[str] = Field(None, description="오늘의 금전운")
    today_work: Optional[str] = Field(None, description="오늘의 업무/직장운")
    today_health: Optional[str] = Field(None, description="오늘의 건강운")
    mission_of_day: Optional[str] = Field(None, description="오늘의 미션")
    power_hour: Optional[str] = Field(None, description="파워 타임")
    talisman_phrase: Optional[str] = Field(None, description="오늘의 부적 문구")


class DailyFortuneResponse(BaseModel):
    """오늘의 운세 응답"""

    id: str
    profile_id: str
    fortune_date: str = Field(..., description="운세 날짜 (YYYY-MM-DD)")
    formatted_date: str = Field(..., description="표시용 날짜")
    fortune_data: DailyFortuneData
    cost_paid: int
    is_free: bool
    created_at: str


class DailyFortuneGenerateResponse(BaseModel):
    """오늘의 운세 생성 결과"""

    success: bool
    fortune: Optional[DailyFortuneResponse] = None
    error: Optional[str] = None
    refunded: bool = Field(default=False, description="환불 여부")


# =============================================================================
# Helper Functions
# =============================================================================


def get_today_kst() -> date:
    """KST 기준 오늘 날짜 반환"""
    return datetime.now(KST).date()


def format_date_korean(d: date) -> str:
    """날짜를 한국어 형식으로 포맷 (예: 2026년 1월 26일 (월))"""
    return f"{d.year}년 {d.month}월 {d.day}일 ({KOREAN_WEEKDAYS[d.weekday()]})"


def get_today_pillar_info(today: date) -> dict:
    """오늘의 천간/지지 정보 계산 (sajupy 활용)"""
    now = datetime.now(KST)
    res = calculate_saju(today.year, today.month, today.day, now.hour, now.minute)

    return {
        "year_pillar": res.get("year_pillar", ""),
        "month_pillar": res.get("month_pillar", ""),
        "day_pillar": res.get("day_pillar", ""),
        "hour_pillar": res.get("hour_pillar", ""),
    }


async def generate_fortune_with_llm(
    profile_data: dict, pillars_data: dict, today: date
) -> dict:
    """LLM을 사용하여 오늘의 운세 생성"""

    today_pillars = get_today_pillar_info(today)
    formatted_date = format_date_korean(today)

    # 일간(Day Master) 추출
    day_master = pillars_data.get("day_master", "")
    oheng_counts = pillars_data.get("oheng_counts", {})

    prompt = f"""당신은 전문 사주 명리학자입니다. 아래 사주 정보를 바탕으로 오늘({formatted_date})의 운세를 생성해주세요.

## 사주 정보 (본인)
- 일간(Day Master): {day_master}
- 사주 팔자: 년주 {pillars_data.get("year_pillar", "")}, 월주 {pillars_data.get("month_pillar", "")}, 일주 {pillars_data.get("day_pillar", "")}, 시주 {pillars_data.get("hour_pillar", "")}
- 오행 분포: 목({oheng_counts.get("wood", 0)}), 화({oheng_counts.get("fire", 0)}), 토({oheng_counts.get("earth", 0)}), 금({oheng_counts.get("metal", 0)}), 수({oheng_counts.get("water", 0)})

## 오늘의 천간/지지
- 오늘 일주: {today_pillars.get("day_pillar", "")}
- 오늘 월주: {today_pillars.get("month_pillar", "")}
- 오늘 년주: {today_pillars.get("year_pillar", "")}

## 출력 형식 (JSON만, 설명 없이)
{{
    "today_message": "오늘의 핵심 메시지 (1-2문장, 긍정적이고 구체적으로)",
    "today_advice": "오늘 하루를 위한 실용적인 조언 (2-3문장)",
    "today_warning": "주의해야 할 점 (1문장, 불필요하면 null)",
    "today_love": "오늘의 연애/대인관계 운세 (1-2문장)",
    "today_money": "오늘의 금전/재물 운세 (1-2문장)",
    "today_work": "오늘의 업무/직장 운세 (1-2문장)",
    "today_health": "오늘의 건강 운세 (1-2문장)",
    "lucky_color": {{
        "name": "색상명 (예: 포레스트 그린)",
        "description": "이 색이 오늘 좋은 이유 (1문장)",
        "icon": "green"
    }},
    "lucky_number": {{
        "name": "숫자 (예: 7)",
        "description": "이 숫자의 의미 (1문장)",
        "icon": "7"
    }},
    "lucky_direction": {{
        "name": "방향 (동/서/남/북/동남/동북/서남/서북 중 하나)",
        "description": "이 방향이 좋은 이유 (1문장)",
        "icon": "compass"
    }},
    "lucky_food": {{
        "name": "구체적인 음식명 (예: 된장찌개, 비빔밥)",
        "description": "이 음식을 추천하는 이유 (1문장)",
        "icon": "food"
    }},
    "lucky_activity": {{
        "name": "구체적인 활동명 (예: 산책, 독서)",
        "description": "이 활동을 추천하는 이유 (1문장)",
        "icon": "walk"
    }},
    "golden_time": "황금 시간대 (예: 오전 10시~12시)",
    "avoid_time": "피해야 할 시간대 (예: 오후 3시~5시, 불필요하면 null)",
    "mission_of_day": "오늘의 미션 - 구체적이고 실천 가능한 것 (1문장)",
    "power_hour": "집중력이 최고인 시간 (예: 오전 9시~11시)",
    "talisman_phrase": "오늘 마음속에 새길 부적 문구 (희망적이고 힘이 되는 한마디)",
    "overall_score": 75
}}

주의사항:
1. 사주와 오늘의 천간/지지 관계(합/충/형/파/해)를 고려하여 개인화된 운세를 생성하세요.
2. 모든 필드는 반드시 채워주세요 (null 허용 필드 제외).
3. 매번 새롭고 다양한 내용을 생성하세요. 틀에 박힌 표현을 피하세요.
4. overall_score는 50~85 사이로 현실적으로 설정하세요.
5. JSON만 출력하세요 (추가 설명 없이).
"""

    model_id = await config_service.get_model_daily_fortune()
    reasoning_effort = await config_service.get_reasoning_effort_daily_fortune()
    provider = ProviderFactory.get_provider(get_provider_for_model(model_id))
    response = await provider.generate(
        prompt=prompt, model_id=model_id, reasoning_effort=reasoning_effort
    )

    # JSON 파싱
    json_match = re.search(r"\{[\s\S]*\}", response)
    if not json_match:
        raise ValueError("LLM 응답에서 JSON을 찾을 수 없습니다.")

    result = json.loads(json_match.group())

    # 필수 필드 검증 및 기본값 설정
    result.setdefault("today_message", "오늘 하루도 화이팅!")
    result.setdefault("today_advice", "차분하게 하루를 시작해보세요.")
    result.setdefault("overall_score", 70)

    try:
        raw_score = result.get("overall_score", 70)
        score = int(re.sub(r"[^0-9]", "", str(raw_score)) or "70")
        result["overall_score"] = max(1, min(100, score))
    except (ValueError, TypeError):
        result["overall_score"] = 70

    for str_field in [
        "today_message",
        "today_advice",
        "golden_time",
        "today_warning",
        "today_love",
        "today_money",
        "today_work",
        "today_health",
        "mission_of_day",
        "power_hour",
        "talisman_phrase",
    ]:
        if (
            str_field in result
            and result[str_field] is not None
            and not isinstance(result[str_field], str)
        ):
            result[str_field] = str(result[str_field])

    # lucky_* 필드 검증
    for key in [
        "lucky_color",
        "lucky_number",
        "lucky_direction",
        "lucky_food",
        "lucky_activity",
    ]:
        if key not in result or not isinstance(result[key], dict):
            result[key] = {
                "name": "미정",
                "description": "오늘은 자유롭게!",
                "icon": "sparkle",
            }
        else:
            result[key].setdefault("name", "미정")
            result[key].setdefault("description", "")
            result[key].setdefault("icon", "sparkle")

    result.setdefault("golden_time", "오전 10시~12시")

    return result


async def refund_transaction(
    user_id: str, transaction_id: str, reason: str, amount: Optional[int] = None
) -> bool:
    """트랜잭션 환불 처리 - amount가 None이면 원본 트랜잭션에서 조회"""
    try:
        refund_amount = amount
        if refund_amount is None:
            tx_res = await db_execute(
                lambda: (
                    supabase.table("coin_transactions")
                    .select("amount")
                    .eq("id", transaction_id)
                    .single()
                    .execute()
                )
            )
            if tx_res.data:
                fallback_cost = await get_daily_fortune_cost()
                refund_amount = abs(tx_res.data.get("amount", fallback_cost))
            else:
                refund_amount = await get_daily_fortune_cost()
                logger.warning(
                    f"[DAILY_FORTUNE] Could not find tx {transaction_id}, using default cost"
                )

        result = await db_execute(
            lambda: supabase.rpc(
                "refund_coins",
                {
                    "p_user_id": user_id,
                    "p_amount": refund_amount,
                    "p_original_tx_id": transaction_id,
                    "p_reason": reason,
                },
            ).execute()
        )

        if result.data:
            first_row = (
                result.data[0]
                if isinstance(result.data, list) and result.data
                else None
            )
            if isinstance(first_row, dict) and first_row.get("manual_review_required"):
                notifier.notify_paid_feature_refund_issue(
                    feature_key="daily_fortune",
                    user_id=user_id,
                    transaction_id=transaction_id,
                    reason=reason,
                    issue_type="manual_review_required",
                    error="refund succeeded but follow-up manual review is required",
                )
            logger.info(
                f"[DAILY_FORTUNE] Refund success: user={user_id}, tx={transaction_id}, amount={refund_amount}"
            )
            return True
        notifier.notify_paid_feature_refund_issue(
            feature_key="daily_fortune",
            user_id=user_id,
            transaction_id=transaction_id,
            reason=reason,
            issue_type="refund_failed",
            error="refund_coins returned no rows",
        )
        return False
    except Exception as e:
        if "ALREADY_REFUNDED" in str(e):
            logger.info(f"[DAILY_FORTUNE] Already refunded: tx={transaction_id}")
            return True
        logger.error(f"[DAILY_FORTUNE] Refund failed: {e}")
        notifier.notify_paid_feature_refund_issue(
            feature_key="daily_fortune",
            user_id=user_id,
            transaction_id=transaction_id,
            reason=reason,
            issue_type="refund_failed",
            error=str(e),
        )
        return False


# =============================================================================
# API Endpoints
# =============================================================================


@router.get("/eligibility/{profile_id}", response_model=DailyFortuneEligibilityResponse)
async def check_eligibility(
    profile_id: str,
    user_id: str = Depends(get_current_user_id),
    _rate_limit: None = Depends(
        rate_limit_dependency(limit=30, window_seconds=60, scope="fortune_check")
    ),
):
    """오늘의 운세 생성 자격 확인"""
    today = get_today_kst()

    # RPC 호출
    try:
        result = await db_execute(
            lambda: supabase.rpc(
                "check_daily_fortune_eligibility",
                {
                    "p_user_id": user_id,
                    "p_profile_id": profile_id,
                    "p_today_kst": today.isoformat(),
                },
            ).execute()
        )
    except Exception as e:
        logger.error(f"[DAILY_FORTUNE] Eligibility check failed: {e}")
        raise HTTPException(status_code=500, detail="자격 확인 중 오류가 발생했습니다.")

    if not result.data:
        raise HTTPException(status_code=500, detail="자격 확인 실패")

    row = result.data[0]
    default_cost = await get_daily_fortune_cost()
    can_generate = bool(row.get("can_generate", row.get("eligible", False)))
    reason = row.get("reason") or row.get("message") or "상태 확인"
    days_since_profile_created = row.get(
        "days_since_profile_created", row.get("days_since_creation")
    )
    user_balance = row.get("user_balance", row.get("current_balance"))

    return DailyFortuneEligibilityResponse(
        can_generate=can_generate,
        is_free=bool(row.get("is_free", False)),
        cost=int(row.get("cost", default_cost)),
        reason=str(reason),
        existing_fortune_id=str(row["existing_fortune_id"])
        if row.get("existing_fortune_id")
        else None,
        days_since_profile_created=days_since_profile_created,
        user_balance=user_balance,
        today_kst=today.isoformat(),
        formatted_date=format_date_korean(today),
    )


@router.get("/today/{profile_id}", response_model=DailyFortuneResponse)
async def get_today_fortune(
    profile_id: str, user_id: str = Depends(get_current_user_id)
):
    """오늘의 운세 조회"""
    today = get_today_kst()

    result = await db_execute(
        lambda: (
            supabase.table("daily_fortunes")
            .select("*")
            .eq("profile_id", profile_id)
            .eq("user_id", user_id)
            .eq("fortune_date_kst", today.isoformat())
            .eq("status", "success")
            .limit(1)
            .execute()
        )
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="오늘의 운세가 없습니다.")

    row = result.data[0]
    fortune_date = date.fromisoformat(row["fortune_date_kst"])

    return DailyFortuneResponse(
        id=row["id"],
        profile_id=row["profile_id"],
        fortune_date=row["fortune_date_kst"],
        formatted_date=format_date_korean(fortune_date),
        fortune_data=DailyFortuneData(**row["fortune_data"]),
        cost_paid=row["cost_paid"],
        is_free=row["cost_paid"] == 0,
        created_at=row["created_at"],
    )


@router.get("/latest/{profile_id}", response_model=DailyFortuneResponse)
async def get_latest_fortune(
    profile_id: str, user_id: str = Depends(get_current_user_id)
):
    """가장 최근 생성된 운세 조회 (날짜 무관)"""
    result = await db_execute(
        lambda: (
            supabase.table("daily_fortunes")
            .select("*")
            .eq("profile_id", profile_id)
            .eq("user_id", user_id)
            .eq("status", "success")
            .order("fortune_date_kst", desc=True)
            .limit(1)
            .execute()
        )
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="생성된 운세가 없습니다.")

    row = result.data[0]
    fortune_date = date.fromisoformat(row["fortune_date_kst"])

    return DailyFortuneResponse(
        id=row["id"],
        profile_id=row["profile_id"],
        fortune_date=row["fortune_date_kst"],
        formatted_date=format_date_korean(fortune_date),
        fortune_data=DailyFortuneData(**row["fortune_data"]),
        cost_paid=row["cost_paid"],
        is_free=row["cost_paid"] == 0,
        created_at=row["created_at"],
    )


@router.post("/generate", response_model=DailyFortuneGenerateResponse)
async def generate_daily_fortune(
    request: DailyFortuneGenerateRequest,
    user_id: str = Depends(get_current_user_id),
    _rate_limit: None = Depends(
        rate_limit_dependency(limit=10, window_seconds=60, scope="fortune_generate")
    ),
):
    """오늘의 운세 생성 (코인 차감 포함)"""
    today = get_today_kst()
    start_time = time.time()

    # 1. 자격 확인
    try:
        eligibility = await db_execute(
            lambda: supabase.rpc(
                "check_daily_fortune_eligibility",
                {
                    "p_user_id": user_id,
                    "p_profile_id": request.profile_id,
                    "p_today_kst": today.isoformat(),
                },
            ).execute()
        )
    except Exception as e:
        logger.error(f"[DAILY_FORTUNE] Eligibility check failed: {e}")
        return DailyFortuneGenerateResponse(success=False, error="자격 확인 실패")

    eligibility_row = eligibility.data[0] if eligibility.data else {}
    can_generate = bool(
        eligibility_row.get("can_generate", eligibility_row.get("eligible", False))
    )
    if not can_generate:
        reason = (
            eligibility_row.get("reason")
            or eligibility_row.get("message")
            or "자격 확인 실패"
        )
        return DailyFortuneGenerateResponse(success=False, error=reason)

    default_cost = await get_daily_fortune_cost()
    cost = int(eligibility_row.get("cost", default_cost))
    is_free = bool(eligibility_row.get("is_free", cost == 0))

    # 2. 프로필 정보 조회 (사주 계산용) - 소유권 검증 포함
    try:
        profile = await db_execute(
            lambda: (
                supabase.table("saju_profiles")
                .select("*")
                .eq("id", request.profile_id)
                .eq(
                    "user_id",
                    user_id,  # 소유권 검증
                )
                .single()
                .execute()
            )
        )
    except Exception as e:
        logger.error(f"[DAILY_FORTUNE] Profile not found: {e}")
        return DailyFortuneGenerateResponse(
            success=False, error="프로필을 찾을 수 없습니다."
        )

    if not profile.data:
        return DailyFortuneGenerateResponse(
            success=False, error="프로필을 찾을 수 없거나 접근 권한이 없습니다."
        )

    profile_data = profile.data

    try:
        from ..core.security import crypto_manager

        row_key_id = profile_data.get("key_id", "v1")

        def _decrypt_profile_field(column: str) -> str:
            iv = profile_data.get(f"{column}_iv", "")
            ct = profile_data.get(f"{column}_ct", "")
            tag = profile_data.get(f"{column}_tag", "")
            try:
                return crypto_manager.decrypt_field(
                    "saju_profiles", column, iv, ct, tag, row_key_id
                )
            except InvalidTag:
                logger.warning(
                    "[DAILY_FORTUNE] decrypt_field fallback for saju_profiles.%s (AAD 없이 폴백, key_id=%s)",
                    column,
                    row_key_id,
                )
                return crypto_manager.decrypt(iv, ct, tag, key_id=row_key_id)

        birth_date_str = _decrypt_profile_field("birth_date")
        hour_branch = _decrypt_profile_field("hour_branch")
        gender = _decrypt_profile_field("gender") or "male"

        # calendar_type 복호화 후 음력이면 양력으로 변환
        calendar_type = "solar"
        try:
            calendar_type = _decrypt_profile_field("calendar_type") or "solar"
        except Exception:
            pass
        birth_date_str = normalize_birth_to_solar(birth_date_str, calendar_type)

        # birth_date 파싱 (YYYY-MM-DD)
        birth_parts = birth_date_str.split("-")
        birth_year = int(birth_parts[0])
        birth_month = int(birth_parts[1])
        birth_day = int(birth_parts[2])

        # hour_branch에서 시간 추출 (예: "14:30" 또는 시지 형식)
        if ":" in (hour_branch or ""):
            hour_parts = hour_branch.split(":")
            birth_hour = int(hour_parts[0])
            birth_minute = int(hour_parts[1]) if len(hour_parts) > 1 else 0
        else:
            # 시지 형식인 경우 기본값
            birth_hour = 12
            birth_minute = 0

    except Exception as e:
        logger.error(f"[DAILY_FORTUNE] Profile decryption failed: {e}")
        return DailyFortuneGenerateResponse(
            success=False, error="프로필 정보 처리 중 오류가 발생했습니다."
        )

    # 4. 사주 팔자 계산
    try:
        pillars_data = get_calculated_pillars(
            birth_year, birth_month, birth_day, birth_hour, birth_minute, gender
        )
        if not pillars_data:
            raise ValueError("사주 계산 실패")
    except Exception as e:
        logger.error(f"[DAILY_FORTUNE] Pillars calculation failed: {e}")
        return DailyFortuneGenerateResponse(
            success=False, error="사주 계산 중 오류가 발생했습니다."
        )

    # 5. 유료인 경우 코인 선차감
    transaction_id = None
    if not is_free:
        try:
            debit_result = await db_execute(
                lambda: supabase.rpc(
                    "debit_coins_v2",
                    {
                        "p_user_id": user_id,
                        "p_amount": cost,
                        "p_description": f"오늘의 운세 ({today.isoformat()})",
                        "p_reference_type": "daily_fortune",
                        "p_reference_id": request.profile_id,
                    },
                ).execute()
            )

            if not debit_result.data:
                raise ValueError("코인 차감 실패")

            transaction_id = str(debit_result.data[0]["transaction_id"])
            logger.info(
                f"[DAILY_FORTUNE] Coins debited: user={user_id}, amount={cost}, tx={transaction_id}"
            )

        except Exception as e:
            error_str = str(e)
            if "INSUFFICIENT_BALANCE" in error_str:
                return DailyFortuneGenerateResponse(
                    success=False, error="엽전이 부족합니다."
                )
            elif "WALLET_NOT_FOUND" in error_str:
                return DailyFortuneGenerateResponse(
                    success=False, error="지갑이 없습니다. 먼저 충전해주세요."
                )
            logger.error(f"[DAILY_FORTUNE] Coin debit failed: {e}")
            return DailyFortuneGenerateResponse(
                success=False, error="코인 차감 중 오류가 발생했습니다."
            )

    # 6. pending 상태로 운세 레코드 생성
    daily_model_id = await config_service.get_model_daily_fortune()
    fortune_id = None
    try:
        insert_result = await db_execute(
            lambda: (
                supabase.table("daily_fortunes")
                .insert(
                    {
                        "profile_id": request.profile_id,
                        "user_id": user_id,
                        "fortune_date_kst": today.isoformat(),
                        "fortune_data": {},
                        "cost_paid": cost,
                        "transaction_id": transaction_id,
                        "status": "pending",
                        "model_id": daily_model_id,
                        "prompt_version": PROMPT_VERSION,
                        "retry_count": 0,
                    }
                )
                .execute()
            )
        )

        if not insert_result.data:
            raise ValueError("운세 레코드 생성 실패")

        fortune_id = insert_result.data[0]["id"]

    except Exception as e:
        # 중복 생성 시도 (UNIQUE 제약 위반)
        if "duplicate key" in str(e).lower() or "unique" in str(e).lower():
            if transaction_id:
                await refund_transaction(
                    user_id, transaction_id, "중복 생성 시도로 인한 환불"
                )
            return DailyFortuneGenerateResponse(
                success=False,
                error="오늘의 운세가 이미 생성 중이거나 생성되었습니다.",
                refunded=bool(transaction_id),
            )

        logger.error(f"[DAILY_FORTUNE] Record creation failed: {e}")
        if transaction_id:
            await refund_transaction(
                user_id, transaction_id, "레코드 생성 실패로 인한 환불"
            )
        return DailyFortuneGenerateResponse(
            success=False, error="운세 생성 초기화 실패", refunded=bool(transaction_id)
        )

    # 7. LLM으로 운세 생성 (3회 재시도)
    last_error = None
    fortune_data = None

    for attempt in range(MAX_RETRIES):
        try:
            fortune_data = await generate_fortune_with_llm(
                profile_data, pillars_data, today
            )
            break  # 성공

        except Exception as e:
            last_error = str(e)
            logger.warning(
                f"[DAILY_FORTUNE] Attempt {attempt + 1}/{MAX_RETRIES} failed: {e}"
            )

            # 마지막 시도가 아니면 대기 후 재시도
            if attempt < MAX_RETRIES - 1:
                await asyncio.sleep(RETRY_DELAYS[attempt])

                # retry_count 업데이트
                try:
                    await db_execute(
                        lambda: (
                            supabase.table("daily_fortunes")
                            .update({"retry_count": attempt + 1})
                            .eq("id", fortune_id)
                            .execute()
                        )
                    )
                except Exception:
                    pass

    generation_time_ms = int((time.time() - start_time) * 1000)

    # 8. 결과 처리
    if fortune_data:
        try:
            validated_data = DailyFortuneData(**fortune_data)
        except Exception as e:
            logger.error(f"[DAILY_FORTUNE] Data validation failed: {e}")
            validation_error = f"데이터 검증 실패: {str(e)[:200]}"
            try:
                await db_execute(
                    lambda: (
                        supabase.table("daily_fortunes")
                        .update(
                            {
                                "status": "failed",
                                "error_message": validation_error,
                                "generation_time_ms": generation_time_ms,
                            }
                        )
                        .eq("id", fortune_id)
                        .execute()
                    )
                )
            except Exception:
                pass

            refunded = False
            if transaction_id:
                refunded = await refund_transaction(
                    user_id, transaction_id, "운세 데이터 검증 실패 환불"
                )

            return DailyFortuneGenerateResponse(
                success=False,
                error="운세 생성에 실패했습니다. 다시 시도해주세요.",
                refunded=refunded,
            )

        try:
            await db_execute(
                lambda: (
                    supabase.table("daily_fortunes")
                    .update(
                        {
                            "fortune_data": fortune_data,
                            "status": "success",
                            "generation_time_ms": generation_time_ms,
                            "retry_count": MAX_RETRIES if last_error else 0,
                        }
                    )
                    .eq("id", fortune_id)
                    .execute()
                )
            )

            logger.info(
                f"[DAILY_FORTUNE] Success: user={user_id}, profile={request.profile_id}, time={generation_time_ms}ms"
            )

        except Exception as e:
            logger.error(f"[DAILY_FORTUNE] Save failed after LLM success: {e}")

        try:
            await analytics.track_event(
                event_type="daily_fortune_generated",
                event_data={"profile_id": request.profile_id},
                user_id=user_id,
            )
        except Exception:
            logger.warning(
                "[DAILY_FORTUNE] Failed to track daily_fortune_generated event"
            )

        return DailyFortuneGenerateResponse(
            success=True,
            fortune=DailyFortuneResponse(
                id=fortune_id,
                profile_id=request.profile_id,
                fortune_date=today.isoformat(),
                formatted_date=format_date_korean(today),
                fortune_data=validated_data,
                cost_paid=cost,
                is_free=is_free,
                created_at=datetime.now(KST).isoformat(),
            ),
        )
    else:
        # 실패: 환불 처리
        refunded = False

        try:
            await db_execute(
                lambda: (
                    supabase.table("daily_fortunes")
                    .update(
                        {
                            "status": "failed",
                            "error_message": f"LLM 생성 실패 ({MAX_RETRIES}회 시도): {last_error}",
                            "generation_time_ms": generation_time_ms,
                        }
                    )
                    .eq("id", fortune_id)
                    .execute()
                )
            )
        except Exception:
            pass

        if transaction_id:
            refunded = await refund_transaction(
                user_id, transaction_id, "오늘의 운세 생성 실패 환불"
            )

            if refunded:
                try:
                    await db_execute(
                        lambda: (
                            supabase.table("daily_fortunes")
                            .update({"status": "refunded"})
                            .eq("id", fortune_id)
                            .execute()
                        )
                    )
                except Exception:
                    pass

        logger.error(
            f"[DAILY_FORTUNE] Failed after {MAX_RETRIES} attempts: user={user_id}, error={last_error}"
        )

        error_msg = "운세 생성에 실패했습니다."
        if refunded:
            error_msg += " 엽전이 환불되었습니다."

        return DailyFortuneGenerateResponse(
            success=False, error=error_msg, refunded=refunded
        )
