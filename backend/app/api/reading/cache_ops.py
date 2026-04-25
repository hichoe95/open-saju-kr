"""
사주 리딩 캐시 조회/검증 연산
"""

import logging
from datetime import datetime
from typing import Any, Optional

from fastapi import Depends, HTTPException
from korean_lunar_calendar import KoreanLunarCalendar

from ...config import get_settings
from ...core.security import crypto_manager
from ...db.supabase_client import supabase
from ...schemas import CardData, MetaData, PillarsData, ReadingResponse, SajuCharacter
from ...services.cache_service import get_cached_reading_sync
from ...services.config_service import config_service, get_provider_for_model
from ...utils.flow_calculator import get_saju_character
from ..auth import require_auth
from ..deps import rate_limit_dependency
from .contract import (
    dump_projected_reading_response,
    project_reading_response,
    resolve_reading_projection,
)
from .helpers import _parse_card
from .reconstruction import (
    _reconstruct_advanced_from_cache,
    _reconstruct_tabs_from_cache,
)

logger = logging.getLogger(__name__)

_HOUR_BRANCH_TO_HOUR = {
    "子": "00",
    "丑": "02",
    "寅": "04",
    "卯": "06",
    "辰": "08",
    "巳": "10",
    "午": "12",
    "未": "14",
    "申": "16",
    "酉": "18",
    "戌": "20",
    "亥": "22",
    "자": "00",
    "축": "02",
    "인": "04",
    "묘": "06",
    "진": "08",
    "사": "10",
    "오": "12",
    "미": "14",
    "신": "16",
    "유": "18",
    "술": "20",
    "해": "22",
}


def _hour_branch_to_hour(hour_branch: str) -> str:
    normalized = (hour_branch or "").strip()
    if not normalized:
        return "12"

    if normalized in _HOUR_BRANCH_TO_HOUR:
        return _HOUR_BRANCH_TO_HOUR[normalized]

    if ":" in normalized:
        normalized = normalized.split(":", 1)[0].strip()

    if normalized in _HOUR_BRANCH_TO_HOUR:
        return _HOUR_BRANCH_TO_HOUR[normalized]

    if normalized.isdigit():
        return normalized.zfill(2)

    return normalized


def _normalize_birth_date_for_cache(birth_date: str, calendar_type: str) -> str:
    normalized_birth_date = (birth_date or "").strip()
    normalized_calendar = (calendar_type or "solar").strip().lower()

    if normalized_calendar != "lunar":
        return normalized_birth_date

    try:
        ly, lm, ld = map(int, normalized_birth_date.split("-"))
        l_calendar = KoreanLunarCalendar()
        l_calendar.setLunarDate(ly, lm, ld, False)
        get_solar_iso_format = getattr(l_calendar, "getSolarIsoFormat")
        return get_solar_iso_format()
    except Exception:
        logger.warning(
            "[CACHE] Failed to normalize lunar birth_date: %s", normalized_birth_date
        )
        return normalized_birth_date


def _decrypt_profile_field(profile: Any, column: str) -> str:
    if not isinstance(profile, dict):
        raise ValueError("Invalid profile row")

    key_id_raw = profile.get("key_id") or "v1"
    key_id = key_id_raw if isinstance(key_id_raw, str) else str(key_id_raw)

    iv = profile.get(f"{column}_iv")
    ciphertext = profile.get(f"{column}_ct")
    tag = profile.get(f"{column}_tag")
    if (
        not isinstance(iv, str)
        or not isinstance(ciphertext, str)
        or not isinstance(tag, str)
    ):
        raise ValueError("Encrypted field missing")

    return crypto_manager.decrypt_field_with_fallbacks(
        "saju_profiles", column, iv, ciphertext, tag, key_id
    )


