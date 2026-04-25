"""
Anthropic Claude Provider
"""

from typing import Optional, Dict, Any, List, cast
from anthropic import AsyncAnthropic
from .base import LLMProvider, build_runtime_system_message
from ..config import get_settings


class ClaudeProvider(LLMProvider):
    """Anthropic Claude 모델 Provider"""

    def __init__(self):
        settings = get_settings()
        self.client = AsyncAnthropic(api_key=settings.anthropic_api_key)

        # 사용 가능한 모델 목록
        self._models = [
            {
                "id": "claude-sonnet-4-20250514",
                "name": "Claude Sonnet 4",
                "description": "균형잡힌 성능 (추천)",
                "is_recommended": True,
            },
            {
                "id": "claude-3-5-sonnet-20241022",
                "name": "Claude 3.5 Sonnet",
                "description": "빠르고 똑똑함",
            },
            {
                "id": "claude-3-5-haiku-20241022",
                "name": "Claude 3.5 Haiku",
                "description": "가장 빠른 모델",
            },
            {
                "id": "claude-3-opus-20240229",
                "name": "Claude 3 Opus",
                "description": "가장 강력한 분석 (느림)",
            },
        ]

    @property
    def provider_name(self) -> str:
        return "anthropic"

    async def generate(
        self,
        prompt: str,
        model_id: str = "claude-sonnet-4-20250514",
        temperature: float = 0.7,
        max_tokens: int = 4096,
        response_format: Optional[Dict[str, Any]] = None,
        **kwargs,
    ) -> str:
        """Claude API 호출 (messages kwarg 지원)"""

        # messages kwarg가 있으면 직접 사용
        messages_kwarg: Optional[List[Dict[str, Any]]] = kwargs.pop("messages", None)

        if messages_kwarg:
            # system 메시지 추출 (첫 번째 메시지가 system이면)
            system_prompt = ""
            conversation: List[Dict[str, str]] = []
            for msg in messages_kwarg:
                if msg.get("role") == "system":
                    system_prompt = msg.get("content", "")
                else:
                    conversation.append(
                        {
                            "role": msg.get("role", "user"),
                            "content": msg.get("content", ""),
                        }
                    )

            if not conversation:
                conversation = [{"role": "user", "content": prompt or ""}]

            response = await self.client.messages.create(
                model=model_id,
                max_tokens=max_tokens,
                system=system_prompt,
                messages=cast(Any, conversation),
                temperature=temperature,
            )
            if response.content and len(response.content) > 0:
                first_block = response.content[0]
                text = getattr(first_block, "text", "")
                return text if isinstance(text, str) else ""
            return ""

        # 기존 로직: 단일 프롬프트
        system_prompt = build_runtime_system_message(response_format)

        response = await self.client.messages.create(
            model=model_id,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=cast(Any, [{"role": "user", "content": prompt}]),
            temperature=temperature,
        )

        if response.content and len(response.content) > 0:
            first_block = response.content[0]
            text = getattr(first_block, "text", "")
            return text if isinstance(text, str) else ""
        return ""

    def get_available_models(self) -> List[Dict[str, Any]]:
        """사용 가능한 모델 목록"""
        return self._models
