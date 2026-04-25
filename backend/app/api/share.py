"""
사주 공유 API 라우터
"""

import logging
import secrets
import json
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional, Any

from ..db.supabase_client import supabase, db_execute
from ..config import get_settings
from ..prompt_manager import get_prompt_manager
from ..providers.base import llm_call_with_retry
from ..providers.factory import ProviderFactory
from ..schemas import (
    BirthInput,
    CompatibilityData,
    CompatibilityScenario,
    QuickCompatibilityResponse,
    UserBSummary,
)
from ..services.config_service import config_service, get_provider_for_model
from ..utils.flow_calculator import get_saju_character
from ..utils.saju_calculator import get_calculated_pillars
from .deps import get_current_user_id, rate_limit_dependency

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/share", tags=["share"])
settings = get_settings()

MAX_SHARE_DATA_SIZE = 100_000
ALLOWED_BIRTH_INPUT_KEYS = {
    "name",
    "birth_solar",
    "birth_time",
    "gender",
    "calendar_type",
}


def generate_share_code() -> str:
    return secrets.token_urlsafe(6)


def validate_dict_size(v: dict, max_size: int = MAX_SHARE_DATA_SIZE) -> dict:
    size = len(json.dumps(v, ensure_ascii=False))
    if size > max_size:
        raise ValueError(f"데이터 크기가 {max_size // 1000}KB를 초과합니다")
    return v


def minimize_birth_input(v: dict) -> dict:
    return {k: value for k, value in v.items() if k in ALLOWED_BIRTH_INPUT_KEYS}


# 공유 시 제거할 대용량 필드 목록
STRIP_FIELDS = {"saju_image_base64"}



class ShareGetResponse(BaseModel):
    share_code: str
    sharer_name: Optional[str]
    birth_input: dict
    reading_data: dict
    created_at: str
    view_count: int

class CompatibilityShareGetResponse(BaseModel):
    share_code: str
    user_a: dict
    user_b: dict
    compatibility_data: dict
    scenario: str
    created_at: str
    view_count: int


class QuickCompatibilityRequest(BaseModel):
    share_code: str = Field(..., min_length=1, max_length=100)
    user_b: BirthInput
    scenario: CompatibilityScenario = CompatibilityScenario.LOVER


def _as_dict(value: Any) -> dict:
    return value if isinstance(value, dict) else {}


def _result_rows(result: Any) -> list[dict]:
    data = getattr(result, "data", None)
    if not isinstance(data, list):
        return []
    return [row for row in data if isinstance(row, dict)]


def _to_prompt_oheng(oheng: Any) -> dict:
    normalized = _as_dict(oheng)
    return {
        "목": normalized.get("목", normalized.get("wood", 0)),
        "화": normalized.get("화", normalized.get("fire", 0)),
        "토": normalized.get("토", normalized.get("earth", 0)),
        "금": normalized.get("금", normalized.get("metal", 0)),
        "수": normalized.get("수", normalized.get("water", 0)),
    }


def _extract_user_a_pillars(reading_data: Any) -> dict:
    pillars_data = _as_dict(_as_dict(reading_data).get("pillars"))
    return {
        "year": pillars_data.get("year", ""),
        "month": pillars_data.get("month", ""),
        "day": pillars_data.get("day", ""),
        "hour": pillars_data.get("hour")
        or pillars_data.get("hour_A")
        or pillars_data.get("hour_B")
        or "",
    }


def _extract_user_a_oheng(reading_data: Any) -> dict:
    card_data = _as_dict(_as_dict(reading_data).get("card"))
    stats = _as_dict(card_data.get("stats"))
    return {
        "wood": int(stats.get("wood", 0) or 0),
        "fire": int(stats.get("fire", 0) or 0),
        "earth": int(stats.get("earth", 0) or 0),
        "metal": int(stats.get("metal", 0) or 0),
        "water": int(stats.get("water", 0) or 0),
    }


def _build_pillars_summary(pillars: Any) -> str:
    normalized = _as_dict(pillars)
    return " ".join(
        [
            str(normalized.get("year", "")).strip(),
            str(normalized.get("month", "")).strip(),
            str(normalized.get("day", "")).strip(),
            str(normalized.get("hour", "")).strip(),
        ]
    ).strip()


def _extract_day_stem(day_pillar: str) -> str:
    """일주 문자열에서 일간(天干) 한자 1글자 추출.

    "甲子(갑자)" → "甲", "갑자" → "갑", "" → ""
    """
    text = day_pillar.strip()
    if not text:
        return ""
    if "(" in text:
        hanja_part = text[: text.find("(")]
        if hanja_part:
            return hanja_part[0]  # "甲" from "甲子(갑자)"
    return text[0]


