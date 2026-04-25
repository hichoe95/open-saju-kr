"""비동기 작업 스키마 정의."""

from typing import Dict, Optional

from pydantic import BaseModel, Field

from .inputs import BirthInput, ModelSelection
from .responses import CompatibilityResponse, ReadingResponse
from .enums import CompatibilityScenario


class PushSubscription(BaseModel):
    """웹 푸시 구독 정보"""

    endpoint: str
    keys: Dict[str, str]  # p256dh, auth


class JobStartRequest(BaseModel):
    """비동기 작업 시작 요청"""

    input: BirthInput
    model: ModelSelection = ModelSelection()
    user_id: Optional[str] = Field(default=None, description="로그인 유저 ID (저장용)")
    profile_id: Optional[str] = Field(
        default=None, description="저장된 프로필 ID (리딩 연결용)"
    )
    client_request_id: Optional[str] = Field(
        default=None,
        min_length=8,
        max_length=120,
        description="클라이언트 요청 멱등 키",
    )
    push_subscription: Optional[PushSubscription] = None  # 푸시 알림용


class JobStartResponse(BaseModel):
    """비동기 작업 시작 응답"""

    job_id: str
    status: str = "pending"
    message: str = "분석이 시작되었습니다. 잠시 후 결과를 확인해주세요."


class JobStatusResponse(BaseModel):
    """작업 상태 조회 응답"""

    job_id: str
    status: str  # pending, processing, completed, failed
    progress: int = Field(default=0, ge=0, le=100, description="진행률 (0-100)")
    completed_tabs: int = Field(default=0, description="완료된 탭 수")
    total_tabs: int = Field(default=11, description="전체 탭 수")
    result: Optional[ReadingResponse] = None
    error: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class CompatibilityJobStartRequest(BaseModel):
    user_a: BirthInput
    user_b: BirthInput
    model: ModelSelection = ModelSelection()
    scenario: CompatibilityScenario = CompatibilityScenario.LOVER
    client_request_id: str = Field(..., min_length=8, max_length=120)


class CompatibilityJobStartResponse(BaseModel):
    job_id: str
    status: str
    message: str = "궁합 분석이 시작되었습니다. 결과를 불러오는 중입니다."
    progress: int = 0


class CompatibilityJobStatusResponse(BaseModel):
    job_id: str
    status: str
    payment_state: str
    progress: int = Field(default=0, ge=0, le=100)
    result: Optional[CompatibilityResponse] = None
    error: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    completed_at: Optional[str] = None
