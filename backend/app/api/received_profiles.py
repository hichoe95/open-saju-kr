import logging
from datetime import datetime, timezone
from typing import Any, Optional

from cryptography.exceptions import InvalidTag
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..core.security import CURRENT_KEY_VERSION, crypto_manager
from ..db.supabase_client import db_execute, supabase
from .profile_share import _consume_share_code, _get_profile_share_snapshot
from .deps import get_current_user_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/profile/received", tags=["received-profiles"])


_HOUR_TO_BRANCH = {
    23: "子",
    0: "子",
    1: "丑",
    2: "丑",
    3: "寅",
    4: "寅",
    5: "卯",
    6: "卯",
    7: "辰",
    8: "辰",
    9: "巳",
    10: "巳",
    11: "午",
    12: "午",
    13: "未",
    14: "未",
    15: "申",
    16: "申",
    17: "酉",
    18: "酉",
    19: "戌",
    20: "戌",
    21: "亥",
    22: "亥",
}

_VALID_BRANCHES = {
    "子",
    "丑",
    "寅",
    "卯",
    "辰",
    "巳",
    "午",
    "未",
    "申",
    "酉",
    "戌",
    "亥",
    "자",
    "축",
    "인",
    "묘",
    "진",
    "사",
    "오",
    "미",
    "신",
    "유",
    "술",
    "해",
}


class ReceiveProfileRequest(BaseModel):
    share_code: str


class ReceivedProfileResponse(BaseModel):
    id: str
    sharer_name: Optional[str] = None
    birth_date: str
    hour_branch: str
    calendar_type: str
    gender: str
    persona: str
    source_profile_id: Optional[str] = None
    analysis_data: Optional[dict[str, Any]] = None
    created_at: str


def _normalize_iso(value: str) -> str:
    if value.endswith("Z"):
        return value[:-1] + "+00:00"
    return value


def _is_expired(expires_at_raw: Optional[str]) -> bool:
    if not expires_at_raw:
        return False
    expires_at = datetime.fromisoformat(_normalize_iso(expires_at_raw))
    return datetime.now(timezone.utc) > expires_at


def _extract_hour_branch(birth_input: dict[str, Any]) -> str:
    birth_jiji = str(
        birth_input.get("birth_jiji") or birth_input.get("hour_branch") or ""
    ).strip()
    if birth_jiji and birth_jiji in _VALID_BRANCHES:
        return birth_jiji

    birth_time = str(birth_input.get("birth_time") or "").strip()
    if not birth_time:
        raise HTTPException(
            status_code=400, detail="공유 데이터에 출생 시간이 없습니다"
        )

    hour_text = birth_time.split(":", 1)[0].strip()
    if not hour_text.isdigit():
        raise HTTPException(
            status_code=400, detail="공유 데이터의 출생 시간이 올바르지 않습니다"
        )

    hour = int(hour_text)
    if hour < 0 or hour > 23:
        raise HTTPException(
            status_code=400, detail="공유 데이터의 출생 시간이 올바르지 않습니다"
        )

    return _HOUR_TO_BRANCH[hour]


def _decrypt_shared_profile_field(
    profile_row: dict[str, Any], column: str, key_id: str
) -> str:
    iv = str(profile_row.get(f"{column}_iv") or "")
    ciphertext = str(profile_row.get(f"{column}_ct") or "")
    tag = str(profile_row.get(f"{column}_tag") or "")

    try:
        return crypto_manager.decrypt_field(
            "saju_profiles", column, iv, ciphertext, tag, key_id
        )
    except InvalidTag:
        logger.warning(
            "[RECEIVED_PROFILE] decrypt_field fallback for saju_profiles.%s (AAD 없이 폴백, key_id=%s)",
            column,
            key_id,
        )
        return crypto_manager.decrypt(iv, ciphertext, tag, key_id=key_id)


