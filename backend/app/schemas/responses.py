"""응답 공통 스키마 정의."""

# pyright: reportMissingImports=false

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from .analysis import AdvancedAnalysis
from .enums import Provider
from .saju_data import CardData, PillarsData
from .tabs import SajuCharacter, TabsData


SUMMARY_HUB_FREE_VISIBLE_FIELDS = (
    "one_liner",
    "pillars",
    "card.stats",
    "card.character.summary",
    "tabs.love.summary",
    "tabs.money.summary",
    "tabs.career.summary",
    "tabs.study.summary",
    "tabs.health.summary",
    "tabs.compatibility.summary",
    "tabs.life_flow.mechanism",
    "tabs.daeun.summary",
    "tabs.lucky.today_overview",
)

SUMMARY_HUB_PAID_ONLY_FIELDS = (
    "saju_dna",
    "hidden_personality",
    "superpower",
    "hashtags",
    "famous_same_stem",
    "yearly_predictions",
    "character",
    "advanced_analysis",
    "rendered_markdown",
    "saju_image_base64",
    "saju_image_prompt",
    "card.character.buffs",
    "card.character.debuffs",
    "card.tags",
    "card.joseon_job",
    "card.soul_animal",
    "card.aura_color",
    "card.aura_color_name",
    "card.life_stat_radar",
    "card.title_badge",
    "tabs.love.full_text",
    "tabs.love.timeline",
    "tabs.love.dos",
    "tabs.love.donts",
    "tabs.love.scripts",
    "tabs.love.date_flow",
    "tabs.love.love_style_badges",
    "tabs.love.ideal_type_portrait",
    "tabs.love.flirting_skill",
    "tabs.love.best_confession_timing",
    "tabs.love.past_life_love",
    "tabs.love.love_energy_score",
    "tabs.love.breakup_risk_months",
    "tabs.love.ideal_stem_type",
    "tabs.money.full_text",
    "tabs.money.timeline",
    "tabs.money.risk",
    "tabs.money.rules",
    "tabs.money.wealth_vessel",
    "tabs.money.money_type",
    "tabs.money.shopping_ban_list",
    "tabs.money.investment_dna",
    "tabs.money.leak_warning",
    "tabs.money.wealth_grade",
    "tabs.money.lucky_money_days",
    "tabs.money.leak_weekday",
    "tabs.career.full_text",
    "tabs.career.timeline",
    "tabs.career.fit",
    "tabs.career.avoid",
    "tabs.career.next_steps",
    "tabs.career.job_change_signal",
    "tabs.career.office_villain_risk",
    "tabs.career.interview_killer_move",
    "tabs.career.salary_nego_timing",
    "tabs.career.office_role",
    "tabs.career.dream_jobs",
    "tabs.career.promotion_energy",
    "tabs.study.full_text",
    "tabs.study.timeline",
    "tabs.study.routine",
    "tabs.study.pitfalls",
    "tabs.study.study_type",
    "tabs.study.focus_golden_time",
    "tabs.study.study_bgm",
    "tabs.study.slump_escape",
    "tabs.health.full_text",
    "tabs.health.timeline",
    "tabs.health.routine",
    "tabs.health.warnings",
    "tabs.health.body_type",
    "tabs.health.weak_organs",
    "tabs.health.exercise_recommendation",
    "tabs.health.stress_relief",
    "tabs.compatibility.timeline",
    "tabs.compatibility.chemistry_tags",
    "tabs.compatibility.good_matches",
    "tabs.compatibility.conflict_triggers",
    "tabs.compatibility.communication_scripts",
    "tabs.compatibility.date_ideas",
    "tabs.compatibility.red_flags",
    "tabs.compatibility.full_text",
    "tabs.compatibility.friend",
    "tabs.compatibility.romance",
    "tabs.compatibility.work",
    "tabs.compatibility.family",
    "tabs.compatibility.relationship_label",
    "tabs.compatibility.survival_rate",
    "tabs.compatibility.chemistry_score",
    "tabs.life_flow.years",
    "tabs.life_flow.monthly_optional",
    "tabs.daeun.full_text",
    "tabs.daeun.current_daeun",
    "tabs.daeun.next_daeun_change",
    "tabs.daeun.sections",
    "tabs.daeun.timeline",
    "tabs.daeun.season_title",
    "tabs.daeun.genre",
    "tabs.daeun.progress_percent",
    "tabs.daeun.season_ending_preview",
    "tabs.lucky.lucky_color",
    "tabs.lucky.lucky_number",
    "tabs.lucky.lucky_direction",
    "tabs.lucky.lucky_item",
    "tabs.lucky.power_spot",
    "tabs.lucky.today_love",
    "tabs.lucky.today_money",
    "tabs.lucky.today_advice",
    "tabs.lucky.golden_time",
    "tabs.lucky.dead_time",
    "tabs.lucky.food_recommendation",
    "tabs.lucky.mission_of_day",
    "tabs.lucky.power_hour",
    "tabs.lucky.talisman_phrase",
)


