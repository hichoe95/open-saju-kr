"""
Provider Factory - Provider 인스턴스 생성 및 관리
"""
import logging
from typing import Dict, Optional
from functools import lru_cache

from .base import LLMProvider
from .openai_provider import OpenAIProvider
from .gemini_provider import GeminiProvider
from .claude_provider import ClaudeProvider
from ..schemas import Provider

logger = logging.getLogger(__name__)


class ProviderFactory:
    """LLM Provider 팩토리"""

    # TODO LLM-3: Add provider fallback chain (e.g., OpenAI → Gemini → Claude).
    # TODO LLM-3: Currently if selected provider is down, the request fails entirely.
    
    _providers: Dict[str, LLMProvider] = {}
    
    @classmethod
    def get_provider(cls, provider: Provider) -> LLMProvider:
        """
        Provider 인스턴스 반환 (싱글톤)
        
        Args:
            provider: Provider enum 값
            
        Returns:
            해당 LLMProvider 인스턴스
        """
        provider_key = provider.value
        
        if provider_key not in cls._providers:
            if provider == Provider.OPENAI:
                cls._providers[provider_key] = OpenAIProvider()
            elif provider == Provider.GOOGLE:
                cls._providers[provider_key] = GeminiProvider()
            elif provider == Provider.ANTHROPIC:
                cls._providers[provider_key] = ClaudeProvider()
            else:
                raise ValueError(f"Unknown provider: {provider}")
        
        return cls._providers[provider_key]
    
    @classmethod
    def get_all_models(cls) -> list:
        """모든 Provider의 모델 목록 반환"""
        all_models = []

        for provider in Provider:
            try:
                provider_instance = cls.get_provider(provider)
                models = provider_instance.get_available_models()
                for model in models:
                    model["provider"] = provider.value
                all_models.extend(models)
            except (ValueError, KeyError) as e:
                # API 키가 없는 Provider는 스킵 (로깅)
                logger.warning(f"[ProviderFactory] Skipping {provider.value}: {e}")

        return all_models
