import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from korean_lunar_calendar import KoreanLunarCalendar
from pydantic import BaseModel

from ..core.security import crypto_manager, hmac_birth_key, CURRENT_KEY_VERSION
from ..db.supabase_client import supabase, db_execute
from .deps import get_current_user_id, rate_limit_dependency
from ..services.analytics_service import analytics

router = APIRouter(prefix="/saju/profiles", tags=["profiles"])
logger = logging.getLogger(__name__)

# TODO CONC-4: Add UNIQUE constraint on (user_id, birth_date_ct, hour_branch_ct, calendar_type_ct, gender_ct)
# to prevent duplicate profile creation from concurrent saves.

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


class ProfileCreate(BaseModel):
    label: str
    birth_date: str
    hour_branch: str
    calendar_type: str
    gender: str
    persona: Optional[str] = "classic"
    source_cache_id: Optional[str] = None
    source_reading_id: Optional[str] = None
    payment_transaction_id: Optional[str] = None


class SourceLinkResponse(BaseModel):
    cache_id: Optional[str] = None
    reading_id: Optional[str] = None


class ProfileResponse(ProfileCreate):
    id: str
    created_at: str


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
            "[PROFILE LINK] Failed to normalize lunar birth_date: %s",
            normalized_birth_date,
        )
        return normalized_birth_date


def _build_valid_birth_keys(input_data: ProfileCreate) -> set[str]:
    """
    프로필 입력으로 만들 수 있는 모든 유효한 birth_key HMAC 집합을 생성한다.
    여러 persona 변형을 포함하여 동일 생년월일/시간/성별이면 모두 매칭되도록 한다.
    """
    normalized_calendar = (input_data.calendar_type or "solar").strip().lower()
    normalized_gender = (input_data.gender or "male").strip().lower()
    normalized_hour = _hour_branch_to_hour(input_data.hour_branch)
    normalized_birth_date = _normalize_birth_date_for_cache(
        input_data.birth_date, normalized_calendar
    )

    birth_date_candidates: List[str] = [normalized_birth_date]
    raw_birth_date = (input_data.birth_date or "").strip()
    if raw_birth_date and raw_birth_date != normalized_birth_date:
        birth_date_candidates.append(raw_birth_date)

    hour_candidates: List[str] = [normalized_hour]
    if normalized_hour == "12":
        hour_candidates.append("unknown")

    profile_persona = (input_data.persona or "classic").strip().lower()
    persona_candidates: List[str] = []
    for p in [profile_persona, "classic", "mz", "warm", "witty"]:
        if p and p not in persona_candidates:
            persona_candidates.append(p)

    keys: set[str] = set()
    for bd in birth_date_candidates:
        for h in hour_candidates:
            for persona in persona_candidates:
                canonical = (
                    f"{bd}_{h}_{normalized_calendar}_{normalized_gender}_{persona}"
                )
                keys.add(hmac_birth_key(canonical))
    return keys


def _find_cache_id_by_birth_input(input_data: ProfileCreate) -> Optional[str]:
    normalized_calendar = (input_data.calendar_type or "solar").strip().lower()
    normalized_gender = (input_data.gender or "male").strip().lower()
    normalized_hour = _hour_branch_to_hour(input_data.hour_branch)
    normalized_birth_date = _normalize_birth_date_for_cache(
        input_data.birth_date, normalized_calendar
    )

    birth_date_candidates: List[str] = [normalized_birth_date]
    raw_birth_date = (input_data.birth_date or "").strip()
    if raw_birth_date and raw_birth_date != normalized_birth_date:
        birth_date_candidates.append(raw_birth_date)

    hour_candidates: List[str] = [normalized_hour]
    if normalized_hour == "12":
        hour_candidates.append("unknown")

    profile_persona = (input_data.persona or "classic").strip().lower()
    persona_candidates: List[str] = []
    for persona_candidate in [profile_persona, "classic", "mz", "warm", "witty"]:
        if persona_candidate and persona_candidate not in persona_candidates:
            persona_candidates.append(persona_candidate)

    for birth_date_candidate in birth_date_candidates:
        for hour_candidate in hour_candidates:
            for persona_candidate in persona_candidates:
                canonical = f"{birth_date_candidate}_{hour_candidate}_{normalized_calendar}_{normalized_gender}_{persona_candidate}"
                birth_key = hmac_birth_key(canonical)
                cached_result = (
                    supabase.table("saju_cache")
                    .select("id")
                    .eq("birth_key", birth_key)
                    .limit(1)
                    .execute()
                )
                if isinstance(cached_result.data, list) and cached_result.data:
                    row = cached_result.data[0]
                    if isinstance(row, dict) and row.get("id"):
                        return str(row.get("id"))

    return None