async def _resolve_share_payload(share_code: str) -> dict[str, Any]:
    code_result = await db_execute(
        lambda: (
            supabase.table("profile_share_codes")
            .select("profile_id")
            .eq("code", share_code)
            .limit(1)
            .execute()
        )
    )
    code_rows = code_result.data if isinstance(code_result.data, list) else []
    code_row = code_rows[0] if code_rows else None

    if isinstance(code_row, dict):
        source_profile_id = str(code_row.get("profile_id") or "").strip()
        if not source_profile_id:
            raise HTTPException(
                status_code=400, detail="공유 코드 데이터가 올바르지 않습니다"
            )

        await _consume_share_code(share_code)

        snapshot_result = await db_execute(
            lambda: (
                supabase.table("shared_saju")
                .select("user_id, sharer_name, birth_input, reading_data, expires_at")
                .eq("share_code", share_code)
                .limit(1)
                .execute()
            )
        )
        snapshot_rows = (
            snapshot_result.data if isinstance(snapshot_result.data, list) else []
        )
        snapshot_row = snapshot_rows[0] if snapshot_rows else None
        if isinstance(snapshot_row, dict):
            expires_at_raw = snapshot_row.get("expires_at")
            if _is_expired(str(expires_at_raw) if expires_at_raw else None):
                raise HTTPException(status_code=410, detail="만료된 공유 코드입니다")

            birth_input_raw = snapshot_row.get("birth_input")
            reading_data_raw = snapshot_row.get("reading_data")
            birth_input = birth_input_raw if isinstance(birth_input_raw, dict) else {}
            analysis_data = (
                reading_data_raw if isinstance(reading_data_raw, dict) else None
            )
            return {
                "birth_input": birth_input,
                "sharer_name": str(snapshot_row.get("sharer_name") or "").strip()
                or None,
                "sharer_user_id": str(snapshot_row.get("user_id") or "").strip()
                or None,
                "source_profile_id": source_profile_id,
                "analysis_data": analysis_data,
            }

        try:
            snapshot = await _get_profile_share_snapshot(source_profile_id)
            birth_input_raw = snapshot.get("birth_input")
            reading_data_raw = snapshot.get("reading_data")
            birth_input = birth_input_raw if isinstance(birth_input_raw, dict) else {}
            analysis_data = (
                reading_data_raw if isinstance(reading_data_raw, dict) else None
            )
            return {
                "birth_input": birth_input,
                "sharer_name": str(snapshot.get("sharer_name") or "").strip() or None,
                "sharer_user_id": None,
                "source_profile_id": source_profile_id,
                "analysis_data": analysis_data,
            }
        except HTTPException as e:
            logger.warning(
                "[RECEIVED_PROFILE] snapshot restore failed for source_profile_id=%s: %s",
                source_profile_id,
                e.detail,
            )

        profile_result = await db_execute(
            lambda: (
                supabase.table("saju_profiles")
                .select("*")
                .eq("id", source_profile_id)
                .limit(1)
                .execute()
            )
        )
        profile_rows = (
            profile_result.data if isinstance(profile_result.data, list) else []
        )
        profile_row = profile_rows[0] if profile_rows else None
        if not isinstance(profile_row, dict):
            raise HTTPException(
                status_code=404, detail="공유된 프로필을 찾을 수 없습니다"
            )

        key_id = str(profile_row.get("key_id") or "v1")
        birth_date = _decrypt_shared_profile_field(profile_row, "birth_date", key_id)
        hour_branch = _decrypt_shared_profile_field(profile_row, "hour_branch", key_id)
        calendar_type = _decrypt_shared_profile_field(
            profile_row, "calendar_type", key_id
        )
        gender = _decrypt_shared_profile_field(profile_row, "gender", key_id)

        return {
            "birth_input": {
                "birth_solar": birth_date,
                "birth_jiji": hour_branch,
                "calendar_type": calendar_type,
                "gender": gender,
                "persona": str(profile_row.get("persona") or "classic"),
            },
            "sharer_name": str(profile_row.get("label") or "").strip() or None,
            "sharer_user_id": str(profile_row.get("user_id") or "").strip() or None,
            "source_profile_id": source_profile_id,
            "analysis_data": None,
        }

    snapshot_result = await db_execute(
        lambda: (
            supabase.table("shared_saju")
            .select(
                "share_code, user_id, sharer_name, birth_input, reading_data, expires_at"
            )
            .eq("share_code", share_code)
            .limit(1)
            .execute()
        )
    )
    snapshot_rows = (
        snapshot_result.data if isinstance(snapshot_result.data, list) else []
    )
    snapshot_row = snapshot_rows[0] if snapshot_rows else None

    if isinstance(snapshot_row, dict):
        expires_at_raw = snapshot_row.get("expires_at")
        if _is_expired(str(expires_at_raw) if expires_at_raw else None):
            raise HTTPException(status_code=410, detail="만료된 공유 코드입니다")

        birth_input_raw = snapshot_row.get("birth_input")
        reading_data_raw = snapshot_row.get("reading_data")
        birth_input = birth_input_raw if isinstance(birth_input_raw, dict) else {}
        analysis_data = reading_data_raw if isinstance(reading_data_raw, dict) else None
        return {
            "birth_input": birth_input,
            "sharer_name": str(snapshot_row.get("sharer_name") or "").strip() or None,
            "sharer_user_id": str(snapshot_row.get("user_id") or "").strip() or None,
            "source_profile_id": None,
            "analysis_data": analysis_data,
        }

    raise HTTPException(status_code=404, detail="공유 코드를 찾을 수 없습니다")