def _build_user_b_summary(user_b_input: BirthInput, pillars_b: dict) -> UserBSummary:
    day_pillar = str(_as_dict(pillars_b).get("day", ""))
    day_stem = _extract_day_stem(day_pillar)
    character = get_saju_character(day_stem)
    one_liner = f"{user_b_input.name or '당신'}님은 {character.get('name', '미지의 존재')} 기운이 강한 타입입니다."

    return UserBSummary(
        one_liner=one_liner,
        character_name=character.get("name", ""),
        character_icon_path=character.get("icon_path", ""),
        element=character.get("element", ""),
        pillars_summary=_build_pillars_summary(pillars_b),
    )


def _parse_expiry(expires_at_value: Any) -> Optional[datetime]:
    if not isinstance(expires_at_value, str) or not expires_at_value:
        return None
    expires_at_str = expires_at_value
    if expires_at_str.endswith("Z"):
        expires_at_str = expires_at_str[:-1] + "+00:00"
    return datetime.fromisoformat(expires_at_str)


def _to_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


async def _consume_profile_share_code_if_needed(share_code: str) -> None:
    result = await db_execute(
        lambda: (
            supabase.table("profile_share_codes")
            .select("id")
            .eq("code", share_code)
            .limit(1)
            .execute()
        )
    )
    rows = _result_rows(result)
    if not rows:
        return

    increment_result = await db_execute(
        lambda: supabase.rpc(
            "increment_share_code_use_count", {"p_code": share_code}
        ).execute()
    )
    inc_data = increment_result.data
    if isinstance(inc_data, list):
        inc_data = inc_data[0] if inc_data else {}
    if isinstance(inc_data, str):
        inc_data = json.loads(inc_data)
    if not isinstance(inc_data, dict):
        raise HTTPException(status_code=400, detail="공유 코드 처리 오류")
    if not inc_data.get("success"):
        error = inc_data.get("error", "")
        if error == "NOT_FOUND":
            raise HTTPException(status_code=404, detail="공유 링크를 찾을 수 없습니다")
        if error in {"EXPIRED", "MAX_USES_EXCEEDED"}:
            raise HTTPException(status_code=410, detail="공유 링크가 만료되었습니다")
        raise HTTPException(status_code=400, detail="공유 코드 처리 오류")



