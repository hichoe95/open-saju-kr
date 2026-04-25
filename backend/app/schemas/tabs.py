"""탭별 상세 응답 스키마 정의."""

from typing import Any, Dict, List, Optional

from pydantic import AliasChoices, BaseModel, Field


class Timeline(BaseModel):
    """과거, 현재, 미래 시점별 분석"""

    past: str = Field(default="", description="과거의 흐름")
    present: str = Field(default="", description="현재의 상태")
    future: str = Field(default="", description="미래의 전망")


class LoveTab(BaseModel):
    """연애운 탭"""

    summary: str = ""
    full_text: str = ""
    timeline: Timeline = Timeline()
    dos: List[str] = []
    donts: List[str] = []
    scripts: List[str] = []
    date_flow: Optional[Dict[str, str]] = None
    # v2 확장
    love_style_badges: List[str] = Field(
        default=[], description="연애 스타일 태그 (#금사빠 등)"
    )
    ideal_type_portrait: Optional[str] = Field(
        default=None, description="이상형 몽타주"
    )
    flirting_skill: Optional[str] = Field(default=None, description="플러팅 필살기")
    best_confession_timing: Optional[str] = Field(
        default=None, description="고백 최적 타이밍"
    )
    past_life_love: Optional[str] = Field(default=None, description="전생 러브스토리")
    love_energy_score: Optional[int] = Field(
        default=None, ge=0, le=100, description="연애 에너지 점수 (결정론적)"
    )
    breakup_risk_months: Optional[List[int]] = Field(
        default=None, description="이별 위험 월 (결정론적)"
    )
    ideal_stem_type: Optional[str] = Field(
        default=None, description="이런 일간이 좋아요"
    )


class MoneyTab(BaseModel):
    """금전운 탭"""

    summary: str = ""
    full_text: str = ""
    timeline: Timeline = Timeline()
    risk: List[str] = []
    rules: List[str] = []
    # v2 확장
    wealth_vessel: Optional[str] = Field(default=None, description="돈 그릇 크기 비유")
    money_type: Optional[str] = Field(
        default=None, description="재물 유형 (개미형/다람쥐형 등)"
    )
    shopping_ban_list: List[str] = Field(default=[], description="쇼핑 금지 품목")
    investment_dna: Optional[str] = Field(default=None, description="투자 DNA")
    leak_warning: Optional[str] = Field(default=None, description="돈 새는 패턴 경고")
    # v2 확장 (결정론적)
    wealth_grade: Optional[str] = Field(
        default=None, description="재물등급 S/A/B/C/D (결정론적)"
    )
    lucky_money_days: Optional[List[int]] = Field(
        default=None, description="이번 달 금전 에너지 강한 날"
    )
    leak_weekday: Optional[str] = Field(default=None, description="돈 새는 요일")


class CareerTab(BaseModel):
    """커리어 탭"""

    summary: str = ""
    full_text: str = ""
    timeline: Timeline = Timeline()
    fit: List[str] = []
    avoid: List[str] = []
    next_steps: List[str] = []
    # v2 확장
    job_change_signal: Optional[str] = Field(
        default=None, description="이직 신호등 (green/yellow/red)"
    )
    office_villain_risk: Optional[str] = Field(
        default=None, description="오피스 빌런 위험도"
    )
    interview_killer_move: Optional[str] = Field(
        default=None, description="면접 필살기"
    )
    salary_nego_timing: Optional[str] = Field(
        default=None, description="연봉 협상 최적 타이밍"
    )
    office_role: Optional[str] = Field(default=None, description="직장 내 포지션 유형")
    dream_jobs: Optional[List[str]] = Field(default=None, description="천직 3개")
    promotion_energy: Optional[str] = Field(
        default=None, description="승진 에너지 지수 (강함/보통/약함)"
    )