def _build_full_cached_reading_response(
    cached: dict, reading_id: Optional[str] = None
) -> ReadingResponse:
    pillars_data = cached.get("pillars_json") or {}
    card_data = cached.get("card_json") or {}
    tabs_data = cached.get("tabs_json") or {}
    advanced_data = cached.get("advanced_json") or {}
    extras = cached.get("extras_json") or {}
    cache_metadata = extras.get("cache_metadata") if isinstance(extras, dict) else {}
    prompt_version = (
        str(cache_metadata.get("prompt_version") or "")
        if isinstance(cache_metadata, dict)
        else ""
    )

    pillars = PillarsData(**pillars_data) if pillars_data else PillarsData()
    card = _parse_card(card_data) if card_data else CardData()
    tabs = _reconstruct_tabs_from_cache(tabs_data)
    advanced = _reconstruct_advanced_from_cache(advanced_data)

    character_data: Optional[SajuCharacter] = None
    day_pillar = pillars_data.get("day", "")
    if isinstance(day_pillar, str) and day_pillar:
        raw_character = get_saju_character(day_pillar[0])
        if raw_character:
            character_data = SajuCharacter(**raw_character)

    return ReadingResponse(
        one_liner=cached.get("one_liner", ""),
        pillars=pillars,
        card=card,
        saju_dna=extras.get("saju_dna"),
        hidden_personality=extras.get("hidden_personality"),
        superpower=extras.get("superpower"),
        hashtags=extras.get("hashtags"),
        famous_same_stem=extras.get("famous_same_stem"),
        yearly_predictions=extras.get("yearly_predictions"),
        character=character_data,
        tabs=tabs,
        advanced_analysis=advanced,
        rendered_markdown="",
        meta=MetaData(
            provider="cache",
            model_id=str(cached.get("model_version", "cached") or "cached"),
            prompt_version=prompt_version or "cached",
            latency_ms=0,
            cache_id=str(cached.get("id") or "") or None,
            reading_id=reading_id,
        ),
    )


def _build_cached_reading_response(
    cached: dict, reading_id: Optional[str] = None
) -> dict:
    full_response = _build_full_cached_reading_response(cached, reading_id=reading_id)
    projection = resolve_reading_projection()
    return dump_projected_reading_response(full_response, projection)


