import logging
from typing import Optional, Dict, Any
import asyncio
import json
from datetime import datetime, timedelta

from ..config_values import (
    is_supported_model_id,
    is_supported_persona,
    is_supported_reasoning_effort,
)
from ..db.supabase_client import supabase
from ..schemas.enums import Provider

logger = logging.getLogger(__name__)


LEGACY_FEATURE_PRICE_KEYS: Dict[str, list[str]] = {
    "ai_chat": ["decision_price"],
    "flow_ai_advice": ["ai_advice_price"],
    "compatibility": ["compatibility_price"],
}


def get_provider_for_model(model_id: str) -> Provider:
    """모델 ID로부터 Provider를 자동 결정한다."""
    if model_id.startswith(("gpt-", "saju-", "o1", "o3", "o4")):
        return Provider.OPENAI
    elif model_id.startswith("gemini-"):
        return Provider.GOOGLE
    elif model_id.startswith("claude-"):
        return Provider.ANTHROPIC
    return Provider.OPENAI


class ConfigService:
    _instance: Optional["ConfigService"] = None
    _cache: Dict[str, Any] = {}
    _cache_ttl: int = 300  # 5 minutes default TTL
    _last_refresh: Optional[datetime] = None
    _lock: asyncio.Lock = asyncio.Lock()

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    async def _refresh_cache(self) -> None:
        try:
            result = supabase.table("app_config").select("key, value").execute()
            new_cache = {}
            for item in result.data or []:
                if isinstance(item, dict):
                    key = item.get("key")
                    if isinstance(key, str):
                        new_cache[key] = item.get("value")
            self._cache = new_cache
            self._last_refresh = datetime.now()
        except Exception as e:
            logger.exception(f"ConfigService refresh error: {e}")

    async def _ensure_cache(self) -> None:
        now = datetime.now()
        needs_refresh = self._last_refresh is None or (
            now - self._last_refresh
        ) > timedelta(seconds=self._cache_ttl)
        if needs_refresh:
            async with self._lock:
                if self._last_refresh is None or (
                    datetime.now() - self._last_refresh
                ) > timedelta(seconds=self._cache_ttl):
                    await self._refresh_cache()

    async def get(self, key: str, default: Any = None) -> Any:
        await self._ensure_cache()
        return self._cache.get(key, default)

    @staticmethod
    def _safe_parse_config_value(value: Any, default: int) -> int:
        if value is None:
            return default

        if isinstance(value, bool):
            return default

        if isinstance(value, (int, float)):
            if isinstance(value, float) and not value.is_integer():
                return default
            return int(value)

        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return default

            try:
                parsed = json.loads(stripped)
            except (json.JSONDecodeError, TypeError):
                parsed = stripped

            if parsed != stripped:
                return ConfigService._safe_parse_config_value(parsed, default)

            try:
                parsed_int = int(stripped)
                if str(parsed_int) != stripped:
                    return default
                return parsed_int
            except (ValueError, TypeError):
                return default

        return default

    async def get_feature_price(self, feature_key: str, default: int) -> int:
        candidate_keys = [
            feature_key,
            f"{feature_key}_price",
        ] + LEGACY_FEATURE_PRICE_KEYS.get(feature_key, [])

        for candidate_key in candidate_keys:
            price_value = await self.get(candidate_key)
            if price_value is not None:
                parsed_price = self._safe_parse_config_value(price_value, default)
                if parsed_price < 0:
                    logger.error(
                        "[CONFIG] Negative feature price detected: key=%s value=%s fallback=%s",
                        candidate_key,
                        price_value,
                        default,
                    )
                    return self._safe_parse_config_value(None, default)
                return parsed_price

        return self._safe_parse_config_value(None, default)

    async def get_all(self) -> Dict[str, Any]:
        await self._ensure_cache()
        return self._cache.copy()

    def invalidate(self) -> None:
        self._last_refresh = None

    async def get_default_persona(self) -> str:
        persona = await self.get("default_persona", "classic")
        if is_supported_persona(persona):
            return str(persona)
        logger.warning(
            "[CONFIG] Invalid default_persona=%s. Fallback to classic.", persona
        )
        return "classic"

    async def get_feature_model(
        self, feature: str, default: str = "gpt-5.4-nano"
    ) -> str:
        model_id = await self.get(f"model_{feature}", default)
        if is_supported_model_id(model_id):
            return str(model_id)
        logger.warning(
            "[CONFIG] Invalid model_%s=%s. Fallback to %s.",
            feature,
            model_id,
            default,
        )
        return default

    async def get_model_main(self) -> str:
        return await self.get_feature_model("main", "gpt-5.4-nano")

    async def get_model_compatibility(self) -> str:
        return await self.get_feature_model("compatibility")

    async def get_model_decision(self) -> str:
        return await self.get_feature_model("decision")

    async def get_model_flow(self) -> str:
        return await self.get_feature_model("flow")

    async def get_model_daily_fortune(self) -> str:
        return await self.get_feature_model("daily_fortune")

    async def get_model_seun(self) -> str:
        return await self.get_feature_model("seun")

    async def get_feature_reasoning_effort(
        self, feature: str, default: str = "low"
    ) -> str:
        """기능별 reasoning effort 조회 (DB key: reasoning_effort_{feature})"""
        effort = await self.get(f"reasoning_effort_{feature}", default)
        if is_supported_reasoning_effort(effort):
            return str(effort)
        logger.warning(
            "[CONFIG] Invalid reasoning_effort_%s=%s. Fallback to %s.",
            feature,
            effort,
            default,
        )
        return default

    async def get_reasoning_effort_main(self) -> str:
        return await self.get_feature_reasoning_effort("main", "medium")

    async def get_reasoning_effort_compatibility(self) -> str:
        return await self.get_feature_reasoning_effort("compatibility", "medium")

    async def get_reasoning_effort_decision(self) -> str:
        return await self.get_feature_reasoning_effort("decision", "low")

    async def get_reasoning_effort_flow(self) -> str:
        return await self.get_feature_reasoning_effort("flow", "low")

    async def get_reasoning_effort_daily_fortune(self) -> str:
        return await self.get_feature_reasoning_effort("daily_fortune", "low")

    async def get_reasoning_effort_seun(self) -> str:
        return await self.get_feature_reasoning_effort("seun", "low")

    async def is_review_login_enabled(self) -> bool:
        value = await self.get("review_login_enabled", "false")
        return str(value).lower() in ("true", "1", "yes")

    async def get_review_login_code(self) -> str:
        return await self.get("review_login_code", "")

    async def get_payment_mode(self) -> str:
        """결제 모드 조회. 'test' 또는 'live'"""
        return await self.get("payment_mode", "test")

    async def is_feature_enabled(self, feature_name: str) -> bool:
        """feature flag 확인. 키 네이밍: feature_{name}_enabled"""
        value = await self.get(f"feature_{feature_name}_enabled", "false")
        return str(value).lower() in ("true", "1", "yes")


config_service = ConfigService()