@router.get(
    "/{share_code}",
    response_model=ShareGetResponse,
    dependencies=[
        Depends(rate_limit_dependency(settings.rate_limit_per_minute, scope="share"))
    ],
)
async def get_share(share_code: str):
    """공유된 사주 조회 (인증 불필요)"""
    try:
        await _consume_profile_share_code_if_needed(share_code)
        result = await db_execute(
            lambda: (
                supabase.table("shared_saju")
                .select("*")
                .eq("share_code", share_code)
                .execute()
            )
        )

        rows = _result_rows(result)
        if not rows:
            raise HTTPException(status_code=404, detail="공유 링크를 찾을 수 없습니다")

        share = rows[0]
        expires = _parse_expiry(share.get("expires_at"))
        if expires and datetime.now(timezone.utc) > expires:
            raise HTTPException(status_code=410, detail="공유 링크가 만료되었습니다")

        view_count = _to_int(share.get("view_count", 0))
        share_id = share.get("id")
        if share_id:
            await db_execute(
                lambda: (
                    supabase.table("shared_saju")
                    .update({"view_count": view_count + 1})
                    .eq("id", share_id)
                    .execute()
                )
            )

        return ShareGetResponse(
            share_code=str(share.get("share_code", "")),
            sharer_name=share.get("sharer_name"),
            birth_input=_as_dict(share.get("birth_input")),
            reading_data=_as_dict(share.get("reading_data")),
            created_at=str(share.get("created_at", "")),
            view_count=view_count + 1,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting shared data: {e}")
        raise HTTPException(status_code=500, detail="공유 데이터 조회에 실패했습니다.")



@router.get(
    "/compatibility/{share_code}",
    response_model=CompatibilityShareGetResponse,
    dependencies=[
        Depends(rate_limit_dependency(settings.rate_limit_per_minute, scope="share"))
    ],
)
async def get_compatibility_share(share_code: str):
    try:
        result = await db_execute(
            lambda: (
                supabase.table("shared_compatibility")
                .select("*")
                .eq("share_code", share_code)
                .execute()
            )
        )

        rows = _result_rows(result)
        if not rows:
            raise HTTPException(
                status_code=404, detail="궁합 공유 링크를 찾을 수 없습니다"
            )

        share = rows[0]
        expires = _parse_expiry(share.get("expires_at"))
        if expires and datetime.now(timezone.utc) > expires:
            raise HTTPException(
                status_code=410, detail="궁합 공유 링크가 만료되었습니다"
            )

        view_count = _to_int(share.get("view_count", 0))
        share_id = share.get("id")
        if share_id:
            await db_execute(
                lambda: (
                    supabase.table("shared_compatibility")
                    .update({"view_count": view_count + 1})
                    .eq("id", share_id)
                    .execute()
                )
            )

        return CompatibilityShareGetResponse(
            share_code=str(share.get("share_code", "")),
            user_a=_as_dict(share.get("user_a")),
            user_b=_as_dict(share.get("user_b")),
            compatibility_data=_as_dict(share.get("compatibility_data")),
            scenario=str(share.get("scenario", "lover")),
            created_at=str(share.get("created_at", "")),
            view_count=view_count + 1,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting shared compatibility data: {e}")
        raise HTTPException(
            status_code=500, detail="궁합 공유 데이터 조회에 실패했습니다."
        )


@router.post("/quick-compatibility", response_model=QuickCompatibilityResponse)
async def quick_compatibility_from_share(
    request: QuickCompatibilityRequest,
    _rate_limit: None = Depends(
        rate_limit_dependency(limit=10, window_seconds=60, scope="share_quick_compat")
    ),
):
    try:
        result = await db_execute(
            lambda: (
                supabase.table("shared_saju")
                .select("*")
                .eq("share_code", request.share_code)
                .execute()
            )
        )

        rows = _result_rows(result)
        if not rows:
            raise HTTPException(status_code=404, detail="공유 링크를 찾을 수 없습니다")

        share = rows[0]
        expires = _parse_expiry(share.get("expires_at"))
        if expires and datetime.now(timezone.utc) > expires:
            raise HTTPException(status_code=410, detail="공유 링크가 만료되었습니다")

        user_a_input = BirthInput(**_as_dict(share.get("birth_input")))
        reading_data = _as_dict(share.get("reading_data"))

        user_a_pillars = _extract_user_a_pillars(reading_data)
        user_a_oheng = _extract_user_a_oheng(reading_data)

        if not all(
            [
                user_a_pillars.get("year"),
                user_a_pillars.get("month"),
                user_a_pillars.get("day"),
            ]
        ):
            ay, am, ad = map(int, user_a_input.birth_solar.split("-"))
            ah, ami = map(int, user_a_input.birth_time.split(":"))
            calculated_a = get_calculated_pillars(
                ay, am, ad, ah, ami, user_a_input.gender
            )
            if not calculated_a:
                raise HTTPException(
                    status_code=500, detail="공유 데이터 해석에 실패했습니다"
                )
            user_a_pillars = {
                "year": calculated_a.get("year", ""),
                "month": calculated_a.get("month", ""),
                "day": calculated_a.get("day", ""),
                "hour": calculated_a.get("hour", ""),
            }
            user_a_oheng = calculated_a.get("oheng_counts", {})

        by, bm, bd = map(int, request.user_b.birth_solar.split("-"))
        bh, bmi = map(int, request.user_b.birth_time.split(":"))
        pillars_b = get_calculated_pillars(by, bm, bd, bh, bmi, request.user_b.gender)
        if not pillars_b:
            raise HTTPException(
                status_code=400, detail="유효하지 않은 생년월일 정보입니다"
            )

        model_id = await config_service.get_model_compatibility()
        provider = ProviderFactory.get_provider(get_provider_for_model(model_id))
        prompt_manager = get_prompt_manager()

        prompt = prompt_manager.build_compatibility_prompt(
            user_a_input=user_a_input,
            user_a_pillars=user_a_pillars,
            user_a_oheng=_to_prompt_oheng(user_a_oheng),
            user_b_input=request.user_b,
            user_b_pillars=pillars_b,
            user_b_oheng=_to_prompt_oheng(pillars_b.get("oheng_counts", {})),
            version=settings.prompt_version,
            scenario=request.scenario,
        )

        response_text = await llm_call_with_retry(
            provider.generate,
            prompt=prompt,
            model_id=model_id,
            temperature=0.7,
            response_format={"type": "json_object"},
        )

        cleaned_response = response_text.strip()
        if cleaned_response.startswith("```"):
            cleaned_response = cleaned_response.strip("`").replace("json", "").strip()
        parsed = json.loads(cleaned_response)

        return QuickCompatibilityResponse(
            user_b_summary=_build_user_b_summary(request.user_b, pillars_b),
            compatibility=CompatibilityData(
                score=_to_int(parsed.get("score", 0)),
                summary=str(parsed.get("summary", "")),
                keyword=str(parsed.get("keyword", "")),
                advice=str(parsed.get("advice", "")),
            ),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error in quick compatibility share API: {e}")
        raise HTTPException(
            status_code=500, detail="빠른 궁합 분석 중 오류가 발생했습니다"
        )
