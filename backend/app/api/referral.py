import logging
import secrets
import string
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ..db.supabase_client import db_execute, supabase
from ..schemas.referral import (
    ReferralCreateResponse,
    ReferralRedeemRequest,
    ReferralRedemption,
    ReferralStatusResponse,
)
from ..config import get_settings
from .deps import get_current_user_required, rate_limit_dependency

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/referrals", tags=["referrals"])

REFERRAL_CODE_CHARS = string.ascii_uppercase + string.digits
REFERRAL_CODE_LENGTH = 8
REFERRAL_REWARD_AMOUNT = 20


def _as_rows(data: Any) -> list[dict[str, Any]]:
    if not isinstance(data, list):
        return []
    return [row for row in data if isinstance(row, dict)]


def _is_unique_violation(error: Exception) -> bool:
    message = str(error).lower()
    return "duplicate key" in message or "unique" in message


def _generate_referral_code() -> str:
    return "".join(
        secrets.choice(REFERRAL_CODE_CHARS) for _ in range(REFERRAL_CODE_LENGTH)
    )


def _share_url(referral_code: str) -> str:
    return f"{get_settings().frontend_url.rstrip('/')}/?ref={referral_code}"


async def _get_active_referral_link_by_user(user_id: str) -> dict[str, Any] | None:
    result = await db_execute(
        lambda: (
            supabase.table("referral_links")
            .select("id, referrer_user_id, referral_code, created_at, is_active")
            .eq("referrer_user_id", user_id)
            .eq("is_active", True)
            .limit(1)
            .execute()
        )
    )
    rows = _as_rows(result.data)
    return rows[0] if rows else None


async def _get_active_referral_link_by_code(
    referral_code: str,
) -> dict[str, Any] | None:
    result = await db_execute(
        lambda: (
            supabase.table("referral_links")
            .select("id, referrer_user_id, referral_code, created_at, is_active")
            .eq("referral_code", referral_code)
            .eq("is_active", True)
            .limit(1)
            .execute()
        )
    )
    rows = _as_rows(result.data)
    return rows[0] if rows else None


async def process_referral_reward(
    referral_code: str, referred_user_id: str
) -> dict[str, Any]:
    normalized_code = (referral_code or "").strip().upper()
    if not normalized_code:
        raise HTTPException(status_code=400, detail="리퍼럴 코드가 필요합니다")

    link = await _get_active_referral_link_by_code(normalized_code)
    if not link:
        raise HTTPException(status_code=404, detail="유효하지 않은 리퍼럴 코드입니다")

    referrer_user_id = str(link.get("referrer_user_id") or "")
    referral_link_id = str(link.get("id") or "")
    if not referrer_user_id or not referral_link_id:
        raise HTTPException(
            status_code=500, detail="리퍼럴 처리 중 오류가 발생했습니다"
        )

    if referrer_user_id == referred_user_id:
        raise HTTPException(status_code=400, detail="본인 리퍼럴은 허용되지 않습니다")

    pending_redemption = {
        "referral_link_id": referral_link_id,
        "referred_user_id": referred_user_id,
        "referrer_user_id": referrer_user_id,
        "status": "pending",
        "reward_amount": REFERRAL_REWARD_AMOUNT,
    }

    try:
        await db_execute(
            lambda: (
                supabase.table("referral_redemptions")
                .insert(pending_redemption)
                .execute()
            )
        )
    except Exception as e:
        if _is_unique_violation(e):
            raise HTTPException(
                status_code=409, detail="이미 리퍼럴 보상이 처리된 사용자입니다"
            )
        logger.exception("[REFERRAL REDEEM] redemption insert failed: %s", e)
        raise HTTPException(
            status_code=500, detail="리퍼럴 처리 중 오류가 발생했습니다"
        )

    try:
        rpc_result = await db_execute(
            lambda: supabase.rpc(
                "grant_bonus_coins",
                {
                    "p_user_id": referrer_user_id,
                    "p_amount": REFERRAL_REWARD_AMOUNT,
                    "p_description": "리퍼럴 보너스 - 친구 가입 완료",
                    "p_reference_type": "referral_bonus",
                },
            ).execute()
        )
        rpc_rows = _as_rows(rpc_result.data)
        transaction_id = str(rpc_rows[0].get("transaction_id")) if rpc_rows else None

        await db_execute(
            lambda: (
                supabase.table("referral_redemptions")
                .update(
                    {
                        "status": "completed",
                        "reward_transaction_id": transaction_id,
                        "completed_at": datetime.now(timezone.utc).isoformat(),
                    }
                )
                .eq("referred_user_id", referred_user_id)
                .execute()
            )
        )

        return {
            "success": True,
            "referral_link_id": referral_link_id,
            "referrer_user_id": referrer_user_id,
            "referred_user_id": referred_user_id,
            "reward_amount": REFERRAL_REWARD_AMOUNT,
            "reward_transaction_id": transaction_id,
        }
    except Exception as e:
        logger.exception("[REFERRAL REDEEM] reward grant failed: %s", e)
        try:
            await db_execute(
                lambda: (
                    supabase.table("referral_redemptions")
                    .update(
                        {
                            "status": "failed",
                            "completed_at": datetime.now(timezone.utc).isoformat(),
                        }
                    )
                    .eq("referred_user_id", referred_user_id)
                    .execute()
                )
            )
        except Exception:
            logger.exception(
                "[REFERRAL REDEEM] failed status update failed for user_id=%s",
                referred_user_id,
            )
        return {
            "success": False,
            "referral_link_id": referral_link_id,
            "referrer_user_id": referrer_user_id,
            "referred_user_id": referred_user_id,
            "reward_amount": REFERRAL_REWARD_AMOUNT,
            "error": "reward_grant_failed",
        }


