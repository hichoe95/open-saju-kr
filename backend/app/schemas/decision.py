"""결정 Q&A 스키마 정의."""

from typing import List

from pydantic import BaseModel

from .inputs import BirthInput, ModelSelection


class DecisionInput(BaseModel):
    """결정 Q&A 입력"""

    birth_input: BirthInput
    question: str
    domain: str = 'general'  # love, money, career, study, health, general
    model: ModelSelection


class DecisionResponse(BaseModel):
    """결정 Q&A 응답"""

    recommendation: str  # 'go', 'wait', 'no'
    summary: str
    pros: List[str]
    cons: List[str]
    risk_checks: List[str]
    next_actions: List[str]
    advice: str = ""  # 도사의 상세 조언
    disclaimer: str
