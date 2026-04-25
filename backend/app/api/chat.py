import json
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, ValidationError

from ..config import get_settings
from ..schemas import (
    BirthInput,
    ChatHistoryResponse,
    ChatMessageCreate,
    ChatSendResponse,
    ChatSessionResponse,
)
from ..services.cache_service import make_birth_key
from ..services.chat_service import chat_service
from .deps import get_current_user_id, rate_limit_dependency

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatSessionCreateRequest(BaseModel):
    birth_input: BirthInput
    domain: str = Field(default="general", max_length=50)
    persona: str | None = Field(default=None, max_length=20)
    saju_context: Dict[str, Any] = Field(default_factory=dict)
    max_turns: int = Field(default=20, ge=1, le=20)


class ChatSessionCreateResponse(BaseModel):
    session_id: str
    remaining_turns: int


class ChatMessageStreamRequest(BaseModel):
    content: str = Field(..., min_length=1)
    regenerate_turn: int | None = Field(default=None, ge=1)


@router.post("/sessions", response_model=ChatSessionCreateResponse)
async def create_chat_session(
    request: ChatSessionCreateRequest,
    user_id: str = Depends(get_current_user_id),
    _rate_limit: None = Depends(
        rate_limit_dependency(get_settings().rate_limit_per_minute, scope="chat_create")
    ),
) -> ChatSessionCreateResponse:
    birth_key = make_birth_key(request.birth_input)
    persona = request.persona or (
        request.birth_input.persona.value if request.birth_input.persona else "classic"
    )
    merged_saju_context: Dict[str, Any] = {
        **request.saju_context,
        "name": request.birth_input.name,
        "birth_solar": request.birth_input.birth_solar,
        "birth_lunar": request.birth_input.birth_lunar,
        "birth_time": request.birth_input.birth_time,
        "timezone": request.birth_input.timezone,
        "birth_place": request.birth_input.birth_place,
        "calendar_type": request.birth_input.calendar_type,
        "gender": request.birth_input.gender,
        "persona": persona,
        "context_topic": (
            request.birth_input.context.topic.value
            if request.birth_input.context
            else "general"
        ),
        "context_details": (
            request.birth_input.context.details if request.birth_input.context else ""
        ),
    }

    session = await chat_service.create_session(
        user_id=user_id,
        birth_key=birth_key,
        domain=request.domain,
        persona=persona,
        saju_context=merged_saju_context,
        max_turns=request.max_turns,
    )
    return ChatSessionCreateResponse(
        session_id=session.id,
        remaining_turns=session.remaining_turns,
    )


@router.get("/sessions", response_model=List[ChatSessionResponse])
async def get_chat_sessions(
    user_id: str = Depends(get_current_user_id),
    birth_key: str | None = None,
    birth_solar: str | None = None,
    birth_date: str | None = None,
    birth_time: str | None = None,
    gender: str | None = None,
    calendar_type: str | None = None,
    persona: str | None = None,
    _rate_limit: None = Depends(
        rate_limit_dependency(get_settings().rate_limit_per_minute, scope="chat_list")
    ),
) -> List[ChatSessionResponse]:
    birth_context: Dict[str, str] | None = None
    if not birth_key:
        resolved_birth_solar = birth_solar or birth_date
        if resolved_birth_solar and birth_time and gender:
            birth_context = {
                "birth_solar": resolved_birth_solar.strip(),
                "birth_time": birth_time.strip(),
                "gender": gender.strip().lower(),
                "calendar_type": (calendar_type or "solar").strip().lower(),
            }
            birth_input_payload: Dict[str, Any] = {
                "birth_solar": resolved_birth_solar,
                "birth_time": birth_time,
                "gender": gender,
                "calendar_type": calendar_type or "solar",
            }
            if persona in {"classic", "mz", "warm", "witty"}:
                birth_input_payload["persona"] = persona

            try:
                birth_input = BirthInput(**birth_input_payload)
            except ValidationError as exc:
                raise HTTPException(
                    status_code=422, detail="출생정보 필터가 올바르지 않습니다"
                ) from exc
            birth_key = make_birth_key(birth_input)

    return await chat_service.get_sessions(
        user_id,
        limit=10,
        birth_key=birth_key,
        birth_context=birth_context,
    )


@router.get("/sessions/{session_id}", response_model=ChatHistoryResponse)
async def get_chat_session(
    session_id: str,
    user_id: str = Depends(get_current_user_id),
    _rate_limit: None = Depends(
        rate_limit_dependency(get_settings().rate_limit_per_minute, scope="chat_detail")
    ),
) -> ChatHistoryResponse:
    return await chat_service.get_session(user_id, session_id)


@router.post("/sessions/{session_id}/messages", response_model=ChatSendResponse)
async def send_chat_message(
    session_id: str,
    request: ChatMessageCreate,
    user_id: str = Depends(get_current_user_id),
    _rate_limit: None = Depends(rate_limit_dependency(120, scope="chat_send")),
) -> ChatSendResponse:
    return await chat_service.send_message(
        user_id=user_id,
        session_id=session_id,
        content=request.content,
        role=request.role,
    )


@router.post("/sessions/{session_id}/close", response_model=ChatSessionResponse)
async def close_chat_session(
    session_id: str,
    user_id: str = Depends(get_current_user_id),
    _rate_limit: None = Depends(
        rate_limit_dependency(get_settings().rate_limit_per_minute, scope="chat_close")
    ),
) -> ChatSessionResponse:
    return await chat_service.close_session(user_id, session_id)


@router.delete("/sessions/{session_id}")
async def delete_chat_session(
    session_id: str,
    user_id: str = Depends(get_current_user_id),
    _rate_limit: None = Depends(
        rate_limit_dependency(get_settings().rate_limit_per_minute, scope="chat_delete")
    ),
):
    await chat_service.delete_session(user_id, session_id)
    return {"ok": True}


async def sse_event_generator(
    user_id: str, session_id: str, content: str, regenerate_turn: int | None = None
):
    async for event in chat_service.send_message_stream(
        user_id=user_id,
        session_id=session_id,
        content=content,
        regenerate_turn=regenerate_turn,
    ):
        yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


@router.post("/sessions/{session_id}/messages/stream")
async def send_chat_message_stream(
    session_id: str,
    request: ChatMessageStreamRequest,
    user_id: str = Depends(get_current_user_id),
    _rate_limit: None = Depends(rate_limit_dependency(120, scope="chat_stream")),
):
    return StreamingResponse(
        sse_event_generator(
            user_id=user_id,
            session_id=session_id,
            content=request.content,
            regenerate_turn=request.regenerate_turn,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
