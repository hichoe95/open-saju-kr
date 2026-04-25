"""
사주 이미지 생성 서비스
- GPT-4o로 사주 결과 요약
- Gemini로 사주 이미지 생성
"""

import base64
import io
import logging
from typing import Optional
from openai import AsyncOpenAI
from google import genai
from google.genai import types
from ..config import get_settings

logger = logging.getLogger(__name__)


class SajuImageService:
    """사주 이미지 생성 서비스"""

    def __init__(self):
        settings = get_settings()
        self.openai_client = AsyncOpenAI(api_key=settings.openai_api_key)
        self.gemini_client = genai.Client(api_key=settings.google_api_key)

    STYLE_PROMPTS = {
        "ink_wash": "East Asian ink wash painting (수묵화) style, flowing brush strokes, minimalist, black ink on rice paper with subtle color accents",
        "anime": "Japanese anime illustration style, vibrant colors, detailed character design, dramatic lighting, Studio Ghibli inspired",
        "watercolor": "Delicate watercolor painting style, soft pastel colors, dreamy atmosphere, transparent layered washes, ethereal",
        "fantasy": "Epic fantasy art style, dramatic lighting, magical elements, detailed environment, cinematic composition, digital painting",
        "modern": "Contemporary digital art style, clean lines, bold colors, geometric elements, modern aesthetic, minimalist composition",
        "pixel_art": "Retro pixel art style, 16-bit video game aesthetic, visible pixel grid, vibrant saturated colors, nostalgic retro gaming feel, chunky pixel characters and elements",
    }

    async def summarize_saju(
        self, one_liner: str, character_summary: str, tags: list, gender: str = "male"
    ) -> str:
        """
        GPT-4o로 사주 결과를 이미지 프롬프트용으로 요약
        Args:
            one_liner: 한 줄 요약
            character_summary: 캐릭터 요약
            tags: 태그 리스트
            gender: 성별 ('male' 또는 'female')
        Returns:
            이미지 생성용 프롬프트 (영어)
        """
        gender_ko = "남성" if gender == "male" else "여성"
        gender_en = "male" if gender == "male" else "female"

        prompt = f"""Create an English image-generation prompt for a Korean person based on the reading details below.

[Character Description]
- Gender: {gender_ko}
- Core essence: {one_liner}
- Character profile: {character_summary}
- Key traits: {", ".join(tags) if tags else "None"}

[Guidelines]
1. Write in English only.
2. Capture the person through grounded, symbolic visual elements rather than literal fortune-telling imagery.
3. Use scene-level specificity: mood, posture, environment, objects, weather, light, or textures that fit the reading.
4. If relevant, weave in subtle five-element references as color mood, material, season, or environment - never as mystical symbols.
5. The atmosphere should feel contemplative, vivid, and believable, not magical or clichéd.
6. If including a person, use a {gender_en} figure shown from behind, in profile, or in silhouette - not a portrait.
7. Keep it under 80 words, concise but evocative.
8. Avoid mystical cliches such as glowing auras, crystal balls, tarot cards, dragons, fortune tellers, or fantasy spell effects.

[Output]
Image prompt only. No explanations, no markdown.
"""

        response = await self.openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": "You create grounded, symbolic image prompts. Favor behavioral mood, real-world atmosphere, and restrained metaphor over mystical fantasy. Output only the prompt.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.8,
            max_tokens=200,
        )

        image_prompt = response.choices[0].message.content or ""
        return image_prompt.strip()

    def generate_saju_image(
        self, image_prompt: str, gender: str = "male", style: str = "ink_wash"
    ) -> Optional[str]:
        """
        Gemini로 사주 이미지 생성
        Args:
            image_prompt: 이미지 생성 프롬프트 (영어)
            gender: 성별 ('male' 또는 'female')
        Returns:
            Base64 인코딩된 이미지 문자열 (또는 None)
        """
        try:
            # Gemini 이미지 생성 요청
            gender_desc = "a man" if gender == "male" else "a woman"
            style_desc = self.STYLE_PROMPTS.get(style, self.STYLE_PROMPTS["ink_wash"])
            full_prompt = f"Create a contemplative illustration representing {gender_desc}'s inner character and energy. Art style: {style_desc}. The image must be in a vertical aspect ratio (9:16), suitable for a mobile phone card view. The scene should feel grounded and symbolic rather than mystical - use natural elements, atmospheric lighting, and subtle symbolism instead of magical effects, glowing auras, or fantasy clichés. Content: {image_prompt}"
            logger.debug("DEBUG: Gemini 이미지 생성 요청 시작...")
            logger.debug(f"DEBUG: 프롬프트: {full_prompt[:100]}...")

            response = self.gemini_client.models.generate_content(
                model="gemini-2.5-flash-image",  # 이미지 생성이 지원되는 모델 (2.0-flash-exp deprecated)
                contents=[full_prompt],
                config=types.GenerateContentConfig(
                    response_modalities=["TEXT", "IMAGE"]
                ),
            )

            logger.debug("DEBUG: Gemini 응답 수신 완료")
            logger.debug(f"DEBUG: 응답 타입: {type(response)}")

            # 응답에서 이미지 추출
            if hasattr(response, "candidates") and response.candidates:
                for candidate in response.candidates:
                    if hasattr(candidate, "content") and candidate.content:
                        for part in candidate.content.parts:
                            logger.debug(f"DEBUG: Part 타입: {type(part)}")
                            if hasattr(part, "inline_data") and part.inline_data:
                                logger.debug(
                                    f"DEBUG: inline_data 발견! MIME: {part.inline_data.mime_type}"
                                )
                                # Base64로 직접 인코딩
                                image_data = part.inline_data.data
                                if isinstance(image_data, bytes):
                                    image_base64 = base64.b64encode(image_data).decode(
                                        "utf-8"
                                    )
                                else:
                                    image_base64 = (
                                        image_data  # 이미 base64 문자열인 경우
                                    )
                                logger.debug(
                                    f"DEBUG: 이미지 추출 성공 (길이: {len(image_base64)})"
                                )
                                return image_base64

            # 구버전 API 호환성
            if hasattr(response, "parts"):
                for part in response.parts:
                    logger.debug(f"DEBUG: Part 타입 (구버전): {type(part)}")
                    if hasattr(part, "inline_data") and part.inline_data is not None:
                        logger.debug("DEBUG: inline_data 발견 (구버전)")
                        try:
                            image = part.as_image()
                            buffer = io.BytesIO()
                            image.save(buffer, format="PNG")
                            buffer.seek(0)
                            image_base64 = base64.b64encode(buffer.read()).decode(
                                "utf-8"
                            )
                            return image_base64
                        except Exception as e:
                            logger.exception(
                                f"DEBUG: as_image() 실패, 직접 추출 시도: {e}"
                            )
                            if hasattr(part.inline_data, "data"):
                                image_base64 = base64.b64encode(
                                    part.inline_data.data
                                ).decode("utf-8")
                                return image_base64

            logger.warning("WARN: Gemini 응답에서 이미지를 찾을 수 없습니다")
            logger.debug(f"DEBUG: 전체 응답: {str(response)[:500]}...")
            return None

        except Exception as e:
            logger.exception("Gemini image generation failed: %s", e)
            return None

    async def create_saju_image(
        self,
        one_liner: str,
        character_summary: str,
        tags: list,
        gender: str = "male",
        style: str = "ink_wash",
    ) -> dict:
        """
        전체 프로세스: 요약 → 이미지 생성
        Args:
            one_liner: 한 줄 요약
            character_summary: 캐릭터 요약
            tags: 태그 리스트
            gender: 성별 ('male' 또는 'female')
        Returns:
            {
                "image_prompt": str,  # 생성에 사용된 프롬프트
                "image_base64": str | None  # Base64 이미지 (또는 None)
            }
        """
        # 1. GPT-4o로 요약/프롬프트 생성
        image_prompt = await self.summarize_saju(
            one_liner, character_summary, tags, gender=gender
        )
        logger.debug(f"DEBUG: 이미지 프롬프트 생성 완료: {image_prompt[:100]}...")
        image_base64 = self.generate_saju_image(
            image_prompt, gender=gender, style=style
        )
        if image_base64:
            logger.debug("DEBUG: 사주 이미지 생성 성공!")
        else:
            logger.warning("WARN: 사주 이미지 생성 실패 또는 건너뜀")
        return {"image_prompt": image_prompt, "image_base64": image_base64}


# 싱글톤 인스턴스
_image_service: Optional[SajuImageService] = None


def get_image_service() -> SajuImageService:
    """이미지 서비스 싱글톤 반환"""
    global _image_service
    if _image_service is None:
        _image_service = SajuImageService()
    return _image_service
