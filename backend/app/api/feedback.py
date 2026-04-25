import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import datetime, timezone

from .auth import require_auth
from ..db.supabase_client import supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/feedback", tags=["feedback"])


class FeedbackRequest(BaseModel):
    """피드백 요청 스키마"""

    category: str = Field(..., description="피드백 종류: bug, feature, other")
    content: str = Field(
        ..., min_length=10, max_length=1000, description="피드백 내용 (10-1000자)"
    )

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        allowed = {"bug", "feature", "other", "payment", "account", "inquiry"}
        if v not in allowed:
            raise ValueError(f"category must be one of: {', '.join(allowed)}")
        return v

    @field_validator("content")
    @classmethod
    def validate_content(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 10:
            raise ValueError("피드백 내용은 최소 10자 이상이어야 합니다.")
        if len(v) > 1000:
            raise ValueError("피드백 내용은 최대 1000자까지 가능합니다.")
        return v


class FeedbackResponse(BaseModel):
    """피드백 응답 스키마"""

    status: str = "success"
    feedback_id: str
    message: str = "소중한 의견 감사합니다!"


@router.post("", response_model=FeedbackResponse)
async def submit_feedback(
    request: FeedbackRequest,
    current_user: dict = Depends(require_auth),
):
    """
    피드백 제출 (로그인 필수)

    - category: bug (버그 신고), feature (개선 제안), other (기타 의견)
    - content: 10-1000자
    """
    user_id = current_user["user_id"]

    try:
        result = (
            supabase.table("user_feedbacks")
            .insert(
                {
                    "user_id": user_id,
                    "category": request.category,
                    "content": request.content,
                    "status": "pending",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            .execute()
        )

        if not result.data:
            raise Exception("피드백 저장 실패")

        first_row = (
            result.data[0] if isinstance(result.data, list) and result.data else None
        )
        feedback_id = (
            str(first_row.get("id") or "") if isinstance(first_row, dict) else ""
        )
        if not feedback_id:
            raise Exception("피드백 ID 생성 실패")
        logger.info(
            f"[FEEDBACK] User {user_id} submitted feedback: {feedback_id} ({request.category})"
        )

        from ..services.notification_service import notifier

        notifier.notify_feedback_submitted(
            feedback_id=feedback_id,
            category=request.category,
            content=request.content,
        )

        return FeedbackResponse(
            feedback_id=feedback_id, message="소중한 의견 감사합니다!"
        )

    except Exception as e:
        logger.exception("[FEEDBACK ERROR] User %s: %s", user_id, e)
        raise HTTPException(
            status_code=500,
            detail="피드백 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
        )


class FeedbackListItem(BaseModel):
    """피드백 목록 항목"""

    id: str
    category: str
    content: str
    status: str
    created_at: str
    response: Optional[str] = None
    responded_at: Optional[str] = None
    has_unread_reply: bool = False


class FeedbackReadResponse(BaseModel):
    status: str = "success"
    marked_count: int


@router.get("/my", response_model=list[FeedbackListItem])
async def get_my_feedbacks(
    current_user: dict = Depends(require_auth),
):
    """
    내 피드백 목록 조회 (선택적 기능 - 향후 확장용)
    """
    user_id = current_user["user_id"]

    try:
        result = (
            supabase.table("user_feedbacks")
            .select(
                "id, category, content, status, created_at, response, responded_at, reply_seen_at"
            )
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(50)
            .execute()
        )

        items: list[FeedbackListItem] = []
        for row in result.data or []:
            if not isinstance(row, dict):
                continue
            response_text = row.get("response")
            has_unread_reply = bool(response_text) and not row.get("reply_seen_at")
            items.append(
                FeedbackListItem(
                    id=str(row.get("id") or ""),
                    category=str(row.get("category") or "other"),
                    content=str(row.get("content") or ""),
                    status=str(row.get("status") or "pending"),
                    created_at=str(row.get("created_at") or ""),
                    response=str(response_text) if response_text else None,
                    responded_at=str(row.get("responded_at"))
                    if row.get("responded_at")
                    else None,
                    has_unread_reply=has_unread_reply,
                )
            )

        return items

    except Exception as e:
        logger.error(f"[FEEDBACK ERROR] get_my_feedbacks failed: {e}")
        raise HTTPException(
            status_code=500, detail="피드백 목록 조회 중 오류가 발생했습니다."
        )


@router.post("/mark-replies-read", response_model=FeedbackReadResponse)
async def mark_feedback_replies_read(
    current_user: dict = Depends(require_auth),
):
    user_id = current_user["user_id"]

    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        result = (
            supabase.table("user_feedbacks")
            .update(
                {
                    "reply_seen_at": now_iso,
                    "updated_at": now_iso,
                }
            )
            .eq("user_id", user_id)
            .not_.is_("response", "null")
            .is_("reply_seen_at", "null")
            .execute()
        )

        marked_count = len(result.data or []) if isinstance(result.data, list) else 0
        return FeedbackReadResponse(marked_count=marked_count)
    except Exception as e:
        logger.error(f"[FEEDBACK ERROR] mark_feedback_replies_read failed: {e}")
        raise HTTPException(
            status_code=500, detail="답변 읽음 처리 중 오류가 발생했습니다."
        )