async def _recover_analysis_data(
    source_profile_id: Optional[str], source_share_code: Optional[str]
) -> Optional[dict[str, Any]]:
    if source_share_code:
        try:
            snapshot_result = await db_execute(
                lambda: (
                    supabase.table("shared_saju")
                    .select("reading_data")
                    .eq("share_code", source_share_code)
                    .limit(1)
                    .execute()
                )
            )
            snapshot_rows = (
                snapshot_result.data if isinstance(snapshot_result.data, list) else []
            )
            snapshot_row = snapshot_rows[0] if snapshot_rows else None
            if isinstance(snapshot_row, dict):
                reading_data = snapshot_row.get("reading_data")
                if isinstance(reading_data, dict):
                    return reading_data
        except Exception as e:
            logger.warning(
                "[RECEIVED_PROFILE] analysis restore failed from source_share_code=%s: %s",
                source_share_code,
                e,
            )

    if source_profile_id:
        try:
            snapshot = await _get_profile_share_snapshot(source_profile_id)
            reading_data = snapshot.get("reading_data")
            if isinstance(reading_data, dict):
                return reading_data
        except Exception as e:
            logger.warning(
                "[RECEIVED_PROFILE] analysis restore failed from source_profile_id=%s: %s",
                source_profile_id,
                e,
            )

    return None


async def _get_shared_analysis_map(share_codes: list[str]) -> dict[str, dict[str, Any]]:
    normalized_codes = [
        code.strip() for code in share_codes if isinstance(code, str) and code.strip()
    ]
    if not normalized_codes:
        return {}

    try:
        result = await db_execute(
            lambda: (
                supabase.table("shared_saju")
                .select("share_code, reading_data")
                .in_("share_code", normalized_codes)
                .execute()
            )
        )
    except Exception as e:
        logger.warning("[RECEIVED_PROFILE] shared_saju batch lookup failed: %s", e)
        return {}

    rows = result.data if isinstance(result.data, list) else []
    output: dict[str, dict[str, Any]] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        code = str(row.get("share_code") or "").strip()
        reading_data = row.get("reading_data")
        if code and isinstance(reading_data, dict):
            output[code] = reading_data
    return output


