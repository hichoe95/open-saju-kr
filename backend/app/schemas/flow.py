"""연/월/일 흐름 분석 스키마 정의."""

from typing import List, Optional

from pydantic import BaseModel, Field

from .enums import ContextTopic
from .inputs import BirthInput
from .saju_data import ElementStats


class FlowScores(BaseModel):
    """카테고리별 점수(0~100)"""

    general: int = 50
    love: int = 50
    money: int = 50
    career: int = 50
    study: int = 50
    health: int = 50


class FlowWindow(BaseModel):
    """연속 구간 하이라이트"""

    start_index: int = 0
    end_index: int = 0
    start_label: str = ""
    end_label: str = ""
    avg_score: int = 0


class FlowHighlights(BaseModel):
    """좋은/주의 구간 요약"""

    good_windows: List[FlowWindow] = []
    caution_windows: List[FlowWindow] = []
    good_summary: str = ""
    caution_summary: str = ""


class FlowMonthlyRequest(BaseModel):
    """월별 흐름 요청"""

    birth_input: BirthInput
    year: int
    category: ContextTopic = ContextTopic.GENERAL


class FlowDailyRequest(BaseModel):
    """일별 흐름 요청"""

    birth_input: BirthInput
    year: int
    month: int
    category: ContextTopic = ContextTopic.GENERAL


class FlowDetailRequest(BaseModel):
    """특정 날짜 상세 요청"""

    birth_input: BirthInput
    date: str  # YYYY-MM-DD
    category: ContextTopic = ContextTopic.GENERAL


class FlowAiAdviceRequest(BaseModel):
    """특정 날짜 AI 상세 조언 요청"""

    birth_input: BirthInput
    date: str  # YYYY-MM-DD
    category: ContextTopic = ContextTopic.GENERAL
    profile_id: Optional[str] = Field(default=None, description="저장된 프로필 ID (조언 저장용)")


class FlowMonthlyPoint(BaseModel):
    """월별 포인트"""

    month: int
    label: str = ""  # 예: "3월"
    ganji: str = ""  # 월간지 (발음 병기)
    elements: ElementStats = ElementStats()
    scores: FlowScores = FlowScores()
    badge: str = ""  # 예: "좋음", "주의"
    note: str = ""  # 짧은 설명


class FlowMonthlyResponse(BaseModel):
    """월별 흐름 응답"""

    year: int
    category: ContextTopic = ContextTopic.GENERAL
    points: List[FlowMonthlyPoint] = []
    highlights: FlowHighlights = FlowHighlights()


class FlowDailyPoint(BaseModel):
    """일별 포인트"""

    date: str = ""  # YYYY-MM-DD
    day: int = 0
    ganji: str = ""  # 일간지 (발음 병기)
    elements: ElementStats = ElementStats()
    scores: FlowScores = FlowScores()
    badge: str = ""


class FlowDailyResponse(BaseModel):
    """일별 흐름 응답"""

    year: int
    month: int
    category: ContextTopic = ContextTopic.GENERAL
    points: List[FlowDailyPoint] = []
    highlights: FlowHighlights = FlowHighlights()


class FlowDetailResponse(BaseModel):
    """날짜 상세 응답"""

    date: str = ""  # YYYY-MM-DD
    category: ContextTopic = ContextTopic.GENERAL
    year_ganji: str = ""
    month_ganji: str = ""
    day_ganji: str = ""
    seed_pillar: str = ""  # 행운키트 등 시드용 (보통 일간지)
    elements: ElementStats = ElementStats()
    scores: FlowScores = FlowScores()
    summary: str = ""
    why: List[str] = []
    do: List[str] = []
    dont: List[str] = []
    caution_note: str = ""


class FlowAiAdviceResponse(BaseModel):
    """AI 상세 조언 응답"""

    date: str = ""  # YYYY-MM-DD
    category: ContextTopic = ContextTopic.GENERAL
    headline: str = ""
    summary: str = ""
    good_points: List[str] = []
    bad_points: List[str] = []
    do: List[str] = []
    dont: List[str] = []
    detailed: str = ""
    disclaimer: str = ""