class StudyTab(BaseModel):
    """학업운 탭"""

    summary: str = Field(
        default="",
        description="ONE-LINE VERDICT: 현재 상태의 본질 선언 (full_text 요약 금지)",
    )
    full_text: str = Field(
        default="",
        description="유일한 장문 설명 (summary 확장판 아님, 독립적 심층 분석)",
    )
    timeline: Timeline = Timeline()
    routine: List[str] = []
    pitfalls: List[str] = []
    # v2 확장
    study_type: Optional[str] = Field(
        default=None, description="학습 유형 분류 (카드용, full_text 반복 금지)"
    )
    focus_golden_time: Optional[str] = Field(
        default=None, description="집중력 골든타임 (카드용, 시간대 중심)"
    )
    study_bgm: Optional[str] = Field(
        default=None, description="공부 BGM 추천 (카드용, 장르/분위기 중심)"
    )
    slump_escape: Optional[str] = Field(
        default=None, description="슬럼프 탈출 행동 팁 (카드용, full_text 반복 금지)"
    )


class HealthTab(BaseModel):
    """건강운 탭"""

    summary: str = Field(
        default="",
        description="ONE-LINE VERDICT: 현재 체질/건강 본질 선언 (full_text 요약 금지)",
    )
    full_text: str = Field(
        default="",
        description="유일한 장문 설명 (summary 확장판 아님, 독립적 심층 분석)",
    )
    timeline: Timeline = Timeline()
    routine: List[str] = []
    warnings: List[str] = []
    # v2 확장
    body_type: Optional[str] = Field(
        default=None, description="오행 체질 분류 (카드용, full_text 반복 금지)"
    )
    weak_organs: List[str] = Field(
        default=[], description="취약 장기 목록 (카드용, 설명은 full_text에서)"
    )
    exercise_recommendation: Optional[str] = Field(
        default=None, description="추천 운동 제안 (카드용, 핵심 행동 중심)"
    )
    stress_relief: Optional[str] = Field(
        default=None, description="스트레스 해소 행동 팁 (카드용, full_text 반복 금지)"
    )


class YearFlow(BaseModel):
    """연간 흐름"""

    year: int
    theme: str = ""
    risk: str = ""
    tip: str = ""
    # v2 확장
    weather_icon: Optional[str] = Field(
        default=None, description="날씨 아이콘 (sunny/stormy 등)"
    )
    strategy: Optional[str] = Field(default=None, description="전략 (공격/수비/존버)")


class MonthlyFlow(BaseModel):
    """월간 흐름"""

    range: str = ""
    ganji: str = ""
    work: str = ""
    money: str = ""
    love: str = ""
    health: str = ""


class LifeFlowTab(BaseModel):
    """인생 흐름 탭 - 타이밍 네비게이터 (연/월별 운세와 전략)"""

    mechanism: List[str] = Field(
        default=[], description="운의 흐름 패턴 (타이밍 중심, 성격묘사 금지)"
    )
    years: List[YearFlow] = Field(default=[], description="연간 운세 흐름 (전략 중심)")
    monthly_optional: List[MonthlyFlow] = Field(
        default=[], description="월간 운세 흐름 (월/년별 타이밍)"
    )


class RelationshipSubTab(BaseModel):
    """관계 하위 카테고리 분석"""

    summary: str = Field(
        default="", description="카테고리 ONE-LINE VERDICT (상위 full_text 요약 금지)"
    )
    full_text: str = Field(
        default="", description="해당 관계 유형별 실전 분석 (상위 full_text 반복 금지)"
    )
    strengths: List[str] = Field(default=[], description="이 관계에서의 강점")
    challenges: List[str] = Field(default=[], description="주의할 점/갈등 요소")
    tips: List[str] = Field(default=[], description="소통/개선 팁")
    scenarios: List[str] = Field(default=[], description="구체적 상황 예시")


