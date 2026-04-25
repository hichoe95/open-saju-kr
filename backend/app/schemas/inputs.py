"""입력 요청 스키마 정의."""

import re
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from ..config_values import SUPPORTED_MODEL_IDS, SUPPORTED_REASONING_EFFORTS
from .enums import CompatibilityScenario, ContextTopic, PersonaType, Provider


ALLOWED_MODELS = set(SUPPORTED_MODEL_IDS)

ALLOWED_REASONING_EFFORTS = set(SUPPORTED_REASONING_EFFORTS)


class ContextInput(BaseModel):
    """추가 상황 입력"""

    topic: ContextTopic = ContextTopic.GENERAL
    details: str = Field(
        default="", max_length=2000, description="상세 내용 (최대 2000자)"
    )


class BirthInput(BaseModel):
    """출생 정보 입력"""

    name: Optional[str] = Field(default=None, description="이름", max_length=100)
    birth_solar: str = Field(..., description="양력 생년월일 (YYYY-MM-DD)")
    birth_time: str = Field(..., description="출생 시간 (HH:MM, 24시간제)")
    timezone: str = Field(default="Asia/Seoul", description="시간대")
    birth_place: str = Field(default="대한민국", description="출생지", max_length=200)
    birth_lunar: Optional[str] = Field(default=None, description="음력 생년월일 (M/D)")
    calendar_type: str = Field(
        default="solar", description="양력/음력 구분 (solar/lunar)"
    )
    gender: str = Field(default="male", description="성별 (male/female)")
    persona: PersonaType = Field(
        default=PersonaType.CLASSIC, description="도사 페르소나 스타일"
    )
    context: Optional[ContextInput] = None

    @field_validator("birth_solar")
    @classmethod
    def validate_birth_solar(cls, v: str) -> str:
        """양력 생년월일 형식 및 실제 날짜 검증 (YYYY-MM-DD)"""
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", v):
            raise ValueError("생년월일은 YYYY-MM-DD 형식이어야 합니다 (예: 1990-01-15)")
        from datetime import datetime

        try:
            date = datetime.strptime(v, "%Y-%m-%d")
            if not (1900 <= date.year <= 2100):
                raise ValueError("년도는 1900~2100 사이여야 합니다")
        except ValueError as e:
            if "년도" in str(e):
                raise
            raise ValueError(f"유효하지 않은 날짜입니다: {v}")
        return v

    @field_validator("birth_time")
    @classmethod
    def validate_birth_time(cls, v: str) -> str:
        """출생 시간 형식 검증 (HH:MM)"""
        if not re.match(r"^\d{2}:\d{2}$", v):
            raise ValueError("출생 시간은 HH:MM 형식이어야 합니다 (예: 14:30)")
        hour, minute = map(int, v.split(":"))
        if not (0 <= hour <= 23):
            raise ValueError("시간은 0~23 사이여야 합니다")
        if not (0 <= minute <= 59):
            raise ValueError("분은 0~59 사이여야 합니다")
        return v

    @field_validator("gender")
    @classmethod
    def validate_gender(cls, v: str) -> str:
        """성별 검증"""
        if v not in ("male", "female"):
            raise ValueError("성별은 male 또는 female이어야 합니다")
        return v

    @field_validator("calendar_type")
    @classmethod
    def validate_calendar_type(cls, v: str) -> str:
        """달력 유형 검증"""
        if v not in ("solar", "lunar"):
            raise ValueError("달력 유형은 solar 또는 lunar이어야 합니다")
        return v


class ModelSelection(BaseModel):
    """모델 선택"""

    provider: Provider = Provider.OPENAI
    model_id: str = "auto"
    temperature: float = Field(default=0.7, ge=0, le=2)
    reasoning_effort: Optional[str] = Field(
        default=None,
        description="GPT-5.2 추론 강도 (none, low, medium, high). None이면 admin 설정 사용",
    )

    @field_validator("model_id")
    @classmethod
    def validate_model_id(cls, v: str) -> str:
        if v == "auto":
            return v
        if v not in ALLOWED_MODELS:
            return "auto"
        return v

    @field_validator("reasoning_effort")
    @classmethod
    def validate_reasoning_effort(cls, v: Optional[str]) -> Optional[str]:
        if v and v not in ALLOWED_REASONING_EFFORTS:
            return None
        return v


class ReadingRequest(BaseModel):
    """사주 리딩 요청"""

    input: BirthInput
    model: ModelSelection = ModelSelection()
    user_id: Optional[str] = Field(default=None, description="로그인 유저 ID (저장용)")
    profile_id: Optional[str] = Field(
        default=None, description="저장된 프로필 ID (리딩 연결용)"
    )


class CompatibilityRequest(BaseModel):
    user_a: BirthInput
    user_b: BirthInput
    model: ModelSelection = ModelSelection()
    scenario: CompatibilityScenario = CompatibilityScenario.LOVER
