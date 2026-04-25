"""
OpenAI Provider - GPT 모델 연동 (GPT-5.2 Responses API 지원)
"""

import logging
from typing import Optional, Dict, Any, List
from openai import AsyncOpenAI
from .base import LLMProvider, build_runtime_system_message
from ..config import get_settings

logger = logging.getLogger(__name__)


class OpenAIProvider(LLMProvider):
    """OpenAI GPT 모델 Provider (GPT-5.2 및 GPT-4o 지원)"""

    # GPT-5 계열은 Responses API 사용 필요
    GPT5_MODELS = {
        "gpt-5.4",
        "gpt-5.4-mini",
        "gpt-5.4-nano",
        "gpt-5.2",
        "gpt-5.1",
        "gpt-5",
        "gpt-5-mini",
        "gpt-5-nano",
    }

    def __init__(self):
        settings = get_settings()
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)

        # 사용 가능한 모델 목록 (최신순)
        # 사용 가능한 모델 목록 (Reasoning 강도별 분류 - 4o 제거)
        self._models = [
            {
                "id": "saju-quick",
                "name": "빠른 분석 (Quick)",
                "description": "기본적인 사주 해석 (Low Reasoning, 빠름)",
                "is_recommended": False,
            },
            {
                "id": "saju-deep",
                "name": "정밀 분석 (Standard)",
                "description": "상세하고 논리적인 해석 (Medium Reasoning, 추천)",
                "is_recommended": True,
            },
            {
                "id": "saju-pro",
                "name": "심층 추론 (Pro)",
                "description": "복합적이고 깊이 있는 통찰 (High Reasoning, 느림)",
                "is_recommended": False,
            },
        ]

    @property
    def provider_name(self) -> str:
        return "openai"

    async def generate(
        self,
        prompt: str,
        model_id: str = "gpt-5.2",
        temperature: float = 0.7,
        max_tokens: int = 4096,
        response_format: Optional[Dict[str, Any]] = None,
        reasoning_effort: str = "high",
        **kwargs: Any,
    ) -> str:
        """OpenAI API 호출 (messages kwarg 지원)"""

        # messages kwarg가 있으면 Chat Completions로 직접 전달
        messages_kwarg: Optional[List[Dict[str, Any]]] = kwargs.pop("messages", None)

        # 가상 모델 ID 매핑 및 Reasoning 강도 설정
        real_model_id = model_id
        current_reasoning = reasoning_effort

        if model_id == "saju-quick":
            real_model_id = "gpt-5.2"
            current_reasoning = "low"
        elif model_id == "saju-deep":
            real_model_id = "gpt-5.2"
            current_reasoning = "medium"
        elif model_id == "saju-pro":
            real_model_id = "gpt-5.2"
            current_reasoning = "high"

        # messages가 제공되면 Chat Completions API 사용 (멀티턴 대화 지원)
        if messages_kwarg:
            # GPT-5 계열이면 gpt-4o로 폴백 (Chat Completions 필요)
            chat_model = real_model_id
            if chat_model == "gpt-5.2" or chat_model.startswith("gpt-5"):
                chat_model = "gpt-4o"
            return await self._generate_with_chat_completions(
                prompt="",
                system_message="",
                model_id=chat_model,
                temperature=temperature,
                max_tokens=max_tokens,
                response_format=response_format,
                messages_override=messages_kwarg,
            )

        # GPT-5.2 (Responses API 사용)
        if real_model_id == "gpt-5.2" or real_model_id.startswith("gpt-5"):
            system_message = build_runtime_system_message(response_format)
            return await self._generate_with_responses_api(
                prompt=prompt,
                system_message=system_message,
                model_id=real_model_id,
                response_format=response_format,
                reasoning_effort=current_reasoning,
            )

        target_model = real_model_id

        system_message = build_runtime_system_message(response_format)

        return await self._generate_with_chat_completions(
            prompt=prompt,
            system_message=system_message,
            model_id=target_model,
            temperature=temperature,
            max_tokens=max_tokens,
            response_format=response_format,
        )

    async def _generate_with_responses_api(
        self,
        prompt: str,
        system_message: str,
        model_id: str,
        response_format: Optional[Dict[str, Any]] = None,
        reasoning_effort: str = "high",  # 추론 강도
    ) -> str:
        """GPT-5.2용 Responses API 호출"""
        import httpx
        import json  # [Fix] json 모듈 import 추가

        settings = get_settings()

        # Responses API 스키마
        # input: 시스템 메시지와 유저 프롬프트를 합쳐서 전달 (문서 참조)
        full_input = f"{system_message}\n\nUser Question: {prompt}"

        request_body = {
            "model": model_id,
            "input": full_input,
            "reasoning": {
                "effort": reasoning_effort  # 파라미터로 받은 추론 강도 사용
            },
            "text": {
                "verbosity": "high"
                if reasoning_effort == "high"
                else "medium"  # 추론 강도에 따라 조절
            },
        }

        # JSON 응답 포맷 (만약 필요하다면)
        if response_format and response_format.get("type") == "json_object":
            request_body["input"] += "\n\n응답은 반드시 Valid JSON 포맷으로 출력해줘."

        async with httpx.AsyncClient(timeout=900.0) as client:
            try:
                logger.debug(f"DEBUG: GPT-5.2 요청 시작 (Model: {model_id})")
                logger.debug("DEBUG: Endpoint: https://api.openai.com/v1/responses")

                response = await client.post(
                    "https://api.openai.com/v1/responses",
                    headers={
                        "Authorization": f"Bearer {settings.openai_api_key}",
                        "Content-Type": "application/json",
                    },
                    json=request_body,
                )

                if response.status_code != 200:
                    error_detail = response.text
                    logger.error(
                        f"CRITICAL ERROR: GPT-5.2 API 호출 실패. 상태코드: {response.status_code}"
                    )
                    logger.error(f"에러 내용: {error_detail}")
                    raise Exception(
                        f"OpenAI Responses API 오류 ({response.status_code}): {error_detail}"
                    )

                result = response.json()

                if settings.enable_debug_response_dump:
                    try:
                        with open("latest_response.json", "w", encoding="utf-8") as f:
                            json.dump(result, f, ensure_ascii=False, indent=2)
                        logger.debug(
                            "DEBUG: 응답 내용을 latest_response.json에 저장했습니다."
                        )
                    except Exception as e:
                        logger.debug(f"DEBUG: 파일 저장 실패: {e}")

                # [Fix] 응답이 리스트인 경우 처리 (일부 모델/상황에서 리스트로 반환될 수 있음)
                if isinstance(result, list):
                    logger.debug(
                        f"DEBUG: GPT-5.2 응답이 리스트입니다. 첫 번째 항목 사용. (길이: {len(result)})"
                    )
                    if len(result) > 0:
                        result = result[0]
                    else:
                        raise Exception("GPT-5.2 API 응답이 빈 리스트입니다.")

                logger.debug(
                    f"DEBUG: GPT-5.2 응답 구조 확인 (Keys): {list(result.keys()) if isinstance(result, dict) else 'Not a Dict'}"
                )

                # [Content Hunter] GPT-5.2 Responses API 구조에 맞게 추출
                # 구조: result["output"] = [ {type: "reasoning", ...}, {type: "message", content: [{type: "output_text", text: "..."}]} ]
                content = None

                # 1. GPT-5.2 Responses API 구조: output 배열 안의 message > content > text
                if "output" in result and isinstance(result["output"], list):
                    logger.debug(f"DEBUG: output 배열 길이: {len(result['output'])}")
                    for item in result["output"]:
                        if isinstance(item, dict) and item.get("type") == "message":
                            # message 타입 찾음
                            message_content = item.get("content", [])
                            if (
                                isinstance(message_content, list)
                                and len(message_content) > 0
                            ):
                                for content_item in message_content:
                                    if (
                                        isinstance(content_item, dict)
                                        and content_item.get("type") == "output_text"
                                    ):
                                        content = content_item.get("text", "")
                                        logger.debug(
                                            f"DEBUG: output_text에서 텍스트 추출 성공 (길이: {len(content)})"
                                        )
                                        break
                            if content:
                                break

                # 2. output_text가 최상위에 있는 경우
                if not content and "output_text" in result:
                    content = result["output_text"]
                    logger.debug("DEBUG: 최상위 output_text에서 추출")

                # 3. 단순 text/content 필드
                if not content and "text" in result:
                    content = result["text"]
                    logger.debug("DEBUG: 최상위 text에서 추출")

                if not content and "content" in result:
                    content = result["content"]
                    logger.debug("DEBUG: 최상위 content에서 추출")

                if content:
                    # Dict나 List로 왔을 경우 문자열로 변환
                    if isinstance(content, (dict, list)):
                        return json.dumps(content, ensure_ascii=False)
                    return str(content)

                # 추출 실패 시 에러 발생 (그냥 str(result)를 넘기면 포맷 에러남)
                logger.error(
                    f"CRITICAL ERROR: 응답에서 텍스트를 추출할 수 없습니다. 전체 응답: {str(result)[:500]}..."
                )
                error_context = (
                    list(result.keys())
                    if isinstance(result, dict)
                    else f"Type: {type(result)}, Value: {str(result)[:100]}"
                )
                raise Exception(f"GPT-5.2 응답 구조 해석 실패: {error_context}")

            except httpx.ReadTimeout:
                logger.exception("ERROR: GPT-5.2 Timeout (600s)")
                raise Exception(
                    "모델 응답 시간이 초과되었습니다 (High Reasoning 모델은 오래 걸릴 수 있습니다)."
                )
            except Exception as e:
                logger.exception(f"ERROR: GPT-5.2 처리 중 예외 발생: {str(e)}")
                raise e

    async def _generate_with_chat_completions(
        self,
        prompt: str,
        system_message: str,
        model_id: str,
        temperature: float,
        max_tokens: int,
        response_format: Optional[Dict[str, Any]] = None,
        messages_override: Optional[List[Dict[str, Any]]] = None,
    ) -> str:
        """Chat Completions API 호출 (messages_override 시 직접 전달)"""

        if messages_override:
            messages = messages_override
        else:
            messages = [
                {"role": "system", "content": system_message},
                {"role": "user", "content": prompt},
            ]

        cc_kwargs: Dict[str, Any] = {
            "model": model_id,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        if response_format:
            cc_kwargs["response_format"] = response_format

        response = await self.client.chat.completions.create(**cc_kwargs)

        return response.choices[0].message.content or ""

    def get_available_models(self) -> List[Dict[str, Any]]:
        """사용 가능한 모델 목록"""
        return self._models

    async def generate_stream(
        self,
        prompt: str,
        model_id: str = "gpt-5.2",
        temperature: float = 0.7,
        max_tokens: int = 4096,
        reasoning_effort: str = "low",
        **kwargs: Any,
    ):
        """
        OpenAI API 스트리밍 응답 생성

        Yields:
            str: 텍스트 델타(chunk)
        """
        # 가상 모델 ID 매핑
        real_model_id = model_id
        current_reasoning = reasoning_effort

        if model_id == "saju-quick":
            real_model_id = "gpt-5.2"
            current_reasoning = "low"
        elif model_id == "saju-deep":
            real_model_id = "gpt-5.2"
            current_reasoning = "medium"
        elif model_id == "saju-pro":
            real_model_id = "gpt-5.2"
            current_reasoning = "high"

        # GPT-5 계열은 Responses API 사용 (스트리밍 미지원)
        # Chat Completions API만 스트리밍 지원
        if real_model_id == "gpt-5.2" or real_model_id.startswith("gpt-5"):
            # GPT-5는 Responses API만 사용 가능하므로, 비스트리밍으로 폴백
            # 또는 gpt-4o로 대체
            logger.warning(f"GPT-5 계열은 스트리밍 미지원. gpt-4o로 대체합니다.")
            real_model_id = "gpt-4o"

        # messages kwarg가 있으면 직접 사용
        messages_kwarg = kwargs.pop("messages", None)

        if messages_kwarg:
            stream_messages = messages_kwarg
        else:
            system_message = build_runtime_system_message()
            stream_messages = [
                {"role": "system", "content": system_message},
                {"role": "user", "content": prompt},
            ]

        stream_params: Dict[str, Any] = {
            "model": real_model_id,
            "messages": stream_messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        }

        try:
            async for chunk in await self.client.chat.completions.create(
                **stream_params
            ):
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        except Exception as e:
            logger.exception(f"[OpenAI] 스트리밍 중 오류: {e}")
            raise
