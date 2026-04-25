"""
Google Gemini Provider
"""

import logging
from typing import Optional, Dict, Any, List
import asyncio
from .base import LLMProvider, build_runtime_system_message
from ..config import get_settings

logger = logging.getLogger(__name__)


class GeminiProvider(LLMProvider):
    """Google Gemini 모델 Provider"""

    def __init__(self):
        settings = get_settings()
        self._api_key = settings.google_api_key
        self._client: Any = None

        # 사용 가능한 모델 목록
        self._models = [
            {
                "id": "gemini-3-pro-preview",
                "name": "Gemini 3 Pro Preview",
                "description": "최신 Pro 모델 (Preview)",
                "is_recommended": False,
            },
            {
                "id": "gemini-3-flash-preview",
                "name": "Gemini 3 Flash Preview",
                "description": "최신 빠른 모델 (Preview, 추천)",
                "is_recommended": True,
            },
            {
                "id": "gemini-2.0-flash",
                "name": "Gemini 2.0 Flash",
                "description": "이전 세대 빠른 모델",
            },
            {
                "id": "gemini-1.5-pro",
                "name": "Gemini 1.5 Pro",
                "description": "긴 컨텍스트 분석에 적합",
            },
            {
                "id": "gemini-1.5-flash",
                "name": "Gemini 1.5 Flash",
                "description": "빠르고 효율적",
            },
        ]

    @property
    def provider_name(self) -> str:
        return "google"

    async def generate(
        self,
        prompt: str,
        model_id: str = "gemini-1.5-flash",
        temperature: float = 0.7,
        max_tokens: int = 16384,
        response_format: Optional[Dict[str, Any]] = None,
        **kwargs,
    ) -> str:
        """Gemini API 호출 (messages kwarg 지원 — 단일 프롬프트로 flatten)"""

        # messages kwarg가 있으면 단일 프롬프트로 변환
        messages_kwarg = kwargs.pop("messages", None)
        effective_prompt = prompt

        if messages_kwarg:
            parts = []
            for msg in messages_kwarg:
                role = msg.get("role", "user")
                content = msg.get("content", "")
                if role == "system":
                    parts.append(f"[시스템 지침]\n{content}")
                elif role == "user":
                    parts.append(f"[사용자]\n{content}")
                elif role == "assistant":
                    parts.append(f"[도사]\n{content}")
            effective_prompt = "\n\n".join(parts)

        max_retries = 3
        last_error = None

        for attempt in range(max_retries):
            try:
                return await self._make_request(
                    effective_prompt, model_id, temperature, max_tokens, response_format
                )
            except ValueError as e:
                last_error = e
                if "content.parts가 없습니다" in str(e) and attempt < max_retries - 1:
                    import asyncio

                    wait_time = (attempt + 1) * 2
                    logger.warning(
                        f"[GEMINI] 빈 응답, {wait_time}초 후 재시도 ({attempt + 1}/{max_retries})"
                    )
                    await asyncio.sleep(wait_time)
                    continue
                raise

        raise last_error or ValueError("Gemini API 재시도 한도 초과")

    async def _make_request(
        self,
        prompt: str,
        model_id: str,
        temperature: float,
        max_tokens: int,
        response_format: Optional[Dict[str, Any]],
    ) -> str:
        """실제 Gemini API 요청 수행"""
        import httpx

        if not self._api_key:
            raise ValueError("GOOGLE_API_KEY가 설정되어 있지 않습니다.")

        # 가상 모델 ID -> 실제 Gemini 모델 매핑
        model_mapping = {
            "saju-quick": "gemini-2.0-flash",
            "saju-deep": "gemini-3-flash-preview",
            "saju-pro": "gemini-1.5-pro",
        }
        real_model_id = model_mapping.get(model_id, model_id)

        # REST API URL 구성
        api_model = real_model_id
        if not real_model_id.startswith("models/"):
            api_model = f"models/{real_model_id}"

        url = f"https://generativelanguage.googleapis.com/v1beta/{api_model}:generateContent?key={self._api_key}"

        logger.info(f"\n{'=' * 60}")
        logger.info("[GEMINI] 요청 시작")
        logger.info(f"[GEMINI] Model: {real_model_id}")
        logger.info(f"[GEMINI] API Model Path: {api_model}")
        logger.info(f"[GEMINI] Prompt 길이: {len(prompt)} chars")
        logger.info(f"[GEMINI] Temperature: {temperature}, MaxTokens: {max_tokens}")
        logger.info(f"{'=' * 60}")

        system_prompt = build_runtime_system_message(response_format)
        full_prompt = f"""[시스템 지침]
{system_prompt}

[분석 요청]
{prompt}"""

        logger.info(f"[GEMINI] Full prompt 길이: {len(full_prompt)} chars")

        data = {
            "contents": [{"parts": [{"text": full_prompt}]}],
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            },
        }

        if response_format and response_format.get("type") == "json_object":
            data["generationConfig"]["responseMimeType"] = "application/json"
            logger.info("[GEMINI] JSON 응답 모드 활성화")

        async with httpx.AsyncClient() as client:
            try:
                logger.info("[GEMINI] HTTP POST 요청 전송 중... (timeout: 900s)")
                res = await client.post(url, json=data, timeout=900.0)

                logger.info(f"[GEMINI] HTTP 상태 코드: {res.status_code}")

                if res.status_code != 200:
                    error_text = res.text
                    logger.error(f"[GEMINI] API 에러 응답: {error_text[:1000]}")
                    raise ValueError(
                        f"Gemini API Error {res.status_code}: {error_text}"
                    )

                res_json = res.json()

                # 전체 응답 구조 로깅
                logger.info(f"[GEMINI] 응답 JSON keys: {list(res_json.keys())}")

                # promptFeedback 확인 (차단 사유)
                prompt_feedback = res_json.get("promptFeedback", {})
                if prompt_feedback:
                    block_reason = prompt_feedback.get("blockReason")
                    logger.info(
                        f"[GEMINI] promptFeedback 존재: blockReason={block_reason or 'NONE'}"
                    )
                    if block_reason:
                        logger.error(f"[GEMINI] 프롬프트 차단됨! 사유: {block_reason}")
                        raise ValueError(f"Gemini 프롬프트 차단: {block_reason}")

                # candidates 확인
                candidates = res_json.get("candidates", [])
                logger.info(f"[GEMINI] candidates 개수: {len(candidates)}")

                if not candidates:
                    logger.error("[GEMINI] candidates가 비어있음!")
                    logger.info(
                        f"[GEMINI] 응답 메타: keys={list(res_json.keys())}, status={res.status_code}"
                    )
                    raise ValueError("Gemini API 응답에 candidates가 없습니다.")

                # 첫 번째 candidate 분석
                candidate = candidates[0]
                finish_reason = candidate.get("finishReason", "UNKNOWN")
                logger.info(f"[GEMINI] finishReason: {finish_reason}")

                # 안전 필터 등으로 차단된 경우
                if finish_reason in [
                    "SAFETY",
                    "RECITATION",
                    "BLOCKLIST",
                    "PROHIBITED_CONTENT",
                    "SPII",
                ]:
                    safety_ratings = candidate.get("safetyRatings", [])
                    logger.error(f"[GEMINI] 콘텐츠 차단! finishReason: {finish_reason}")
                    logger.info(f"[GEMINI] safetyRatings 개수: {len(safety_ratings)}")
                    raise ValueError(f"Gemini 콘텐츠 차단: {finish_reason}")

                # content/parts 추출
                content = candidate.get("content", {})
                parts = content.get("parts", [])
                logger.info(f"[GEMINI] content.parts 개수: {len(parts)}")

                if not parts:
                    logger.error("[GEMINI] parts가 비어있음!")
                    logger.info(
                        f"[GEMINI] candidate 메타: finishReason={finish_reason}, keys={list(candidate.keys())}"
                    )
                    raise ValueError("Gemini API 응답에 content.parts가 없습니다.")

                # 텍스트 추출
                text = parts[0].get("text", "")
                logger.info(f"[GEMINI] 응답 텍스트 길이: {len(text)} chars")
                logger.info(f"{'=' * 60}\n")

                if not text:
                    raise ValueError("Gemini API 응답 텍스트가 비어있습니다.")

                return text

            except httpx.TimeoutException as e:
                logger.exception(f"[GEMINI] Timeout 에러: {e}")
                raise ValueError(f"Gemini API Timeout: {e}")
            except ValueError:
                raise  # 이미 로깅된 에러는 그대로 전파
            except Exception as e:
                logger.exception("[GEMINI] Unexpected exception: %s", e)
                raise ValueError(f"Gemini API Failed: {e}")

    def get_available_models(self) -> List[Dict[str, Any]]:
        """사용 가능한 모델 목록"""
        return self._models
