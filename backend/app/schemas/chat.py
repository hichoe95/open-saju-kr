"""멀티턴 채팅 세션 스키마 — Pydantic v2"""

from pydantic import BaseModel, Field
from typing import Union, List
from datetime import datetime
from enum import Enum


class ChatRole(str, Enum):
    user = "user"
    assistant = "assistant"
    system = "system"


class ChatStatus(str, Enum):
    active = "active"
    completed = "completed"


class ChatSessionCreate(BaseModel):
    birth_key: str
    domain: str
    persona: str = "classic"
    saju_context: dict = Field(default_factory=dict)


class ChatSessionResponse(BaseModel):
    id: str
    user_id: str
    birth_key: str
    domain: str
    persona: str
    status: ChatStatus
    max_turns: int
    current_turn: int
    remaining_turns: int  # max_turns - current_turn
    created_at: datetime
    updated_at: datetime
    # expires_at 없음 (타임아웃 없음)


class ChatMessageCreate(BaseModel):
    role: ChatRole = ChatRole.user
    content: str


class ChatMessageResponse(BaseModel):
    id: str
    session_id: str
    turn: int
    role: ChatRole
    content: Union[dict, str]  # Turn 1: DecisionResponse dict, Turn 2+: str
    response_format: str  # 'decision' or 'freeform' or 'system'
    tokens_used: int
    cost_coins: int
    created_at: datetime


class ChatHistoryResponse(BaseModel):
    session: ChatSessionResponse
    messages: List[ChatMessageResponse]


class ChatSendResponse(BaseModel):
    message: ChatMessageResponse
    session: ChatSessionResponse
    coins_spent: int