@router.post("/create", response_model=ReferralCreateResponse)
async def create_referral_link(
    user: dict = Depends(get_current_user_required),
    _rate_limit: None = Depends(
        rate_limit_dependency(limit=10, window_seconds=60, scope="referral_create")
    ),
):
    user_id = str(user["user_id"])

    existing = await _get_active_referral_link_by_user(user_id)
    if existing:
        return ReferralCreateResponse(
            referral_code=str(existing.get("referral_code") or ""),
            share_url=_share_url(str(existing.get("referral_code") or "")),
            created_at=existing.get("created_at"),
        )

    for _ in range(10):
        code = _generate_referral_code()
        payload = {
            "referrer_user_id": user_id,
            "referral_code": code,
            "is_active": True,
        }
        try:
            result = await db_execute(
                lambda p=payload: supabase.table("referral_links").insert(p).execute()
            )
            rows = _as_rows(result.data)
            row = rows[0] if rows else payload
            return ReferralCreateResponse(
                referral_code=str(row.get("referral_code") or code),
                share_url=_share_url(code),
                created_at=row.get("created_at") or datetime.now(timezone.utc),
            )
        except Exception as e:
            if _is_unique_violation(e):
                continue
            logger.exception("[REFERRAL CREATE] create failed: %s", e)
            raise HTTPException(
                status_code=500, detail="리퍼럴 링크 생성에 실패했습니다"
            )

    raise HTTPException(status_code=500, detail="리퍼럴 코드 생성에 실패했습니다")


@router.get("/status", response_model=ReferralStatusResponse)
async def get_referral_status(
    user: dict = Depends(get_current_user_required),
    _rate_limit: None = Depends(
        rate_limit_dependency(limit=30, window_seconds=60, scope="referral_status")
    ),
):
    user_id = str(user["user_id"])
    link = await _get_active_referral_link_by_user(user_id)
    if not link:
        return ReferralStatusResponse()

    redemptions_result = await db_execute(
        lambda: (
            supabase.table("referral_redemptions")
            .select("referred_user_id, status, reward_amount, created_at, completed_at")
            .eq("referrer_user_id", user_id)
            .order("created_at", desc=True)
            .limit(20)
            .execute()
        )
    )
    redemption_rows = _as_rows(redemptions_result.data)

    total_referred = len(redemption_rows)
    completed_rows = [r for r in redemption_rows if r.get("status") == "completed"]
    total_completed = len(completed_rows)
    total_coins_earned = sum(int(r.get("reward_amount") or 0) for r in completed_rows)
    recent_redemptions = [
        ReferralRedemption(
            referred_user_id=str(r.get("referred_user_id") or ""),
            status=str(r.get("status") or "pending"),
            reward_amount=int(r.get("reward_amount") or 0),
            created_at=r.get("created_at"),
            completed_at=r.get("completed_at"),
        )
        for r in redemption_rows
    ]

    return ReferralStatusResponse(
        referral_code=str(link.get("referral_code") or ""),
        total_referred=total_referred,
        total_completed=total_completed,
        total_coins_earned=total_coins_earned,
        recent_redemptions=recent_redemptions,
    )


@router.post("/redeem")
async def redeem_referral(
    req: ReferralRedeemRequest,
    _rate_limit: None = Depends(
        rate_limit_dependency(limit=20, window_seconds=60, scope="referral_redeem")
    ),
):
    return await process_referral_reward(req.referral_code, req.user_id)