class MetaData(BaseModel):
    """메타 정보"""

    provider: str
    model_id: str
    prompt_version: str = "v1"
    latency_ms: int = 0
    cache_id: Optional[str] = None
    reading_id: Optional[str] = None


class ReadingResponse(BaseModel):
    """사주 리딩 응답"""

    one_liner: str = ""
    pillars: PillarsData = PillarsData()
    card: CardData = CardData()
    saju_dna: Optional[str] = None
    hidden_personality: Optional[dict] = None
    superpower: Optional[str] = None
    hashtags: Optional[List[str]] = None
    famous_same_stem: Optional[str] = None
    yearly_predictions: Optional[List[dict]] = None
    character: Optional[SajuCharacter] = None
    tabs: TabsData = TabsData()
    advanced_analysis: Optional[AdvancedAnalysis] = None  # 종합 탭 확장 분석
    rendered_markdown: str = ""
    saju_image_base64: Optional[str] = None  # Base64 인코딩된 사주 이미지
    saju_image_prompt: Optional[str] = None  # 이미지 생성에 사용된 프롬프트
    meta: MetaData


class CompatibilityResponse(BaseModel):
    """궁합 분석 응답"""

    summary: str = Field(..., description="한 줄 요약")
    score: int = Field(..., description="궁합 점수")
    keyword: str = Field(..., description="키워드 해시태그")
    personality_fit: str = Field(..., description="성격 조화 분석")
    element_balance: str = Field(..., description="오행 조화 분석")
    conflict_points: str = Field(..., description="갈등 포인트")
    advice: str = Field(..., description="조언")
    full_text: Optional[str] = Field(None, description="상세 원문 (선택)")
    meta: MetaData


class ModelInfo(BaseModel):
    """모델 정보"""

    id: str
    name: str
    provider: Provider
    description: str = ""
    is_recommended: bool = False


class ModelsResponse(BaseModel):
    """모델 목록 응답"""

    models: List[ModelInfo]


class PastYearAnalysis(BaseModel):
    year: int
    year_ganji: str = ""
    interaction_type: Literal["충", "형", "파", "해"] = "충"
    type_detail: str = ""
    severity: Literal["강함", "보통", "약함"] = "보통"
    description: str = ""


class PastTimelineResponse(BaseModel):
    profile_id: str
    conflicts: List[PastYearAnalysis] = []
    total_count: int = 0
    earliest_year: Optional[int] = None
    latest_year: Optional[int] = None


class VsBattleCreate(BaseModel):
    profile_id: str
    category: str = Field(default="overall", pattern="^(overall|love|money|career)$")


class VsBattleResponse(BaseModel):
    battle_code: str
    expires_at: str


class VsBattleJoin(BaseModel):
    battle_code: str
    birth_year: int = Field(ge=1920, le=2030)
    birth_month: int = Field(ge=1, le=12)
    birth_day: int = Field(ge=1, le=31)
    birth_hour: int = Field(ge=0, le=23)
    gender: str = Field(pattern="^(male|female)$")
    calendar_type: str = Field(default="solar", pattern="^(solar|lunar)$")


class VsBattleResult(BaseModel):
    challenger: Dict[str, Any] = {}
    opponent: Dict[str, Any] = {}
    winner: str = ""
    category: str = ""
    message: str = ""


class CompatibilityData(BaseModel):
    score: int = 0
    summary: str = ""
    keyword: str = ""
    advice: str = ""


class UserBSummary(BaseModel):
    one_liner: str = ""
    character_name: str = ""
    character_icon_path: str = ""
    element: str = ""
    pillars_summary: str = ""


class QuickCompatibilityResponse(BaseModel):
    user_b_summary: UserBSummary = UserBSummary()
    compatibility: CompatibilityData = CompatibilityData()