@router.post("", response_model=ReceivedProfileResponse)
async def receive_profile(
    request: ReceiveProfileRequest,
    user_id: str = Depends(get_current_user_id),
):
    try:
        if not crypto_manager.aesgcm:
            raise HTTPException(status_code=500, detail="Server Encryption Error")

        share_code = request.share_code.strip().upper()
        if not share_code:
            raise HTTPException(status_code=400, detail="공유 코드를 입력해주세요")

        payload = await _resolve_share_payload(share_code)
        birth_input = payload.get("birth_input") if isinstance(payload, dict) else {}
        birth_input = birth_input if isinstance(birth_input, dict) else {}

        birth_date = str(
            birth_input.get("birth_solar") or birth_input.get("birth_date") or ""
        ).strip()
        hour_branch = _extract_hour_branch(birth_input)
        calendar_type = str(birth_input.get("calendar_type") or "solar").strip()
        gender = str(birth_input.get("gender") or "male").strip()
        persona = str(birth_input.get("persona") or "classic").strip() or "classic"
        sharer_name = payload.get("sharer_name") if isinstance(payload, dict) else None
        sharer_user_id = (
            payload.get("sharer_user_id") if isinstance(payload, dict) else None
        )
        source_profile_id = (
            payload.get("source_profile_id") if isinstance(payload, dict) else None
        )
        analysis_data = (
            payload.get("analysis_data") if isinstance(payload, dict) else None
        )

        if not birth_date:
            raise HTTPException(
                status_code=400, detail="공유 데이터에 생년월일이 없습니다"
            )

        enc_birth = crypto_manager.encrypt(birth_date)
        enc_hour = crypto_manager.encrypt(hour_branch)
        enc_calendar = crypto_manager.encrypt(calendar_type)
        enc_gender = crypto_manager.encrypt(gender)

        insert_data = {
            "receiver_user_id": user_id,
            "sharer_user_id": sharer_user_id,
            "sharer_name": sharer_name,
            "birth_date_ct": enc_birth["ciphertext"],
            "birth_date_iv": enc_birth["iv"],
            "birth_date_tag": enc_birth["tag"],
            "hour_branch_ct": enc_hour["ciphertext"],
            "hour_branch_iv": enc_hour["iv"],
            "hour_branch_tag": enc_hour["tag"],
            "calendar_type_ct": enc_calendar["ciphertext"],
            "calendar_type_iv": enc_calendar["iv"],
            "calendar_type_tag": enc_calendar["tag"],
            "gender_ct": enc_gender["ciphertext"],
            "gender_iv": enc_gender["iv"],
            "gender_tag": enc_gender["tag"],
            "key_id": CURRENT_KEY_VERSION,
            "persona": persona,
            "source_share_code": share_code,
            "source_profile_id": source_profile_id,
        }

        result = await db_execute(
            lambda: supabase.table("received_profiles").insert(insert_data).execute()
        )
        rows = result.data if isinstance(result.data, list) else []
        row = rows[0] if rows and isinstance(rows[0], dict) else {}

        if not row.get("id"):
            raise HTTPException(
                status_code=500, detail="받은 프로필 저장에 실패했습니다"
            )

        return ReceivedProfileResponse(
            id=str(row.get("id")),
            sharer_name=str(row.get("sharer_name")) if row.get("sharer_name") else None,
            birth_date=birth_date,
            hour_branch=hour_branch,
            calendar_type=calendar_type,
            gender=gender,
            persona=str(row.get("persona") or persona),
            source_profile_id=source_profile_id
            if isinstance(source_profile_id, str)
            else None,
            analysis_data=analysis_data if isinstance(analysis_data, dict) else None,
            created_at=str(row.get("created_at") or ""),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("[RECEIVED_PROFILE] receive failed: %s", e)
        raise HTTPException(
            status_code=500, detail="받은 프로필 저장 중 오류가 발생했습니다"
        )


@router.get("", response_model=list[ReceivedProfileResponse])
async def list_received_profiles(
    user_id: str = Depends(get_current_user_id),
):
    try:
        result = await db_execute(
            lambda: (
                supabase.table("received_profiles")
                .select("*")
                .eq("receiver_user_id", user_id)
                .order("created_at", desc=True)
                .execute()
            )
        )

        rows = result.data if isinstance(result.data, list) else []
        share_codes = [
            str(row.get("source_share_code") or "").strip()
            for row in rows
            if isinstance(row, dict) and row.get("source_share_code")
        ]
        shared_analysis_map = await _get_shared_analysis_map(share_codes)
        fallback_analysis_cache: dict[str, Optional[dict[str, Any]]] = {}
        output: list[ReceivedProfileResponse] = []

        for row in rows:
            if not isinstance(row, dict):
                continue
            try:
                key_id = str(row.get("key_id") or "v1")
                birth_date = crypto_manager.decrypt(
                    str(row.get("birth_date_iv") or ""),
                    str(row.get("birth_date_ct") or ""),
                    str(row.get("birth_date_tag") or ""),
                    key_id=key_id,
                )
                hour_branch = crypto_manager.decrypt(
                    str(row.get("hour_branch_iv") or ""),
                    str(row.get("hour_branch_ct") or ""),
                    str(row.get("hour_branch_tag") or ""),
                    key_id=key_id,
                )
                calendar_type = crypto_manager.decrypt(
                    str(row.get("calendar_type_iv") or ""),
                    str(row.get("calendar_type_ct") or ""),
                    str(row.get("calendar_type_tag") or ""),
                    key_id=key_id,
                )
                gender = crypto_manager.decrypt(
                    str(row.get("gender_iv") or ""),
                    str(row.get("gender_ct") or ""),
                    str(row.get("gender_tag") or ""),
                    key_id=key_id,
                )
                source_profile_id = (
                    str(row.get("source_profile_id"))
                    if row.get("source_profile_id")
                    else None
                )
                source_share_code = (
                    str(row.get("source_share_code"))
                    if row.get("source_share_code")
                    else None
                )

                analysis_data = (
                    shared_analysis_map.get(source_share_code)
                    if isinstance(source_share_code, str)
                    else None
                )

                if analysis_data is None:
                    fallback_key = source_share_code or source_profile_id
                    if fallback_key in fallback_analysis_cache:
                        analysis_data = fallback_analysis_cache[fallback_key]
                    else:
                        analysis_data = await _recover_analysis_data(
                            source_profile_id,
                            source_share_code,
                        )
                        if fallback_key:
                            fallback_analysis_cache[fallback_key] = analysis_data

                output.append(
                    ReceivedProfileResponse(
                        id=str(row.get("id")),
                        sharer_name=str(row.get("sharer_name"))
                        if row.get("sharer_name")
                        else None,
                        birth_date=birth_date,
                        hour_branch=hour_branch,
                        calendar_type=calendar_type,
                        gender=gender,
                        persona=str(row.get("persona") or "classic"),
                        source_profile_id=source_profile_id,
                        analysis_data=analysis_data,
                        created_at=str(row.get("created_at") or ""),
                    )
                )
            except Exception as e:
                logger.exception(
                    "[RECEIVED_PROFILE] decrypt failed for received_profile=%s: %s",
                    row.get("id"),
                    e,
                )
                continue

        return output
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("[RECEIVED_PROFILE] list failed: %s", e)
        raise HTTPException(
            status_code=500,
            detail="받은 프로필 목록 조회 중 오류가 발생했습니다",
        )


@router.delete("/{received_profile_id}")
async def delete_received_profile(
    received_profile_id: str,
    user_id: str = Depends(get_current_user_id),
):
    try:
        result = await db_execute(
            lambda: (
                supabase.table("received_profiles")
                .select("id, receiver_user_id")
                .eq("id", received_profile_id)
                .limit(1)
                .execute()
            )
        )
        rows = result.data if isinstance(result.data, list) else []
        row = rows[0] if rows and isinstance(rows[0], dict) else None
        if not row:
            raise HTTPException(
                status_code=404, detail="받은 프로필을 찾을 수 없습니다"
            )

        owner_user_id = str(row.get("receiver_user_id") or "")
        if owner_user_id != user_id:
            raise HTTPException(status_code=403, detail="삭제 권한이 없습니다")

        await db_execute(
            lambda: (
                supabase.table("received_profiles")
                .delete()
                .eq("id", received_profile_id)
                .eq("receiver_user_id", user_id)
                .execute()
            )
        )
        return {"status": "deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("[RECEIVED_PROFILE] delete failed: %s", e)
        raise HTTPException(
            status_code=500, detail="받은 프로필 삭제 중 오류가 발생했습니다"
        )