def _find_best_reading_candidate(
    user_id: str, input_data: ProfileCreate, profile_created_at_raw: str
) -> Optional[Dict[str, Any]]:
    """
    사용자의 최근 user_readings 에서 프로필과 매칭되는 reading 후보를 찾는다.
    birth_key 검증을 통해 실제로 동일 인물의 캐시인지 확인한다.
    """
    recent = (
        supabase.table("user_readings")
        .select("id, cache_id, label, persona, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(150)
        .execute()
    )

    rows = recent.data if isinstance(recent.data, list) else []
    rows = [row for row in rows if isinstance(row, dict) and row.get("cache_id")]
    if not rows:
        return None

    # birth_key 집합 생성: 이 프로필의 생년월일/시간/성별로 만들 수 있는 모든 유효 키
    valid_birth_keys = _build_valid_birth_keys(input_data)

    # 후보 reading 의 cache_id 수집 → 한 번의 쿼리로 birth_key 검증
    candidate_cache_ids = list(
        {str(row.get("cache_id")) for row in rows if row.get("cache_id")}
    )
    verified_cache_ids: set[str] = set()
    if valid_birth_keys and candidate_cache_ids:
        # cache_id 목록에서 birth_key 가 일치하는 것만 필터
        batch_size = 50
        for i in range(0, len(candidate_cache_ids), batch_size):
            batch = candidate_cache_ids[i : i + batch_size]
            cache_result = (
                supabase.table("saju_cache")
                .select("id, birth_key")
                .in_("id", batch)
                .execute()
            )
            if isinstance(cache_result.data, list):
                for cache_row in cache_result.data:
                    if isinstance(cache_row, dict):
                        cache_birth_key = str(cache_row.get("birth_key") or "")
                        if cache_birth_key in valid_birth_keys:
                            verified_cache_ids.add(str(cache_row.get("id")))

    target_persona = (input_data.persona or "classic").strip().lower()
    target_label = input_data.label.strip()

    profile_created_at: Optional[datetime] = None
    if profile_created_at_raw:
        try:
            profile_created_at = datetime.fromisoformat(
                profile_created_at_raw.replace("Z", "+00:00")
            )
        except ValueError:
            profile_created_at = None

    best_row: Optional[Dict[str, Any]] = None
    best_score: Optional[tuple[int, int, int]] = None

    for row in rows:
        row_cache_id = str(row.get("cache_id") or "")

        # birth_key 가 일치하지 않는 reading 은 완전히 건너뛴다 (다른 사람의 캐시)
        if valid_birth_keys and row_cache_id not in verified_cache_ids:
            continue

        row_label = str(row.get("label") or "").strip()
        row_persona = str(row.get("persona") or "").strip().lower()
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
            1 if target_label and row_label == target_label else 0,
            1 if target_persona and row_persona == target_persona else 0,
            -time_penalty,
        )

        if best_score is None or score > best_score:
            best_score = score
            best_row = row

    return best_row


