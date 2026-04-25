import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..api.deps import get_current_user_id, rate_limit_dependency
from ..db.supabase_client import db_execute, supabase
from ..services.config_service import config_service
from ..services.image_service import SajuImageService, get_image_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/image", tags=["image"])

SAJU_IMAGE_PRICE = 50
VALID_STYLES = set(SajuImageService.STYLE_PROMPTS.keys())


class GenerateImageRequest(BaseModel):
    one_liner: str
    character_summary: str
    tags: List[str] = Field(default_factory=list)
    gender: str = "male"
    style: str = "ink_wash"


class GenerateImageResponse(BaseModel):
    success: bool
    image_base64: Optional[str] = None
    image_prompt: Optional[str] = None
    transaction_id: Optional[str] = None
    balance: int = 0


@router.post("/generate", response_model=GenerateImageResponse)
async def generate_paid_saju_image(
    request: GenerateImageRequest,
    user_id: str = Depends(get_current_user_id),
    _rate_limit: None = Depends(rate_limit_dependency(5, scope="image_generate")),
):
    image_price = await config_service.get_feature_price("saju_image", SAJU_IMAGE_PRICE)

    if request.style not in VALID_STYLES:
        raise HTTPException(
            status_code=400,
            detail=f"유효하지 않은 스타일입니다. 허용: {', '.join(sorted(VALID_STYLES))}",
        )

    transaction_id = None
    new_balance = 0
    try:
        result = await db_execute(
            lambda: supabase.rpc(
                "debit_coins_v2",
                {
                    "p_user_id": user_id,
                    "p_amount": image_price,
                    "p_description": "사주 이미지 생성",
                    "p_reference_type": "saju_image",
                    "p_reference_id": None,
                },
            ).execute()
        )

        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=500, detail="코인 차감 처리 실패")

        row = result.data[0]
        if row.get("error_message"):
            error_msg = row["error_message"]
            if "INSUFFICIENT_BALANCE" in str(error_msg):
                wallet_res = await db_execute(
                    lambda: (
                        supabase.table("user_wallets")
                        .select("balance")
                        .eq("user_id", user_id)
                        .execute()
                    )
                )
                current_balance = (
                    wallet_res.data[0]["balance"] if wallet_res.data else 0
                )
                raise HTTPException(
                    status_code=400,
                    detail=f"엽전이 부족합니다. (필요: {image_price}, 보유: {current_balance})",
                )
            if "WALLET_NOT_FOUND" in str(error_msg):
                raise HTTPException(
                    status_code=400, detail="지갑이 없습니다. 먼저 충전해주세요."
                )
            raise HTTPException(status_code=400, detail=error_msg)

        transaction_id = (
            str(row.get("transaction_id")) if row.get("transaction_id") else None
        )
        new_balance = row.get("new_balance", 0)
        logger.info("[IMAGE] Coins debited: user=%s, tx=%s", user_id, transaction_id)

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("[IMAGE] Debit failed: %s", e)
        raise HTTPException(status_code=500, detail="코인 차감 중 오류가 발생했습니다")

    async def _refund(reason: str) -> bool:
        if not transaction_id:
            return False
        try:
            refund_result = await db_execute(
                lambda: supabase.rpc(
                    "refund_coins",
                    {
                        "p_user_id": user_id,
                        "p_amount": image_price,
                        "p_original_tx_id": transaction_id,
                        "p_reason": reason,
                    },
                ).execute()
            )
            logger.info(
                "[IMAGE] Refunded: user=%s, tx=%s, reason=%s",
                user_id,
                transaction_id,
                reason,
            )
            return bool(refund_result.data)
        except Exception as refund_err:
            logger.exception("[IMAGE] Refund failed: %s", refund_err)
        return False

    try:
        image_service = get_image_service()
        image_result = await image_service.create_saju_image(
            one_liner=request.one_liner,
            character_summary=request.character_summary,
            tags=request.tags,
            gender=request.gender,
            style=request.style,
        )

        image_base64 = image_result.get("image_base64")
        image_prompt = image_result.get("image_prompt")

        if not image_base64:
            refund_success = await _refund("이미지 생성 실패")
            detail = (
                "이미지 생성에 실패했습니다. 엽전이 환불되었습니다."
                if refund_success
                else "이미지 생성에 실패했습니다. 환불 처리 중 문제가 발생했습니다. 고객센터에 문의해주세요."
            )
            raise HTTPException(
                status_code=500,
                detail=detail,
            )

        return GenerateImageResponse(
            success=True,
            image_base64=image_base64,
            image_prompt=image_prompt,
            transaction_id=transaction_id,
            balance=new_balance,
        )

    except HTTPException:
        raise
    except Exception as e:
        refund_success = await _refund(f"이미지 생성 오류: {str(e)[:100]}")
        logger.exception("[IMAGE] Generation failed: %s", e)
        detail = (
            "이미지 생성 중 오류가 발생했습니다. 엽전이 환불되었습니다."
            if refund_success
            else "이미지 생성 중 오류가 발생했습니다. 환불 처리 중 문제가 발생했습니다. 고객센터에 문의해주세요."
        )
        raise HTTPException(
            status_code=500,
            detail=detail,
        )
