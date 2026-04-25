"""
LLM Provider 추상 베이스 클래스
"""

import asyncio
import logging
import random
from pathlib import Path
from abc import ABC, abstractmethod
from typing import AsyncIterator, Optional, Dict, Any

logger = logging.getLogger(__name__)
PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"
_PROMPT_CACHE: Dict[str, str] = {}


def _load_prompt_file(filename: str) -> str:
    cached = _PROMPT_CACHE.get(filename)
    if cached is not None:
        return cached

    filepath = PROMPTS_DIR / filename
    try:
        content = filepath.read_text(encoding="utf-8").strip()
    except Exception:
        logger.exception("[PROVIDERS] 시스템 프롬프트 로드 실패: %s", filename)
        return ""

    _PROMPT_CACHE[filename] = content
    return content


def build_runtime_system_message(
    response_format: Optional[Dict[str, Any]] = None,
) -> str:
    system_prompt = _load_prompt_file("system_v1.txt")
    if not system_prompt:
        system_prompt = (
            "당신은 한국 명리학(사주팔자) 전문 분석가입니다. "
            "사용자 프롬프트의 지침을 우선 따르고, 과장 없이 한국어로 답하세요."
        )

    if response_format and response_format.get("type") == "json_object":
        system_prompt += "\n\n응답은 반드시 유효한 JSON 형식으로만 작성하세요."

    return system_prompt


async def llm_call_with_retry(
    func, *args, max_retries: int = 2, base_delay: float = 1.0, **kwargs
):
    """
    LLM 호출 공통 재시도 래퍼

    Args:
        func: 호출할 async 함수 (provider.generate 등)
        max_retries: 최대 재시도 횟수 (기본 2)
        base_delay: 기본 대기 시간 (초, 지수 백오프)
    """
    last_error = None
    for attempt in range(max_retries + 1):
        try:
            return await func(*args, **kwargs)
        except Exception as e:
            last_error = e
            if attempt < max_retries:
                delay = base_delay * (2**attempt) + random.uniform(0, 0.5)
                logger.warning(
                    f"[LLM_RETRY] attempt {attempt + 1}/{max_retries} failed: "
                    f"{type(e).__name__}: {e}, retrying in {delay:.1f}s"
                )
                await asyncio.sleep(delay)
            else:
                logger.error(
                    f"[LLM_RETRY] all {max_retries + 1} attempts failed: "
                    f"{type(e).__name__}: {e}"
                )
    raise last_error  # type: ignore[misc]


class LLMProvider(ABC):
    """LLM Provider 인터페이스"""

    @abstractmethod
    async def generate(
        self,
        prompt: str,
        model_id: str,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        response_format: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> str:
        """
        LLM 응답 생성

        Args:
            prompt: 프롬프트 텍스트
            model_id: 모델 ID
            temperature: 창의성 조절 (0~2)
            max_tokens: 최대 토큰 수
            response_format: JSON 스키마 등 응답 포맷 지정

        Returns:
            생성된 텍스트 또는 JSON 문자열
        """
        pass

    @abstractmethod
    def get_available_models(self) -> list:
        """사용 가능한 모델 목록 반환"""
        pass

    def generate_stream(
        self,
        prompt: str,
        model_id: str,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        **kwargs: Any,
    ) -> AsyncIterator[str]:
        raise NotImplementedError(
            f"{self.provider_name} provider does not support streaming"
        )

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Provider 이름 반환"""
        pass
