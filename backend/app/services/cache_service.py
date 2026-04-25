import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any

from ..db.supabase_client import supabase
from ..schemas import ReadingResponse, BirthInput
from ..core.security import hmac_birth_key

logger = logging.getLogger(__name__)
KST = timezone(timedelta(hours=9))


def _dump_model_like(value: Any) -> Any:
    model_dump = getattr(value, "model_dump", None)
    if callable(model_dump):
        return model_dump()
    return value


# TODO PRIV-DATA-4: saju_cache needs expires_at column for auto-purge.
# Migration: ALTER TABLE saju_cache ADD COLUMN expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days');
# Then create a cron job or scheduled function to DELETE FROM saju_cache WHERE expires_at < NOW();

# TODO PRIV-DATA-5: context_json contains user concern text and should be encrypted.
# Currently stored as plaintext in user_readings.context_json.
# Should encrypt with crypto_manager.encrypt() before storage.


def make_birth_key(birth_input: BirthInput) -> str:
    hour_branch = (
        birth_input.birth_time.split(":")[0] if birth_input.birth_time else "unknown"
    )
    calendar = birth_input.calendar_type or "solar"
    gender = birth_input.gender or "male"
    persona = birth_input.persona.value if birth_input.persona else "classic"

    canonical = f"{birth_input.birth_solar}_{hour_branch}_{calendar}_{gender}_{persona}"
    return hmac_birth_key(canonical)


def get_cached_reading_sync(birth_key: str) -> Optional[Dict[str, Any]]:
    """캐시된 사주 분석 조회 (Supabase)"""
    try:
        result = (
            supabase.table("saju_cache")
            .select("*")
            .eq("birth_key", birth_key)
            .execute()
        )
        if result.data and len(result.data) > 0:
            row = result.data[0]
            if isinstance(row, dict):
                return row
        return None
    except Exception as e:
        logger.exception(f"[CACHE] get_cached_reading_sync error: {e}")
        return None


def _parse_cache_datetime(raw_value: Any) -> Optional[datetime]:
    if isinstance(raw_value, datetime):
        if raw_value.tzinfo is None:
            return raw_value.replace(tzinfo=timezone.utc)
        return raw_value

    if not isinstance(raw_value, str) or not raw_value:
        return None

    normalized = raw_value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


def get_cache_reuse_status(
    cached_row: Dict[str, Any],
    *,
    current_model_version: str,
    current_prompt_version: str,
    now: Optional[datetime] = None,
) -> tuple[bool, str]:
    reference_now = now or datetime.now(timezone.utc)
    if reference_now.tzinfo is None:
        reference_now = reference_now.replace(tzinfo=timezone.utc)

    updated_at = _parse_cache_datetime(cached_row.get("updated_at"))
    created_at = _parse_cache_datetime(cached_row.get("created_at"))
    freshness_time = updated_at or created_at
    if freshness_time is None:
        return False, "missing_cache_timestamp"

    cached_month = freshness_time.astimezone(KST).strftime("%Y-%m")
    current_month = reference_now.astimezone(KST).strftime("%Y-%m")
    if cached_month != current_month:
        return False, f"stale_month:{cached_month}->{current_month}"

    cached_model_version = str(cached_row.get("model_version") or "")
    if cached_model_version != current_model_version:
        return False, "model_version_mismatch"

    extras = cached_row.get("extras_json")
    extras_dict = extras if isinstance(extras, dict) else {}
    metadata = extras_dict.get("cache_metadata")
    metadata_dict = metadata if isinstance(metadata, dict) else {}
    cached_prompt_version = str(metadata_dict.get("prompt_version") or "")
    if not cached_prompt_version:
        return False, "missing_prompt_version"
    if cached_prompt_version != current_prompt_version:
        return False, "prompt_version_mismatch"

    return True, "fresh"