def _find_latest_reading_id_by_cache(user_id: str, cache_id: str) -> Optional[str]:
    recent = (
        supabase.table("user_readings")
        .select("id")
        .eq("user_id", user_id)
        .eq("cache_id", cache_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if isinstance(recent.data, list) and recent.data:
        row = recent.data[0]
        if isinstance(row, dict) and row.get("id"):
            return str(row.get("id"))
    return None


def _resolve_explicit_source_link(
    user_id: str, input_data: ProfileCreate
) -> tuple[Optional[str], Optional[str]]:
    resolved_cache_id = str(input_data.source_cache_id or "").strip() or None
    resolved_reading_id = str(input_data.source_reading_id or "").strip() or None

    if resolved_reading_id:
        reading_result = (
            supabase.table("user_readings")
            .select("id, cache_id")
            .eq("id", resolved_reading_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not isinstance(reading_result.data, list) or not reading_result.data:
            raise HTTPException(
                status_code=400, detail="유효하지 않은 source_reading_id 입니다"
            )

        reading_row = reading_result.data[0]
        if not isinstance(reading_row, dict):
            raise HTTPException(
                status_code=400, detail="유효하지 않은 source_reading_id 입니다"
            )

        reading_cache_id = str(reading_row.get("cache_id") or "").strip()
        if not reading_cache_id:
            raise HTTPException(
                status_code=400, detail="source_reading_id에 연결된 cache_id가 없습니다"
            )

        if resolved_cache_id and resolved_cache_id != reading_cache_id:
            raise HTTPException(
                status_code=400,
                detail="source_cache_id와 source_reading_id가 일치하지 않습니다",
            )

        resolved_cache_id = reading_cache_id
        resolved_reading_id = str(reading_row.get("id"))

    # source_cache_id만 제공된 경우: 해당 유저의 reading에 연결된 cache_id인지 검증 (IDOR 방지)
    if resolved_cache_id and not resolved_reading_id:
        reading_id_by_cache = _find_latest_reading_id_by_cache(
            user_id, resolved_cache_id
        )
        if reading_id_by_cache:
            resolved_reading_id = reading_id_by_cache
        else:
            # 해당 유저의 reading에 없는 cache_id → 클라이언트 입력 무시
            logger.warning(
                "[PROFILE LINK] IDOR blocked: user=%s supplied cache_id=%s not in their readings",
                user_id,
                resolved_cache_id,
            )
            resolved_cache_id = None

    return resolved_cache_id, resolved_reading_id


@router.post("/resolve-link", response_model=SourceLinkResponse)
async def resolve_profile_source_link(
    input_data: ProfileCreate, user_id: str = Depends(get_current_user_id)
):
    try:
        cache_id, reading_id = _resolve_explicit_source_link(user_id, input_data)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("[PROFILE LINK] explicit source resolve failed: %s", e)
        raise HTTPException(
            status_code=500, detail="링크 소스 확인 중 오류가 발생했습니다"
        )

    if cache_id or reading_id:
        return SourceLinkResponse(cache_id=cache_id, reading_id=reading_id)

    fallback_cache_id = _find_cache_id_by_birth_input(input_data)
    fallback_reading_id = (
        _find_latest_reading_id_by_cache(user_id, fallback_cache_id)
        if fallback_cache_id
        else None
    )
    return SourceLinkResponse(
        cache_id=fallback_cache_id, reading_id=fallback_reading_id
    )


@router.post("")
async def create_profile(
    input_data: ProfileCreate,
    user_id: str = Depends(get_current_user_id),
    _rate_limit: None = Depends(
        rate_limit_dependency(limit=20, window_seconds=60, scope="profile_create")
    ),
):
    try:
        consent_result = (
            supabase.table("user_consents")
            .select("*")
            .eq("user_id", user_id)
            .eq("consent_type", "SAJU_PROFILE_STORE")
            .eq("is_granted", True)
            .order("granted_at", desc=True)
            .limit(1)
            .execute()
        )

        if not consent_result.data or len(consent_result.data) == 0:
            # 동의 기록이 없으면 자동으로 동의 부여 (기존 사용자 호환성)
            try:
                supabase.table("user_consents").insert(
                    {
                        "user_id": user_id,
                        "consent_type": "SAJU_PROFILE_STORE",
                        "version": "1.0",
                        "is_granted": True,
                    }
                ).execute()
            except Exception as e:
                logger.exception("[PROFILE] consent auto-grant failed: %s", e)
                raise HTTPException(
                    status_code=500, detail="동의 처리 중 오류가 발생했습니다"
                )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("[PROFILE] consent check failed: %s", e)
        raise HTTPException(
            status_code=500, detail="동의 상태 확인 중 오류가 발생했습니다"
        )

    if not crypto_manager.aesgcm:
        raise HTTPException(status_code=500, detail="Server Encryption Error")

    enc_birth = crypto_manager.encrypt_field(
        "saju_profiles", "birth_date", input_data.birth_date
    )
    enc_hour = crypto_manager.encrypt_field(
        "saju_profiles", "hour_branch", input_data.hour_branch
    )
    enc_cal = crypto_manager.encrypt_field(
        "saju_profiles", "calendar_type", input_data.calendar_type
    )
    enc_gender = crypto_manager.encrypt_field(
        "saju_profiles", "gender", input_data.gender
    )

    try:
        insert_data = {
            "user_id": user_id,
            "label": input_data.label,
            "key_id": CURRENT_KEY_VERSION,
            "birth_date_ct": enc_birth["ciphertext"],
            "birth_date_iv": enc_birth["iv"],
            "birth_date_tag": enc_birth["tag"],
            "hour_branch_ct": enc_hour["ciphertext"],
            "hour_branch_iv": enc_hour["iv"],
            "hour_branch_tag": enc_hour["tag"],
            "calendar_type_ct": enc_cal["ciphertext"],
            "calendar_type_iv": enc_cal["iv"],
            "calendar_type_tag": enc_cal["tag"],
            "gender_ct": enc_gender["ciphertext"],
            "gender_iv": enc_gender["iv"],
            "gender_tag": enc_gender["tag"],
        }
        insert_data["persona"] = input_data.persona or "classic"

        try:
            result = supabase.table("saju_profiles").insert(insert_data).execute()
        except Exception as e:
            error_text = str(e).lower()
            if "duplicate key" in error_text or "unique" in error_text:
                existing_result = (
                    supabase.table("saju_profiles")
                    .select("id")
                    .eq("user_id", user_id)
                    .eq("birth_date_ct", insert_data["birth_date_ct"])
                    .eq("hour_branch_ct", insert_data["hour_branch_ct"])
                    .eq("calendar_type_ct", insert_data["calendar_type_ct"])
                    .eq("gender_ct", insert_data["gender_ct"])
                    .order("created_at", desc=True)
                    .limit(1)
                    .execute()
                )

                existing_rows = (
                    existing_result.data
                    if isinstance(existing_result.data, list)
                    else []
                )
                if (
                    existing_rows
                    and isinstance(existing_rows[0], dict)
                    and existing_rows[0].get("id")
                ):
                    existing_profile_id = str(existing_rows[0].get("id"))
                    return {"id": existing_profile_id, "status": "saved"}
            raise

        data: List[Dict[str, Any]] = []
        if isinstance(result.data, list):
            data = [row for row in result.data if isinstance(row, dict)]
        if data:
            profile_id = data[0].get("id")

            if profile_id:
                profile_created_at_raw = str(data[0].get("created_at") or "")
                linked_cache_id: Optional[str]
                linked_reading_id: Optional[str]

                try:
                    linked_cache_id, linked_reading_id = _resolve_explicit_source_link(
                        user_id, input_data
                    )
                except Exception as e:
                    logger.warning(
                        "[PROFILE LINK] explicit source resolve failed (non-fatal): %s",
                        e,
                    )
                    linked_cache_id, linked_reading_id = None, None

                if not linked_cache_id:
                    try:
                        linked_cache_id = _find_cache_id_by_birth_input(input_data)
                    except Exception as e:
                        logger.exception(
                            "[PROFILE LINK] cache lookup by birth input failed: %s", e
                        )

                if not linked_reading_id:
                    try:
                        candidate = _find_best_reading_candidate(
                            user_id, input_data, profile_created_at_raw
                        )
                        if candidate:
                            candidate_cache_id = str(candidate.get("cache_id") or "")
                            candidate_reading_id = str(candidate.get("id") or "")
                            if (
                                linked_cache_id
                                and candidate_cache_id
                                and candidate_cache_id != linked_cache_id
                            ):
                                logger.warning(
                                    "[PROFILE LINK] candidate cache_id mismatch: linked=%s candidate=%s, skipping candidate",
                                    linked_cache_id,
                                    candidate_cache_id,
                                )
                            else:
                                if candidate_reading_id:
                                    linked_reading_id = candidate_reading_id
                                if not linked_cache_id and candidate_cache_id:
                                    linked_cache_id = candidate_cache_id
                    except Exception as e:
                        logger.exception(
                            "[PROFILE LINK] reading candidate lookup failed: %s", e
                        )

                if linked_cache_id and not linked_reading_id:
                    try:
                        linked_reading_id = _find_latest_reading_id_by_cache(
                            user_id, linked_cache_id
                        )
                    except Exception as e:
                        logger.exception(
                            "[PROFILE LINK] reading lookup by cache_id failed: %s", e
                        )

                if linked_cache_id:
                    try:
                        supabase.table("saju_profiles").update(
                            {"cache_id": linked_cache_id}
                        ).eq("id", profile_id).eq("user_id", user_id).execute()
                        if linked_reading_id:
                            supabase.table("user_readings").update(
                                {"profile_id": profile_id}
                            ).eq("id", linked_reading_id).eq(
                                "user_id", user_id
                            ).execute()
                        logger.info(
                            "[PROFILE LINK] resolved: profile_id=%s cache_id=%s reading_id=%s source=%s",
                            profile_id,
                            linked_cache_id,
                            linked_reading_id,
                            "explicit"
                            if input_data.source_cache_id
                            or input_data.source_reading_id
                            else "fallback",
                        )
                    except Exception as e:
                        logger.exception(
                            "[PROFILE LINK] persist link failed: profile_id=%s cache_id=%s err=%s",
                            profile_id,
                            linked_cache_id,
                            e,
                        )
                else:
                    logger.warning(
                        "[PROFILE LINK] unresolved link: profile_id=%s user_id=%s",
                        profile_id,
                        user_id,
                    )

            if profile_id:
                new_profile_id = str(profile_id)
                try:
                    await analytics.track_event(
                        event_type="profile_created",
                        event_data={
                            "profile_id": new_profile_id,
                            "label": input_data.label,
                        },
                        user_id=user_id,
                    )
                except Exception:
                    logger.warning("[PROFILE] Failed to track profile_created event")

            return {"id": profile_id, "status": "saved"}
        logger.error("[PROFILE] insert returned no data for user_id=%s", user_id)
        raise HTTPException(
            status_code=500, detail="프로필 저장 후 결과를 확인할 수 없습니다"
        )
    except Exception as e:
        logger.exception("[PROFILE] save failed: %s", e)
        raise HTTPException(
            status_code=500, detail="프로필 저장 중 오류가 발생했습니다"
        )


@router.get("", response_model=List[ProfileResponse])
async def get_profiles(
    user_id: str = Depends(get_current_user_id),
    _rl: None = Depends(
        rate_limit_dependency(limit=30, window_seconds=60, scope="profile_list")
    ),
):
    try:
        result = (
            supabase.table("saju_profiles")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )

        data: List[Dict[str, Any]] = []
        if isinstance(result.data, list):
            data = [row for row in result.data if isinstance(row, dict)]
        if not data:
            return []

        out = []

        def decrypt_profile_field(
            table: str, column: str, row: Dict[str, Any], key_id: str
        ) -> str:
            iv = row.get(f"{column}_iv")
            ciphertext = row.get(f"{column}_ct")
            tag = row.get(f"{column}_tag")
            if (
                not isinstance(iv, str)
                or not isinstance(ciphertext, str)
                or not isinstance(tag, str)
            ):
                raise ValueError("Encrypted field missing")
            return crypto_manager.decrypt_field_with_fallbacks(
                table, column, iv, ciphertext, tag, key_id
            )

        for p in data:
            try:
                key_id = p.get("key_id") or "v1"
                if not isinstance(key_id, str):
                    key_id = str(key_id)
                bd = decrypt_profile_field("saju_profiles", "birth_date", p, key_id)
                hb = decrypt_profile_field("saju_profiles", "hour_branch", p, key_id)
                ct = decrypt_profile_field("saju_profiles", "calendar_type", p, key_id)
                gd = decrypt_profile_field("saju_profiles", "gender", p, key_id)

                out.append(
                    ProfileResponse(
                        id=str(p.get("id")),
                        label=p.get("label", ""),
                        birth_date=bd,
                        hour_branch=hb,
                        calendar_type=ct,
                        gender=gd,
                        persona=p.get("persona"),
                        source_cache_id=str(p.get("source_cache_id"))
                        if p.get("source_cache_id")
                        else None,
                        source_reading_id=str(p.get("source_reading_id"))
                        if p.get("source_reading_id")
                        else None,
                        created_at=str(p.get("created_at", "")),
                    )
                )
            except Exception as e:
                logger.exception(
                    "[PROFILE] decryption failed for profile %s: %s", p.get("id"), e
                )
                continue

        return out
    except Exception as e:
        logger.exception("[PROFILE] get profiles failed: %s", e)
        raise HTTPException(
            status_code=500, detail="프로필 목록 조회 중 오류가 발생했습니다"
        )


@router.delete("/{profile_id}")
async def delete_profile(
    profile_id: str,
    user_id: str = Depends(get_current_user_id),
    _rl: None = Depends(
        rate_limit_dependency(limit=20, window_seconds=60, scope="profile_delete")
    ),
):
    # TODO CONC-8: Profile update has no optimistic locking.
    # Consider adding updated_at check to prevent lost updates from concurrent edits.
    try:
        supabase.table("saju_profiles").delete().eq("id", profile_id).eq(
            "user_id", user_id
        ).execute()

        try:
            await analytics.track_event(
                event_type="profile_deleted",
                event_data={"profile_id": profile_id},
                user_id=user_id,
            )
        except Exception:
            logger.warning("[PROFILE] Failed to track profile_deleted event")

        return {"status": "deleted"}
    except Exception as e:
        logger.exception("[PROFILE] delete failed: %s", e)
        raise HTTPException(
            status_code=500, detail="프로필 삭제 중 오류가 발생했습니다"
        )
