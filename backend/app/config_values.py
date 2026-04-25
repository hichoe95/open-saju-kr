from typing import Any

SUPPORTED_MODEL_IDS = frozenset(
    {
        "gpt-5.4",
        "gpt-5.4-mini",
        "gpt-5.4-nano",
        "gpt-5.2",
        "gpt-5.1",
        "gpt-5",
        "gpt-5-mini",
        "gpt-5-nano",
        "gpt-4.1",
        "gpt-4.1-mini",
        "gpt-4.1-nano",
        "gpt-4o",
        "saju-quick",
        "saju-deep",
        "saju-pro",
        "gemini-3-flash-preview",
        "gemini-2.0-flash",
        "gemini-1.5-pro",
        "gemini-1.5-flash",
        "claude-sonnet-4-20250514",
        "claude-3-5-sonnet-20241022",
    }
)

SUPPORTED_REASONING_EFFORTS = frozenset({"none", "low", "medium", "high"})

SUPPORTED_PERSONAS = frozenset({"classic", "mz", "warm", "witty"})

NON_NEGATIVE_INTEGER_CONFIG_KEYS = frozenset(
    {
        "reading_reanalyze",
        "ai_chat",
        "ai_chat_followup",
        "compatibility",
        "flow_ai_advice",
        "saju_image",
        "ai_advice_price",
        "compatibility_price",
        "decision_price",
        "free_analysis_count",
        "signup_bonus_coins",
        "daily_fortune_price",
    }
)


def is_supported_model_id(value: Any) -> bool:
    return isinstance(value, str) and value in SUPPORTED_MODEL_IDS


def is_supported_reasoning_effort(value: Any) -> bool:
    return isinstance(value, str) and value in SUPPORTED_REASONING_EFFORTS


def is_supported_persona(value: Any) -> bool:
    return isinstance(value, str) and value in SUPPORTED_PERSONAS


def is_non_negative_integer_config_key(key: str) -> bool:
    return key in NON_NEGATIVE_INTEGER_CONFIG_KEYS