def save_to_cache_supabase(
    birth_key: str, response: ReadingResponse, model_version: str
) -> Optional[str]:
    """캐시에 사주 분석 저장 (Supabase)"""
    try:
        now_utc = datetime.now(timezone.utc)
        tabs_dict = response.tabs.model_dump() if response.tabs else {}
        if "lucky" in tabs_dict:
            # NOTE: 행운키트(tabs.lucky)는 날짜가 바뀌면 매일 새로 생성되어야 하므로 캐시에 저장하지 않는다.
            daily_lucky_fields = [
                # today fortune
                "today_overview",
                "today_love",
                "today_money",
                "today_advice",
                # lucky kit (v1)
                "lucky_color",
                "lucky_number",
                "lucky_direction",
                "lucky_item",
                "power_spot",
                # lucky kit (v2)
                "golden_time",
                "dead_time",
                "food_recommendation",
                "mission_of_day",
                "power_hour",
                "talisman_phrase",
            ]
            for key in daily_lucky_fields:
                tabs_dict["lucky"].pop(key, None)

        advanced_dict = (
            response.advanced_analysis.model_dump()
            if response.advanced_analysis
            else {}
        )
        if "seun" in advanced_dict:
            advanced_dict.pop("seun", None)

        pillars_data = response.pillars.model_dump() if response.pillars else None
        card_data = response.card.model_dump() if response.card else None

        data = {
            "birth_key": birth_key,
            "pillars_json": pillars_data,
            "card_json": card_data,
            "tabs_json": tabs_dict,
            "advanced_json": advanced_dict,
            "one_liner": response.one_liner,
            "model_version": model_version,
            "updated_at": now_utc.isoformat(),
            "expires_at": (now_utc + timedelta(days=90)).isoformat(),
        }

        extras: Dict[str, Any] = {}
        if response.saju_dna is not None:
            extras["saju_dna"] = response.saju_dna
        if response.hidden_personality is not None:
            extras["hidden_personality"] = _dump_model_like(response.hidden_personality)
        if response.superpower is not None:
            extras["superpower"] = response.superpower
        if response.hashtags is not None:
            extras["hashtags"] = response.hashtags
        if response.famous_same_stem is not None:
            extras["famous_same_stem"] = response.famous_same_stem
        if response.yearly_predictions is not None:
            extras["yearly_predictions"] = [
                _dump_model_like(prediction)
                for prediction in response.yearly_predictions
            ]
        extras["cache_metadata"] = {
            "prompt_version": response.meta.prompt_version if response.meta else "",
        }

        data["extras_json"] = extras if extras else None

        result = (
            supabase.table("saju_cache").upsert(data, on_conflict="birth_key").execute()
        )

        if result.data and len(result.data) > 0:
            row = result.data[0]
            if not isinstance(row, dict):
                return None
            cache_id_raw = row.get("id")
            cache_id = str(cache_id_raw) if cache_id_raw else None
            logger.info(
                f"[CACHE SUPABASE] Upserted: birth_key={birth_key}, id={cache_id}"
            )
            return cache_id
        else:
            logger.info(
                f"[CACHE SUPABASE] Upsert completed but no id returned: birth_key={birth_key}"
            )
            return None

    except Exception as e:
        logger.exception("[CACHE SUPABASE ERROR] Failed to save cache: %s", e)
        return None


def save_user_reading_supabase(
    user_id: str,
    cache_id: str,
    profile_id: Optional[str] = None,
    label: str = "내 사주",
    persona: str = "classic",
    context_json: Optional[Dict[str, Any]] = None,
    processing_time_ms: Optional[int] = None,
) -> Optional[str]:
    """사용자 리딩 저장 (Supabase)"""
    try:
        data: Dict[str, Any] = {
            "user_id": user_id,
            "cache_id": cache_id,
            "label": label,
            "persona": persona,
        }

        if profile_id:
            data["profile_id"] = profile_id

        if context_json is not None:
            data["context_json"] = context_json

        if processing_time_ms is not None:
            data["processing_time_ms"] = processing_time_ms

        result = supabase.table("user_readings").insert(data).execute()

        if result.data and len(result.data) > 0:
            row = result.data[0]
            if not isinstance(row, dict):
                return None
            reading_id_raw = row.get("id")
            reading_id = str(reading_id_raw) if reading_id_raw else None
            logger.info(
                f"[USER READING SUPABASE] Saved: user_id={user_id}, cache_id={cache_id}, persona={persona}, id={reading_id}"
            )
            return reading_id
        return None

    except Exception as e:
        logger.exception(
            "[USER READING SUPABASE ERROR] Failed to save user reading: %s", e
        )
        return None