class CompatibilityTab(BaseModel):
    """궁합/관계 탭"""

    summary: str = Field(
        default="",
        description="ONE-LINE VERDICT: 관계 캐릭터 본질 선언 (full_text 요약 금지)",
    )
    timeline: Optional[Timeline] = Field(
        default=None, description="관계 흐름의 past/present/future (overview 전용)"
    )
    chemistry_tags: List[str] = Field(
        default=[], description="관계 분위기를 압축하는 태그"
    )
    good_matches: List[str] = Field(default=[], description="잘 맞는 상대 유형")
    conflict_triggers: List[str] = Field(default=[], description="갈등을 유발하는 버튼")
    communication_scripts: List[str] = Field(
        default=[], description="화해/소통용 실전 문구"
    )
    date_ideas: List[str] = Field(default=[], description="데이트/선물 추천")
    red_flags: List[str] = Field(default=[], description="관계 경고 신호")
    full_text: str = Field(
        default="",
        description="대인관계 전략의 유일한 장문 설명 (sub-tabs 반복 금지, 독립적 심층 분석)",
    )
    friend: Optional[RelationshipSubTab] = Field(default=None, description="친구 관계")
    romance: Optional[RelationshipSubTab] = Field(
        default=None, description="연애/썸 관계"
    )
    work: Optional[RelationshipSubTab] = Field(
        default=None, description="직장/학교 관계"
    )
    family: Optional[RelationshipSubTab] = Field(default=None, description="가족 관계")
    # v2 확장
    relationship_label: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("relationship_label", "chemistry_mbti"),
        serialization_alias="relationship_label",
        description="관계 별칭 또는 관계 결을 압축한 짧은 라벨",
    )
    survival_rate: Optional[int] = Field(
        default=None, ge=0, le=100, description="무인도 생존 확률"
    )
    chemistry_score: Optional[int] = Field(
        default=None, ge=0, le=100, description="케미 점수"
    )


class DaeunTimelineItem(BaseModel):
    """대운 타임라인 항목"""

    age: str = ""
    ganji: str = ""
    theme: str = ""
    description: str = ""


class DaeunTab(BaseModel):
    """대운(10년 운) 탭 - 10년 시즌 지도 (시즌 성격과 전체 타임라인)"""

    summary: str = Field(
        default="", description="현재 대운 핵심 테마 (시즌 중심, 구체적 연도 언급 금지)"
    )
    full_text: str = Field(
        default="",
        description="대운 상세 분석 (마크다운, 시즌 서사, 연도/월 타이밍 금지)",
    )
    current_daeun: str = Field(default="", description="현재 대운 간지")
    next_daeun_change: str = Field(
        default="",
        description="다음 대운 시즌 시작 나이/간지 (구체적 연월일 제외 - LifeFlow 탭에서 다룸)",
    )
    sections: List[Any] = Field(default=[], description="섹션별 분석")
    timeline: List[DaeunTimelineItem] = Field(
        default=[],
        description="전체 대운 타임라인 (10년 단위 지도, 구체적 연도 언급 금지)",
    )
    # v2 확장
    season_title: Optional[str] = Field(
        default=None, description="현재 대운의 드라마틱한 시즌 제목"
    )
    genre: Optional[str] = Field(
        default=None, description="현재 인생의 장르 (스릴/로맨스/성장 등)"
    )
    progress_percent: Optional[int] = Field(
        default=None, ge=0, le=100, description="현재 시즌 진행률 (0-100)"
    )
    season_ending_preview: Optional[str] = Field(
        default=None, description="다음 시즌 예고 (구체적 연월일 제외)"
    )


class LuckyTab(BaseModel):
    """행운키트 및 오늘의 운세"""

    lucky_color: str = ""
    lucky_number: str = ""
    lucky_direction: str = ""
    lucky_item: str = ""
    power_spot: str = ""
    today_overview: str = ""
    today_love: str = ""
    today_money: str = ""
    today_advice: str = ""
    # v2 확장
    golden_time: Optional[str] = Field(default=None, description="최고의 시간대")
    dead_time: Optional[str] = Field(default=None, description="피해야 할 시간대")
    food_recommendation: Optional[str] = Field(
        default=None, description="행운의 점심 메뉴"
    )
    mission_of_day: Optional[str] = Field(default=None, description="오늘의 미션")
    power_hour: Optional[str] = Field(
        default=None, description="파워 타임 (집중력 최고)"
    )
    talisman_phrase: Optional[str] = Field(default=None, description="오늘의 부적 문구")


class SajuCharacter(BaseModel):
    type: str = ""
    name: str = ""
    icon_path: str = ""
    description: str = ""
    element: str = ""


class TabsData(BaseModel):
    """전체 탭 데이터"""

    love: LoveTab = LoveTab()
    money: MoneyTab = MoneyTab()
    career: CareerTab = CareerTab()
    study: StudyTab = StudyTab()
    health: HealthTab = HealthTab()
    compatibility: Optional[CompatibilityTab] = None
    life_flow: LifeFlowTab = LifeFlowTab()
    daeun: DaeunTab = DaeunTab()  # 신규
    lucky: LuckyTab = LuckyTab()  # 업데이트
