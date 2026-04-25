import json
import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from ..db.supabase_client import supabase
from ..core.security import crypto_manager, CURRENT_KEY_VERSION
from .deps import get_current_user_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/compatibility", tags=["compatibility"])


class PersonInfo(BaseModel):
    name: str
    birth_date: str
    hour_branch: str
    gender: str


class CompatibilitySaveRequest(BaseModel):
    user_a: PersonInfo
    user_b: PersonInfo
    compatibility_data: dict
    scenario: str = "lover"


class CompatibilityHistoryItem(BaseModel):
    id: str
    label: str
    scenario: str
    created_at: str


class CompatibilityDetailResponse(BaseModel):
    id: str
    user_a: PersonInfo
    user_b: PersonInfo
    compatibility_data: dict
    scenario: str
    created_at: str


@router.post("/save")
async def save_compatibility_result(
    input_data: CompatibilitySaveRequest,
    user_id: str = Depends(get_current_user_id)
):
    if not crypto_manager.aesgcm:
        raise HTTPException(status_code=500, detail="Server Encryption Error")

    try:
        count_result = supabase.table("user_compatibility_results").select(
            "id", count="exact"
        ).eq(
            "user_id", user_id
        ).execute()
        if (count_result.count or 0) >= 10:
            raise HTTPException(status_code=400, detail="Compatibility history limit exceeded")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("[COMPAT] Failed to check history limit")
        raise HTTPException(status_code=500, detail="히스토리 확인에 실패했습니다")

    if input_data.scenario == "lover":
        label = f"{input_data.user_a.name} & {input_data.user_b.name}"
    else:
        label = f"{input_data.user_a.name} & {input_data.user_b.name}"

    enc_user_a = crypto_manager.encrypt(json.dumps(input_data.user_a.model_dump()))
    enc_user_b = crypto_manager.encrypt(json.dumps(input_data.user_b.model_dump()))
    enc_data = crypto_manager.encrypt(json.dumps(input_data.compatibility_data))

    try:
        insert_data = {
            "user_id": user_id,
            "label": label,
            "scenario": input_data.scenario,
            "key_id": CURRENT_KEY_VERSION,
            "user_a_ct": enc_user_a["ciphertext"],
            "user_a_iv": enc_user_a["iv"],
            "user_a_tag": enc_user_a["tag"],
            "user_b_ct": enc_user_b["ciphertext"],
            "user_b_iv": enc_user_b["iv"],
            "user_b_tag": enc_user_b["tag"],
            "data_ct": enc_data["ciphertext"],
            "data_iv": enc_data["iv"],
            "data_tag": enc_data["tag"],
        }
        result = supabase.table("user_compatibility_results").insert(insert_data).execute()
        if result.data and len(result.data) > 0:
            return {"id": result.data[0].get("id"), "status": "saved"}
        return {"status": "saved"}
    except Exception as e:
        logger.exception("[COMPAT] Failed to save compatibility result")
        raise HTTPException(status_code=500, detail="궁합 결과 저장에 실패했습니다")


@router.get("/history", response_model=List[CompatibilityHistoryItem])
async def get_compatibility_history(
    user_id: str = Depends(get_current_user_id)
):
    try:
        result = supabase.table("user_compatibility_results").select(
            "id, label, scenario, created_at"
        ).eq(
            "user_id", user_id
        ).order(
            "created_at", desc=True
        ).execute()

        if not result.data:
            return []

        return [
            CompatibilityHistoryItem(
                id=str(item.get("id")),
                label=item.get("label", ""),
                scenario=item.get("scenario", ""),
                created_at=str(item.get("created_at", ""))
            )
            for item in result.data
        ]
    except Exception as e:
        logger.exception("[COMPAT] Failed to get compatibility history")
        raise HTTPException(status_code=500, detail="궁합 히스토리 조회에 실패했습니다")


@router.get("/{result_id}", response_model=CompatibilityDetailResponse)
async def get_compatibility_result(
    result_id: str,
    user_id: str = Depends(get_current_user_id)
):
    if not crypto_manager.aesgcm:
        raise HTTPException(status_code=500, detail="Server Encryption Error")

    try:
        result = supabase.table("user_compatibility_results").select("*").eq(
            "id", result_id
        ).eq(
            "user_id", user_id
        ).limit(1).execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Compatibility result not found")

        item = result.data[0]
        key_id = item.get("key_id") or "v1"

        user_a = json.loads(crypto_manager.decrypt(
            item.get("user_a_iv"),
            item.get("user_a_ct"),
            item.get("user_a_tag"),
            key_id=key_id,
        ))
        user_b = json.loads(crypto_manager.decrypt(
            item.get("user_b_iv"),
            item.get("user_b_ct"),
            item.get("user_b_tag"),
            key_id=key_id,
        ))
        data = json.loads(crypto_manager.decrypt(
            item.get("data_iv"),
            item.get("data_ct"),
            item.get("data_tag"),
            key_id=key_id,
        ))

        return CompatibilityDetailResponse(
            id=str(item.get("id")),
            user_a=PersonInfo(**user_a),
            user_b=PersonInfo(**user_b),
            compatibility_data=data,
            scenario=item.get("scenario", ""),
            created_at=str(item.get("created_at", ""))
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("[COMPAT] Failed to get compatibility result")
        raise HTTPException(status_code=500, detail="궁합 결과 조회에 실패했습니다")


@router.delete("/{result_id}")
async def delete_compatibility_result(
    result_id: str,
    user_id: str = Depends(get_current_user_id)
):
    try:
        supabase.table("user_compatibility_results").delete().eq(
            "id", result_id
        ).eq(
            "user_id", user_id
        ).execute()
        return {"status": "deleted"}
    except Exception as e:
        logger.exception("[COMPAT] Failed to delete compatibility result")
        raise HTTPException(status_code=500, detail="궁합 결과 삭제에 실패했습니다")
