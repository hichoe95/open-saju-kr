import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..db.supabase_client import supabase
from .deps import get_current_user_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/consents", tags=["consents"])

CONSENT_TYPES = {
    "TERMS_OF_SERVICE": "서비스 이용약관",
    "PRIVACY_POLICY": "개인정보 처리방침",
    "CROSS_BORDER_TRANSFER": "개인정보 국외이전 동의",
    "MARKETING": "마케팅 수신 동의",
}

# PIPA §28의8: 국외이전 동의 시 고지할 법정 필수사항
CROSS_BORDER_TRANSFER_DETAILS = {
    "recipients": [
        {"name": "OpenAI, Inc.", "country": "미국", "purpose": "AI 기반 사주 분석"},
        {"name": "Google LLC", "country": "미국", "purpose": "AI 기반 사주 분석"},
        {"name": "Anthropic, PBC", "country": "미국", "purpose": "AI 기반 사주 분석"},
    ],
    "data_items": "생년월일시, 성별, 상담 내용",
    "retention_period": "분석 완료 즉시 삭제 (LLM 서버에 보관하지 않음)",
    "method": "암호화된 API 통신 (HTTPS/TLS 1.2+)",
}


class ConsentGrantRequest(BaseModel):
    consent_type: str = Field(..., description="동의 유형 (TERMS_OF_SERVICE, PRIVACY_POLICY, CROSS_BORDER_TRANSFER, MARKETING)")
    version: str = Field(..., description="약관 버전")
    is_granted: bool = Field(..., description="동의 여부")


@router.post("/grant")
async def grant_consent(
    req: ConsentGrantRequest,
    user_id: str = Depends(get_current_user_id)
):
    try:
        result = supabase.table("user_consents").insert({
            "user_id": user_id,
            "consent_type": req.consent_type,
            "version": req.version,
            "is_granted": req.is_granted
        }).execute()
        
        # PRIV-DATA-3: 동의 철회 시 사용자 데이터 정리
        if not req.is_granted:
            try:
                supabase.table("user_readings").delete().eq("user_id", user_id).execute()
                logger.info(f"[CONSENT] User data cleaned on withdrawal: user_id={user_id}, type={req.consent_type}")
            except Exception as cleanup_err:
                logger.error(f"[CONSENT] Data cleanup failed: user_id={user_id}, error={cleanup_err}")
        
        if result.data and len(result.data) > 0:
            return {"status": "success", "id": result.data[0].get("id")}
        return {"status": "success"}
    except Exception as e:
        logger.exception(f"[CONSENT] Failed to save consent: user_id={user_id}")
        raise HTTPException(status_code=500, detail="동의 정보 저장에 실패했습니다")


@router.get("/status")
async def get_consent_status(
    consent_type: str,
    user_id: str = Depends(get_current_user_id)
):
    try:
        result = supabase.table("user_consents").select("*").eq(
            "user_id", user_id
        ).eq(
            "consent_type", consent_type
        ).order(
            "granted_at", desc=True
        ).limit(1).execute()
        
        if result.data and len(result.data) > 0:
            consent = result.data[0]
            if consent.get("is_granted"):
                return {"granted": True, "version": consent.get("version")}
        
        return {"granted": False}
    except Exception as e:
        logger.exception(f"[CONSENT] Failed to check consent: user_id={user_id}")
        raise HTTPException(status_code=500, detail="동의 상태 확인에 실패했습니다")
