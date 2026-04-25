"""스키마 공통 열거형 정의."""

from enum import Enum


class Provider(str, Enum):
    """LLM 제공자"""

    OPENAI = "openai"
    GOOGLE = "google"
    ANTHROPIC = "anthropic"


class ContextTopic(str, Enum):
    """상담 주제"""

    LOVE = "love"
    CAREER = "career"
    MONEY = "money"
    HEALTH = "health"
    STUDY = "study"
    GENERAL = "general"


class PersonaType(str, Enum):
    WITTY = "witty"
    WARM = "warm"
    CLASSIC = "classic"
    MZ = "mz"


class CompatibilityScenario(str, Enum):
    LOVER = "lover"
    CRUSH = "crush"
    FRIEND = "friend"
    FAMILY = "family"
    BUSINESS = "business"
