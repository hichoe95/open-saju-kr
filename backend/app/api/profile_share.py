import secrets
import logging
from datetime import datetime, timedelta, timezone
from typing import Any
from cryptography.exceptions import InvalidTag
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..db.supabase_client import supabase, db_execute
from ..core.security import crypto_manager
from .reading.cache_ops import (
    _build_cached_reading_response,
    _get_cache_row_by_id,
    _hour_branch_to_hour,
)
from .deps import get_current_user_id, rate_limit_dependency

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/profile", tags=["profile-share"])

SHARE_CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
SHARE_CONSENT_TYPE = "SAJU_PROFILE_SHARE"


class ShareCodeResponse(BaseModel):
    code: str
    expires_at: str


class ProfileByCodeResponse(BaseModel):
    name: str
    birth_date: str
    hour_branch: str
    gender: str


class ProfileByCodeRedeemResponse(BaseModel):
    sharer_name: str | None = None
    birth_input: dict
    reading_data: dict


def _generate_code() -> str:
    return "".join(secrets.choice(SHARE_CODE_CHARSET) for _ in range(6))


def _normalize_iso(value: str) -> str:
    if value.endswith("Z"):
        return value[:-1] + "+00:00"
    return value


def _parse_expires_at(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(_normalize_iso(value))


def _is_expired(expires_at: datetime | None) -> bool:
    if not expires_at:
        return False
    return datetime.now(timezone.utc) > expires_at


async def _generate_unique_code() -> str:
    code = _generate_code()
    for _ in range(5):
        existing = await db_execute(
            lambda c=code: (
                supabase.table("profile_share_codes")
                .select("id")
                .eq("code", c)
                .execute()
            )
        )
        existing_shared = await db_execute(
            lambda c=code: (
                supabase.table("shared_saju").select("id").eq("share_code", c).execute()
            )
        )
        if not existing.data and not existing_shared.data:
            return code
        code = _generate_code()
    return code


async def _ensure_share_consent(user_id: str) -> None:
    try:
        consent_result = await db_execute(
            lambda: (
                supabase.table("user_consents")
                .select("is_granted")
                .eq("user_id", user_id)
                .eq("consent_type", SHARE_CONSENT_TYPE)
                .order("granted_at", desc=True)
                .limit(1)
                .execute()
            )
        )
    except Exception as e:
        logger.exception("[PROFILE_SHARE] consent check failed: %s", e)
        raise HTTPException(
            status_code=500, detail="공유 동의 확인 중 오류가 발생했습니다"
        )

    rows = consent_result.data if isinstance(consent_result.data, list) else []
    row = rows[0] if rows else None
    is_granted = bool(row.get("is_granted")) if isinstance(row, dict) else False
    if not is_granted:
        raise HTTPException(status_code=403, detail="공유 전 동의가 필요합니다")


async def _get_share_code_row(normalized_code: str) -> dict:
    result = await db_execute(
        lambda: (
            supabase.table("profile_share_codes")
            .select("*")
            .eq("code", normalized_code)
            .execute()
        )
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Share code not found")

    row = result.data[0]
    if not isinstance(row, dict):
        raise HTTPException(status_code=400, detail="공유 코드 처리 오류")
    return row


def _validate_share_code_preview(share_code_row: dict[str, Any]) -> None:
    expires_at_raw = share_code_row.get("expires_at")
    expires_at = _parse_expires_at(str(expires_at_raw)) if expires_at_raw else None
    if _is_expired(expires_at):
        raise HTTPException(status_code=410, detail="Share code expired")

    use_count_raw = share_code_row.get("use_count")
    max_uses_raw = share_code_row.get("max_uses")
    use_count = use_count_raw if isinstance(use_count_raw, int) else 0
    max_uses = max_uses_raw if isinstance(max_uses_raw, int) else 0
    if max_uses > 0 and use_count >= max_uses:
        raise HTTPException(status_code=410, detail="Share code expired")


async def _consume_share_code(normalized_code: str) -> dict:
    increment_result = await db_execute(
        lambda: supabase.rpc(
            "increment_share_code_use_count", {"p_code": normalized_code}
        ).execute()
    )

    inc_data = increment_result.data
    if isinstance(inc_data, list):
        inc_data = inc_data[0] if inc_data else {}
    if isinstance(inc_data, str):
        import json

        inc_data = json.loads(inc_data)
    if not isinstance(inc_data, dict):
        raise HTTPException(status_code=400, detail="공유 코드 처리 오류")
    if not inc_data.get("success"):
        error = inc_data.get("error", "")
        if error == "NOT_FOUND":
            raise HTTPException(status_code=404, detail="Share code not found")
        if error in {"EXPIRED", "MAX_USES_EXCEEDED"}:
            raise HTTPException(status_code=410, detail="Share code expired")
        raise HTTPException(status_code=400, detail="공유 코드 처리 오류")
    return inc_data


async def _get_decrypted_profile_fields(profile_id_val: str) -> dict[str, str]:
    profile_result = await db_execute(
        lambda: (
            supabase.table("saju_profiles")
            .select("*")
            .eq("id", profile_id_val)
            .execute()
        )
    )
    if not profile_result.data:
        raise HTTPException(status_code=404, detail="Profile not found")

    if not crypto_manager.aesgcm:
        raise HTTPException(status_code=500, detail="Server Encryption Error")

    profile = profile_result.data[0]
    if not isinstance(profile, dict):
        raise HTTPException(status_code=400, detail="공유 코드 처리 오류")
    row_key_id = str(profile.get("key_id", "v1"))

    def _decrypt_field(column: str) -> str:
        iv = str(profile.get(f"{column}_iv", ""))
        ct = str(profile.get(f"{column}_ct", ""))
        tag = str(profile.get(f"{column}_tag", ""))
        try:
            return crypto_manager.decrypt_field(
                "saju_profiles", column, iv, ct, tag, row_key_id
            )
        except InvalidTag:
            logger.warning(
                "[PROFILE_SHARE] decrypt_field fallback for saju_profiles.%s (AAD 없이 폴백, key_id=%s)",
                column,
                row_key_id,
            )
            return crypto_manager.decrypt(iv, ct, tag, key_id=row_key_id)

    birth_date = _decrypt_field("birth_date")
    hour_branch = _decrypt_field("hour_branch")
    gender = _decrypt_field("gender")

    return {
        "name": str(profile.get("label", "")),
        "birth_date": birth_date,
        "hour_branch": hour_branch,
        "calendar_type": _decrypt_field("calendar_type"),
        "gender": gender,
        "persona": str(profile.get("persona") or "classic"),
    }


async def _get_profile_share_snapshot(profile_id_val: str) -> dict[str, Any]:
    profile_fields = await _get_decrypted_profile_fields(profile_id_val)

    profile_result = await db_execute(
        lambda: (
            supabase.table("saju_profiles")
            .select("cache_id")
            .eq("id", profile_id_val)
            .limit(1)
            .execute()
        )
    )
    profile_rows = profile_result.data if isinstance(profile_result.data, list) else []
    profile_row = profile_rows[0] if profile_rows else None
    cache_row = None
    if isinstance(profile_row, dict):
        profile_cache_id = profile_row.get("cache_id")
        if profile_cache_id:
            cache_row = _get_cache_row_by_id(str(profile_cache_id))

    if cache_row is None:
        linked_result = await db_execute(
            lambda: (
                supabase.table("user_readings")
                .select("cache_id")
                .eq("profile_id", profile_id_val)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
        )
        linked_rows = linked_result.data if isinstance(linked_result.data, list) else []
        linked_row = linked_rows[0] if linked_rows else None
        if isinstance(linked_row, dict) and linked_row.get("cache_id"):
            cache_row = _get_cache_row_by_id(str(linked_row.get("cache_id")))

    if cache_row is None:
        raise HTTPException(
            status_code=404, detail="공유할 분석 결과를 찾을 수 없습니다"
        )

    reading_data = _build_cached_reading_response(cache_row)
    birth_input = {
        "name": profile_fields["name"],
        "birth_solar": profile_fields["birth_date"],
        "birth_time": f"{_hour_branch_to_hour(profile_fields['hour_branch'])}:00",
        "timezone": "Asia/Seoul",
        "birth_place": "대한민국",
        "calendar_type": profile_fields["calendar_type"],
        "gender": profile_fields["gender"],
        "persona": profile_fields["persona"],
    }
    return {
        "sharer_name": profile_fields["name"] or None,
        "birth_input": birth_input,
        "reading_data": reading_data,
    }


async def _delete_shared_snapshot(share_code: str) -> None:
    await db_execute(
        lambda: (
            supabase.table("shared_saju")
            .delete()
            .eq("share_code", share_code)
            .execute()
        )
    )


async def _store_shared_snapshot(
    share_code: str,
    snapshot: dict[str, Any],
    expires_at: datetime,
    user_id: str,
) -> None:
    await _delete_shared_snapshot(share_code)
    insert_data = {
        "share_code": share_code,
        "user_id": user_id,
        "sharer_name": snapshot.get("sharer_name"),
        "birth_input": snapshot.get("birth_input")
        if isinstance(snapshot.get("birth_input"), dict)
        else {},
        "reading_data": snapshot.get("reading_data")
        if isinstance(snapshot.get("reading_data"), dict)
        else {},
        "expires_at": expires_at.isoformat(),
        "view_count": 0,
    }
    await db_execute(
        lambda: supabase.table("shared_saju").insert(insert_data).execute()
    )


async def _get_shared_snapshot_by_code(share_code: str) -> dict[str, Any]:
    result = await db_execute(
        lambda: (
            supabase.table("shared_saju")
            .select("*")
            .eq("share_code", share_code)
            .limit(1)
            .execute()
        )
    )
    rows = result.data if isinstance(result.data, list) else []
    if not rows:
        raise HTTPException(status_code=404, detail="공유 데이터를 찾을 수 없습니다")
    row = rows[0]
    if not isinstance(row, dict):
        raise HTTPException(status_code=400, detail="공유 데이터 처리 오류")

    expires_at_raw = row.get("expires_at")
    expires_at = _parse_expires_at(str(expires_at_raw)) if expires_at_raw else None
    if _is_expired(expires_at):
        raise HTTPException(status_code=410, detail="Share code expired")
    return {
        "sharer_name": row.get("sharer_name"),
        "birth_input": row.get("birth_input")
        if isinstance(row.get("birth_input"), dict)
        else {},
        "reading_data": row.get("reading_data")
        if isinstance(row.get("reading_data"), dict)
        else {},
    }


@router.post("/{profile_id}/share-code", response_model=ShareCodeResponse)
async def create_profile_share_code(
    profile_id: str, user_id: str = Depends(get_current_user_id)
):
    profile_result = await db_execute(
        lambda: (
            supabase.table("saju_profiles")
            .select("id, user_id")
            .eq("id", profile_id)
            .execute()
        )
    )

    profile_rows = profile_result.data if isinstance(profile_result.data, list) else []
    if not profile_rows:
        raise HTTPException(status_code=404, detail="Profile not found")

    profile = profile_rows[0]
    if not isinstance(profile, dict):
        raise HTTPException(status_code=400, detail="공유 코드 처리 오류")
    if profile.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    await _ensure_share_consent(user_id)

    snapshot = await _get_profile_share_snapshot(profile_id)

    existing_codes_result = await db_execute(
        lambda: (
            supabase.table("profile_share_codes")
            .select("code")
            .eq("profile_id", profile_id)
            .execute()
        )
    )
    existing_rows = (
        existing_codes_result.data
        if isinstance(existing_codes_result.data, list)
        else []
    )
    for row in existing_rows:
        if isinstance(row, dict) and row.get("code"):
            await _delete_shared_snapshot(str(row.get("code")))

    await db_execute(
        lambda: (
            supabase.table("profile_share_codes")
            .delete()
            .eq("profile_id", profile_id)
            .execute()
        )
    )

    code = await _generate_unique_code()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
    await _store_shared_snapshot(code, snapshot, expires_at, user_id)

    insert_data = {
        "profile_id": profile_id,
        "code": code,
        "expires_at": expires_at.isoformat(),
        "use_count": 0,
        "max_uses": 1,
    }

    result = await db_execute(
        lambda: supabase.table("profile_share_codes").insert(insert_data).execute()
    )
    result_rows = result.data if isinstance(result.data, list) else []
    if not result_rows:
        raise HTTPException(status_code=500, detail="Failed to create share code")

    return ShareCodeResponse(code=code, expires_at=expires_at.isoformat())


@router.get("/by-code/{code}", response_model=ProfileByCodeResponse)
async def get_profile_by_code(
    code: str,
    _rl: None = Depends(
        rate_limit_dependency(limit=10, window_seconds=60, scope="share_code_lookup")
    ),
):
    normalized_code = code.strip().upper()
    share_code = await _get_share_code_row(normalized_code)
    _validate_share_code_preview(share_code)
    profile_id_val = str(share_code.get("profile_id", ""))
    profile_fields = await _get_decrypted_profile_fields(profile_id_val)
    birth_date = profile_fields["birth_date"]

    masked_birth_date = (
        birth_date[:8] + "**" if birth_date and len(birth_date) >= 10 else birth_date
    )

    return ProfileByCodeResponse(
        name=profile_fields["name"],
        birth_date=masked_birth_date,
        hour_branch=profile_fields["hour_branch"],
        gender=profile_fields["gender"],
    )


@router.post("/by-code/{code}/redeem", response_model=ProfileByCodeRedeemResponse)
async def redeem_profile_by_code(
    code: str,
    user_id: str = Depends(get_current_user_id),
    _rl: None = Depends(
        rate_limit_dependency(limit=10, window_seconds=60, scope="share_code_redeem")
    ),
):
    _ = user_id
    normalized_code = code.strip().upper()
    await _consume_share_code(normalized_code)
    snapshot = await _get_shared_snapshot_by_code(normalized_code)
    sharer_name_raw = snapshot.get("sharer_name")
    birth_input_raw = snapshot.get("birth_input")
    reading_data_raw = snapshot.get("reading_data")
    birth_input = birth_input_raw if isinstance(birth_input_raw, dict) else {}
    reading_data = reading_data_raw if isinstance(reading_data_raw, dict) else {}
    return ProfileByCodeRedeemResponse(
        sharer_name=str(sharer_name_raw) if isinstance(sharer_name_raw, str) else None,
        birth_input=birth_input,
        reading_data=reading_data,
    )


@router.delete("/share-code/{code}")
async def delete_profile_share_code(
    code: str, user_id: str = Depends(get_current_user_id)
):
    normalized_code = code.strip().upper()
    result = await db_execute(
        lambda: (
            supabase.table("profile_share_codes")
            .select("id, profile_id")
            .eq("code", normalized_code)
            .execute()
        )
    )

    result_rows = result.data if isinstance(result.data, list) else []
    if not result_rows:
        raise HTTPException(status_code=404, detail="Share code not found")

    share_code = result_rows[0]
    if not isinstance(share_code, dict):
        raise HTTPException(status_code=400, detail="공유 코드 처리 오류")
    del_profile_id = str(share_code.get("profile_id", ""))
    profile_result = await db_execute(
        lambda: (
            supabase.table("saju_profiles")
            .select("user_id")
            .eq("id", del_profile_id)
            .execute()
        )
    )

    profile_rows = profile_result.data if isinstance(profile_result.data, list) else []
    if not profile_rows:
        raise HTTPException(status_code=404, detail="Profile not found")

    profile = profile_rows[0]
    if not isinstance(profile, dict):
        raise HTTPException(status_code=400, detail="공유 코드 처리 오류")
    if profile.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    del_id = str(share_code.get("id", ""))
    await db_execute(
        lambda: (
            supabase.table("profile_share_codes").delete().eq("id", del_id).execute()
        )
    )
    await _delete_shared_snapshot(normalized_code)
    return {"status": "deleted"}
