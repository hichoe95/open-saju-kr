"""사주 기본 데이터 스키마 정의."""

from typing import List, Optional

from pydantic import BaseModel, Field


class PillarsData(BaseModel):
    """사주 팔자 데이터"""

    year: str = ""
    month: str = ""
    day: str = ""
    hour_A: str = ""
    hour_B: str = ""
    hour_note: str = ""


class ElementStats(BaseModel):
    """오행 스탯"""

    water: float = 0
    wood: float = 0
    fire: float = 0
    metal: float = 0
    earth: float = 0


class CharacterData(BaseModel):
    """캐릭터 데이터"""

    summary: str = ""
    buffs: List[str] = []
    debuffs: List[str] = []


class LifeStatRadar(BaseModel):
    """인생 5대 스탯 레이더"""

    intellect: int = Field(default=50, ge=0, le=100, description="지력")
    charm: int = Field(default=50, ge=0, le=100, description="매력")
    wealth: int = Field(default=50, ge=0, le=100, description="재력")
    vitality: int = Field(default=50, ge=0, le=100, description="체력")
    mental: int = Field(default=50, ge=0, le=100, description="멘탈")


class CardData(BaseModel):
    """사주 카드 데이터"""

    stats: ElementStats = ElementStats()
    character: CharacterData = CharacterData()
    tags: List[str] = []
    # ========== 콘텐츠 강화 필드 (v2) ==========
    joseon_job: Optional[str] = Field(default=None, description="조선시대 가상 직업 (예: 암행어사, 거상)")
    soul_animal: Optional[str] = Field(default=None, description="영혼의 동물 비유")
    aura_color: Optional[str] = Field(default=None, description="나의 아우라 컬러 (Hex)")
    aura_color_name: Optional[str] = Field(default=None, description="아우라 컬러 이름")
    life_stat_radar: Optional[LifeStatRadar] = Field(default=None, description="인생 5대 스탯")
    title_badge: Optional[str] = Field(default=None, description="칭호 뱃지 (예: 우주급 자존감)")