def _get_owned_user_reading_row(user_id: str, reading_id: str) -> Optional[dict]:
    try:
        result = (
            supabase.table("user_readings")
            .select("id, cache_id, context_json")
            .eq("id", reading_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
    except Exception:
        return None

    if isinstance(result.data, list) and result.data:
        row = result.data[0]
        if isinstance(row, dict):
            return row
    return None


def _has_detail_entitlement(user_reading: Optional[dict]) -> bool:
    if not isinstance(user_reading, dict):
        return False

    context_json = user_reading.get("context_json")
    if not isinstance(context_json, dict):
        return False

    reading_access = context_json.get("reading_access")
    if not isinstance(reading_access, dict):
        return False

    return reading_access.get("full_detail") is True


def _get_cache_row_by_id(cache_id: str) -> Optional[dict]:
    try:
        result = (
            supabase.table("saju_cache")
            .select("*")
            .eq("id", cache_id)
            .limit(1)
            .execute()
        )
    except Exception:
        return None

    if isinstance(result.data, list) and result.data:
        row = result.data[0]
        if isinstance(row, dict):
            return row
    return None


async def _get_active_cache_versions() -> tuple[str, str]:
    settings = get_settings()
    model_id = await config_service.get_model_main()
    provider = get_provider_for_model(model_id)
    return f"{provider.value}:{model_id}", settings.prompt_version


def _filter_reusable_cache(
    cached: Optional[dict],
    *,
    current_model_version: str,
    current_prompt_version: str,
    source: str,
) -> Optional[dict]:
    if not cached:
        return None

    # NOTE: stale 판정은 새 분석 요청(routes.py)에서만 적용.
    # 캐시 조회(마이페이지 등)에서는 기존 결과를 항상 반환하여
    # 월 변경 시 저장된 사주 클릭이 실패하는 버그를 방지.
    return cached


def _link_profile_cache(
    profile_id: str, user_id: str, cache_id: str, reading_id: Optional[str] = None
) -> None:
    try:
        supabase.table("saju_profiles").update({"cache_id": cache_id}).eq(
            "id", profile_id
        ).eq("user_id", user_id).execute()
    except Exception:
        logger.warning(
            "[CACHE] Failed to persist saju_profiles.cache_id for profile_id=%s",
            profile_id,
        )

    if reading_id:
        try:
            supabase.table("user_readings").update({"profile_id": profile_id}).eq(
                "id", reading_id
            ).eq("user_id", user_id).execute()
        except Exception:
            logger.warning(
                "[CACHE] Failed to persist user_readings.profile_id for reading_id=%s",
                reading_id,
            )


def _find_cache_from_user_readings(
    user_id: str,
    profile: dict,
    *,
    current_model_version: str,
    current_prompt_version: str,
) -> tuple[Optional[dict], Optional[str]]:
    try:
        result = (
            supabase.table("user_readings")
            .select("id, cache_id, label, persona, created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(150)
            .execute()
        )
    except Exception:
        return None, None

    rows = result.data if isinstance(result.data, list) else []
    rows = [row for row in rows if isinstance(row, dict) and row.get("cache_id")]
    if not rows:
        return None, None

    profile_label = str(profile.get("label") or "").strip()
    profile_persona = str(profile.get("persona") or "").strip().lower()
    profile_created_raw = str(profile.get("created_at") or "")

    profile_created_at: Optional[datetime] = None
    if profile_created_raw:
        try:
            profile_created_at = datetime.fromisoformat(
                profile_created_raw.replace("Z", "+00:00")
            )
        except ValueError:
            profile_created_at = None

    ranked_rows: list[tuple[tuple[int, int, int], dict[str, Any]]] = []

    for row in rows:
        label = str(row.get("label") or "").strip()
        persona = str(row.get("persona") or "").strip().lower()
        reading_created_raw = str(row.get("created_at") or "")

        time_penalty = 10**9
        if profile_created_at and reading_created_raw:
            try:
                reading_created_at = datetime.fromisoformat(
                    reading_created_raw.replace("Z", "+00:00")
                )
                time_penalty = int(
                    abs((reading_created_at - profile_created_at).total_seconds())
                )
            except ValueError:
                time_penalty = 10**9

        score = (
            1 if profile_label and label == profile_label else 0,
            1 if profile_persona and persona == profile_persona else 0,
            -time_penalty,
        )

        ranked_rows.append((score, row))

    for _, candidate_row in sorted(ranked_rows, key=lambda item: item[0], reverse=True):
        cache_id = candidate_row.get("cache_id")
        if not cache_id:
            continue

        cache_row = _filter_reusable_cache(
            _get_cache_row_by_id(str(cache_id)),
            current_model_version=current_model_version,
            current_prompt_version=current_prompt_version,
            source="user_readings_fallback",
        )
        if not cache_row:
            continue

        reading_id_raw = candidate_row.get("id")
        reading_id = str(reading_id_raw) if reading_id_raw else None
        return cache_row, reading_id

    return None, None


def _verify_profile_ownership(
    user_id: str, birth_date: str, hour: str, calendar_type: str, gender: str
) -> bool:
    """
    사용자가 해당 파라미터와 일치하는 프로필을 소유하고 있는지 검증
    """
    if not crypto_manager.aesgcm:
        raise HTTPException(status_code=500, detail="Server Encryption Error")

    result = (
        supabase.table("saju_profiles").select("*").eq("user_id", user_id).execute()
    )
    if not result.data:
        return False

    target_hour = _hour_branch_to_hour(hour)
    target_calendar = (calendar_type or "solar").strip().lower()
    target_gender = (gender or "male").strip().lower()

    for profile in result.data:
        if not isinstance(profile, dict):
            continue
        try:
            profile_birth_date = _decrypt_profile_field(profile, "birth_date")
            profile_hour_branch = _decrypt_profile_field(profile, "hour_branch")
            profile_calendar_type = _decrypt_profile_field(profile, "calendar_type")
            profile_gender = _decrypt_profile_field(profile, "gender")
        except Exception:
            continue

        profile_hour = _hour_branch_to_hour(profile_hour_branch)
        profile_calendar = (profile_calendar_type or "solar").strip().lower()
        profile_gender_value = (profile_gender or "male").strip().lower()

        if (
            profile_birth_date == birth_date
            and profile_hour == target_hour
            and profile_calendar == target_calendar
            and profile_gender_value == target_gender
        ):
            return True

    return False


def _is_birth_key_owned(user_id: str, birth_key: str) -> bool:
    if not crypto_manager.aesgcm:
        raise HTTPException(status_code=500, detail="Server Encryption Error")

    result = (
        supabase.table("saju_profiles").select("*").eq("user_id", user_id).execute()
    )
    if not result.data:
        return False

    for profile in result.data:
        if not isinstance(profile, dict):
            continue
        try:
            birth_date = _decrypt_profile_field(profile, "birth_date")
            hour_branch = _decrypt_profile_field(profile, "hour_branch")
            calendar_type = _decrypt_profile_field(profile, "calendar_type")
            gender = _decrypt_profile_field(profile, "gender")
        except Exception:
            continue

        hour_value = _hour_branch_to_hour(hour_branch)
        calendar = calendar_type or "solar"
        gender_value = gender or "male"
        expected_key = f"{birth_date}_{hour_value}_{calendar}_{gender_value}"
        if expected_key == birth_key:
            return True

    return False


async def get_cached_reading_by_params(
    birth_date: str,
    hour: str,
    calendar_type: str = "solar",
    gender: str = "male",
    persona: Optional[str] = None,
    current_user: dict = Depends(require_auth),
    _rate_limit: None = Depends(
        rate_limit_dependency(get_settings().rate_limit_per_minute, scope="cache")
    ),
):
    """
    Raw 파라미터로 캐시된 분석 결과 조회 (프론트엔드용)

    백엔드에서 HMAC birth_key를 생성하여 조회합니다.
    프론트엔드는 해싱 없이 원본 값만 전달하면 됩니다.

    Args:
        birth_date: 생년월일 (YYYY-MM-DD)
        hour: 시간 (00-23)
        calendar_type: 달력 유형 (solar/lunar)
        gender: 성별 (male/female)
        persona: 도사 페르소나 (classic/warm/witty/mz). 생략 시 classic→mz 순서로 조회

    Returns:
        캐시된 결과가 있으면 ReadingResponse, 없으면 404
    """
    # 소유권 검증 (IDOR 방지)
    user_id = current_user["user_id"]
    normalized_hour = _hour_branch_to_hour(hour)
    normalized_calendar = (calendar_type or "solar").strip().lower()
    normalized_gender = (gender or "male").strip().lower()

    if not _verify_profile_ownership(
        user_id, birth_date, normalized_hour, normalized_calendar, normalized_gender
    ):
        raise HTTPException(status_code=403, detail="소유하지 않은 사주 정보입니다")

    from ...core.security import hmac_birth_key

    normalized_birth_date = _normalize_birth_date_for_cache(
        birth_date, normalized_calendar
    )
    persona_candidates = (
        [persona.strip().lower()] if persona and persona.strip() else ["classic", "mz"]
    )

    current_model_version, current_prompt_version = await _get_active_cache_versions()

    cached = None
    for persona_candidate in persona_candidates:
        canonical = f"{normalized_birth_date}_{normalized_hour}_{normalized_calendar}_{normalized_gender}_{persona_candidate}"
        birth_key = hmac_birth_key(canonical)
        cached = _filter_reusable_cache(
            get_cached_reading_sync(birth_key),
            current_model_version=current_model_version,
            current_prompt_version=current_prompt_version,
            source=f"by_params:{persona_candidate}",
        )
        if cached:
            break

    if not cached:
        raise HTTPException(status_code=404, detail="캐시된 분석 결과가 없습니다")

    try:
        return _build_cached_reading_response(cached)
    except Exception as e:
        logger.exception("[CACHE] 캐시 데이터 변환 실패: %s", e)
        raise HTTPException(status_code=500, detail="캐시 데이터 변환 실패")


async def get_cached_reading_by_profile(
    profile_id: str,
    current_user: dict = Depends(require_auth),
    _rate_limit: None = Depends(
        rate_limit_dependency(get_settings().rate_limit_per_minute, scope="cache")
    ),
):
    user_id = current_user["user_id"]
    current_model_version, current_prompt_version = await _get_active_cache_versions()

    profile_result = (
        supabase.table("saju_profiles")
        .select("*")
        .eq("id", profile_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not profile_result.data:
        raise HTTPException(status_code=404, detail="프로필을 찾을 수 없습니다")

    profile = profile_result.data[0]
    if not isinstance(profile, dict):
        raise HTTPException(status_code=500, detail="프로필 데이터 형식 오류")

    linked_reading_result = (
        supabase.table("user_readings")
        .select("id, cache_id")
        .eq("user_id", user_id)
        .eq("profile_id", profile_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    linked_row = None
    linked_reading_id = None
    if isinstance(linked_reading_result.data, list) and linked_reading_result.data:
        candidate_row = linked_reading_result.data[0]
        if isinstance(candidate_row, dict):
            linked_row = candidate_row
            linked_reading_id = str(candidate_row.get("id") or "") or None

    profile_cache_id_raw = profile.get("cache_id")
    if profile_cache_id_raw:
        direct_cached = _filter_reusable_cache(
            _get_cache_row_by_id(str(profile_cache_id_raw)),
            current_model_version=current_model_version,
            current_prompt_version=current_prompt_version,
            source="by_profile:direct_cache_id",
        )
        if direct_cached:
            try:
                return _build_cached_reading_response(
                    direct_cached,
                    reading_id=linked_reading_id,
                )
            except Exception as e:
                logger.exception("[CACHE] 캐시 데이터 변환 실패: %s", e)
                raise HTTPException(status_code=500, detail="캐시 데이터 변환 실패")

    if linked_row and linked_row.get("cache_id"):
        linked_cache = _filter_reusable_cache(
            _get_cache_row_by_id(str(linked_row.get("cache_id"))),
            current_model_version=current_model_version,
            current_prompt_version=current_prompt_version,
            source="by_profile:linked_reading",
        )
        if linked_cache:
            _link_profile_cache(
                profile_id,
                user_id,
                str(linked_row.get("cache_id")),
                str(linked_row.get("id") or ""),
            )
            try:
                return _build_cached_reading_response(
                    linked_cache, reading_id=str(linked_row.get("id") or "") or None
                )
            except Exception as e:
                logger.exception("[CACHE] 캐시 데이터 변환 실패: %s", e)
                raise HTTPException(status_code=500, detail="캐시 데이터 변환 실패")
    cached = None
    try:
        birth_date = _decrypt_profile_field(profile, "birth_date")
        hour_branch = _decrypt_profile_field(profile, "hour_branch")
        calendar_type = _decrypt_profile_field(profile, "calendar_type")
        gender = _decrypt_profile_field(profile, "gender")

        from ...core.security import hmac_birth_key

        normalized_calendar = (calendar_type or "solar").strip().lower()
        normalized_gender = (gender or "male").strip().lower()

        normalized_birth_date = _normalize_birth_date_for_cache(
            birth_date, normalized_calendar
        )
        birth_date_candidates = [normalized_birth_date]
        if normalized_birth_date != birth_date:
            birth_date_candidates.append(birth_date)

        normalized_hour = _hour_branch_to_hour(hour_branch)
        hour_candidates = [normalized_hour]
        if not (hour_branch or "").strip():
            hour_candidates.extend(["12", "unknown"])
        elif normalized_hour == "12":
            hour_candidates.append("unknown")

        profile_persona = str(profile.get("persona") or "").strip().lower()
        persona_candidates = []
        for persona_candidate in [profile_persona, "classic", "mz", "warm", "witty"]:
            if persona_candidate and persona_candidate not in persona_candidates:
                persona_candidates.append(persona_candidate)

        for birth_date_candidate in birth_date_candidates:
            for hour_candidate in hour_candidates:
                for persona_candidate in persona_candidates:
                    canonical = f"{birth_date_candidate}_{hour_candidate}_{normalized_calendar}_{normalized_gender}_{persona_candidate}"
                    birth_key = hmac_birth_key(canonical)
                    cached = _filter_reusable_cache(
                        get_cached_reading_sync(birth_key),
                        current_model_version=current_model_version,
                        current_prompt_version=current_prompt_version,
                        source=f"by_profile:hmac:{persona_candidate}",
                    )
                    if cached:
                        break
                if cached:
                    break
            if cached:
                break
    except Exception:
        cached = None

    if not cached:
        fallback_cached, fallback_reading_id = _find_cache_from_user_readings(
            user_id,
            profile,
            current_model_version=current_model_version,
            current_prompt_version=current_prompt_version,
        )
        if fallback_cached:
            fallback_cache_id = str(fallback_cached.get("id") or "")
            if fallback_cache_id:
                _link_profile_cache(
                    profile_id, user_id, fallback_cache_id, fallback_reading_id
                )
            try:
                return _build_cached_reading_response(
                    fallback_cached, reading_id=fallback_reading_id
                )
            except Exception as e:
                logger.exception("[CACHE] 캐시 데이터 변환 실패: %s", e)
                raise HTTPException(status_code=500, detail="캐시 데이터 변환 실패")

        raise HTTPException(status_code=404, detail="캐시된 분석 결과가 없습니다")

    cached_id_raw = cached.get("id")
    if cached_id_raw:
        _link_profile_cache(profile_id, user_id, str(cached_id_raw))

    try:
        return _build_cached_reading_response(cached)
    except Exception as e:
        logger.exception("[CACHE] 캐시 데이터 변환 실패: %s", e)
        raise HTTPException(status_code=500, detail="캐시 데이터 변환 실패")


async def get_cached_reading_by_key(
    birth_key: str,
    current_user: dict = Depends(require_auth),
    _rate_limit: None = Depends(
        rate_limit_dependency(get_settings().rate_limit_per_minute, scope="cache")
    ),
):
    """
    birth_key로 캐시된 분석 결과 조회 (레거시, 내부용)

    birth_key 형식: HMAC 해시값

    NOTE: 프론트엔드는 /cache/by-params를 사용하세요.

    Returns:
        캐시된 결과가 있으면 ReadingResponse, 없으면 404
    """
    user_id = current_user["user_id"]
    if not _is_birth_key_owned(user_id, birth_key):
        raise HTTPException(status_code=403, detail="Not authorized")

    current_model_version, current_prompt_version = await _get_active_cache_versions()
    cached = _filter_reusable_cache(
        get_cached_reading_sync(birth_key),
        current_model_version=current_model_version,
        current_prompt_version=current_prompt_version,
        source="by_key",
    )

    if not cached:
        raise HTTPException(status_code=404, detail="캐시된 분석 결과가 없습니다")

    # 캐시된 데이터를 ReadingResponse 형식으로 변환
    try:
        return _build_cached_reading_response(cached)
    except Exception as e:
        logger.exception("[CACHE] 캐시 데이터 변환 실패: %s", e)
        raise HTTPException(status_code=500, detail="캐시 데이터 변환 실패")


async def get_reading_detail(
    reading_id: str,
    current_user: dict = Depends(require_auth),
    _rate_limit: None = Depends(
        rate_limit_dependency(
            get_settings().rate_limit_per_minute, scope="reading_detail"
        )
    ),
):
    user_id = current_user["user_id"]
    user_reading = _get_owned_user_reading_row(user_id, reading_id)
    if not user_reading:
        raise HTTPException(status_code=404, detail="리딩을 찾을 수 없습니다")

    if not _has_detail_entitlement(user_reading):
        raise HTTPException(status_code=403, detail="상세 사주 열람 권한이 없습니다")

    cache_id = str(user_reading.get("cache_id") or "").strip()
    if not cache_id:
        raise HTTPException(
            status_code=404, detail="상세 리딩 데이터를 찾을 수 없습니다"
        )

    cached = _get_cache_row_by_id(cache_id)
    if not cached:
        raise HTTPException(
            status_code=404, detail="상세 리딩 데이터를 찾을 수 없습니다"
        )

    try:
        full_response = _build_full_cached_reading_response(
            cached, reading_id=reading_id
        )
        full_response.meta.cache_id = cache_id
        return project_reading_response(
            full_response,
            resolve_reading_projection(has_paid_entitlement=True),
        )
    except Exception as e:
        logger.exception("[READING DETAIL] 리딩 데이터 변환 실패: %s", e)
        raise HTTPException(status_code=500, detail="상세 리딩 데이터 변환 실패")
