"""종합 분석 스키마 정의."""

from typing import Dict, List

from pydantic import BaseModel, Field


class SipsinItem(BaseModel):
    """개별 십신 정보"""

    name: str = Field(default="", description="십신명 (비견, 겁재 등)")
    count: float = Field(default=0, description="개수 (0.5 등 소수점 허용)")
    positions: List[str] = Field(default=[], description="위치 (년간, 월지 등)")


class SipsinAnalysis(BaseModel):
    """십신 구조 분석"""

    distribution: List[SipsinItem] = Field(default=[], description="십신 분포")
    dominant: str = Field(default="", description="가장 강한 십신군 (비겁/식상/재성/관성/인성)")
    weak: str = Field(default="", description="가장 약한 십신군")
    core_trait: str = Field(default="", description="핵심 성향 설명")
    strengths: List[str] = Field(default=[], description="강점 리스트")
    risks: List[str] = Field(default=[], description="리스크 리스트")


class GeokgukYongsin(BaseModel):
    """격국 및 용신 분석"""

    geokguk: str = Field(default="", description="격국명")
    geokguk_basis: str = Field(default="", description="격국 판단 근거")
    yongsin: str = Field(default="", description="용신 (필요한 오행)")
    yongsin_basis: str = Field(default="", description="용신 판단 근거")
    heesin: str = Field(default="", description="희신 (용신을 돕는 오행)")
    gisin: str = Field(default="", description="기신 (용신을 방해하는 오행)")
    confidence: str = Field(default="중간", description="확신도 (높음/중간/낮음)")


class InteractionItem(BaseModel):
    """합충형파해 개별 항목"""

    type: str = Field(default="", description="유형 (합/충/형/파/해)")
    pillars: str = Field(default="", description="관련 기둥 (예: 년지-일지)")
    chars: str = Field(default="", description="관련 글자 (예: 子-午)")
    meaning: str = Field(default="", description="삶에서 나타나는 패턴")


class InteractionAnalysis(BaseModel):
    """합충형파해/공망 분석"""

    items: List[InteractionItem] = Field(default=[], description="합충형파해 목록")
    gongmang: List[str] = Field(default=[], description="공망 (비어있는 지지)")
    gongmang_meaning: str = Field(default="", description="공망이 삶에 미치는 영향")


class SinsalItem(BaseModel):
    """개별 신살 정보"""

    name: str = Field(default="", description="신살명")
    icon: str = Field(default="", description="아이콘/이모지")
    position: str = Field(default="", description="위치 (년주, 월주 등)")
    type: str = Field(default="", description="유형 (귀인/도화/역마/살)")
    condition_good: str = Field(default="", description="도움이 되는 조건")
    condition_bad: str = Field(default="", description="과해지는 조건")


class SinsalAnalysis(BaseModel):
    """신살 분석"""

    items: List[SinsalItem] = Field(default=[], description="신살 목록")
    summary: str = Field(default="", description="신살 종합 해석")


class DaeunItem(BaseModel):
    """개별 대운 정보"""

    age_range: str = Field(default="", description="나이 범위 (예: 32-41세)")
    ganji: str = Field(default="", description="간지")
    theme: str = Field(default="", description="핵심 테마")
    is_current: bool = Field(default=False, description="현재 대운 여부")


class DaeunAnalysis(BaseModel):
    """대운 분석"""

    direction: str = Field(default="", description="순행/역행")
    start_age: int = Field(default=0, description="대운 시작 나이")
    start_basis: str = Field(default="", description="시작 나이 산출 근거")
    items: List[DaeunItem] = Field(default=[], description="대운 목록 (현재 + 2-3개)")


class SeunAnalysis(BaseModel):
    """세운 분석 (올해~내년)"""

    year: int = Field(default=0, description="년도")
    ganji: str = Field(default="", description="간지")
    career: str = Field(default="", description="커리어 포인트")
    money: str = Field(default="", description="금전 포인트")
    relationship: str = Field(default="", description="대인관계 포인트")
    health: str = Field(default="", description="건강 포인트")


class ChecklistItem(BaseModel):
    """체크리스트 항목"""

    do: List[str] = Field(default=[], description="하면 좋은 것")
    dont: List[str] = Field(default=[], description="피하면 좋은 것")


class PracticalSummary(BaseModel):
    """실전 요약 체크리스트"""

    career: ChecklistItem = ChecklistItem()
    money: ChecklistItem = ChecklistItem()
    relationship: ChecklistItem = ChecklistItem()
    health: ChecklistItem = ChecklistItem()


class AdvancedAnalysis(BaseModel):
    """종합 탭 확장 분석"""

    wonguk_summary: str = Field(default="", description="사주 원국 요약 (오행 분포, 음양 균형, 신강/신약)")
    # 명확한 데이터 필드 (프론트엔드에서 직접 사용)
    yinyang_ratio: Dict[str, int] = Field(default={"yang": 4, "yin": 4}, description="음양 비율")
    strength: str = Field(default="", description="신강/신약/중화")
    day_master: str = Field(default="", description="일간 오행")
    sipsin: SipsinAnalysis = SipsinAnalysis()
    geokguk_yongsin: GeokgukYongsin = GeokgukYongsin()
    interactions: InteractionAnalysis = InteractionAnalysis()
    sinsal: SinsalAnalysis = SinsalAnalysis()
    daeun: DaeunAnalysis = DaeunAnalysis()
    seun: List[SeunAnalysis] = Field(default=[], description="세운 분석 (올해, 내년)")
    practical: PracticalSummary = PracticalSummary()
    time_uncertainty_note: str = Field(default="", description="시간 불확실성에 대한 설명")
