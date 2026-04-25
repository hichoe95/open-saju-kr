import logging
from datetime import datetime
from typing import List, Dict, Any
import json

from ..schemas import SeunAnalysis
from ..utils.saju_calculator import get_calculated_pillars
from ..utils.flow_calculator import (
    compute_balance_weights,
    compute_scores,
    REL_KO,
    ELEMENT_KO,
)
from ..providers.factory import ProviderFactory
from .config_service import config_service, get_provider_for_model
from sajupy import calculate_saju

logger = logging.getLogger(__name__)


GANJI_60 = [
    "갑자", "을축", "병인", "정묘", "무진", "기사", "경오", "신미", "임신", "계유",
    "갑술", "을해", "병자", "정축", "무인", "기묘", "경진", "신사", "임오", "계미",
    "갑신", "을유", "병술", "정해", "무자", "기축", "경인", "신묘", "임진", "계사",
    "갑오", "을미", "병신", "정유", "무술", "기해", "경자", "신축", "임인", "계묘",
    "갑진", "을사", "병오", "정미", "무신", "기유", "경술", "신해", "임자", "계축",
    "갑인", "을묘", "병진", "정사", "무오", "기미", "경신", "신유", "임술", "계해"
]

YEAR_ELEMENT_MAP = {
    "갑": "wood", "을": "wood",
    "병": "fire", "정": "fire",
    "무": "earth", "기": "earth",
    "경": "metal", "신": "metal",
    "임": "water", "계": "water"
}

SEUN_TEMPLATES = {
    "career": {
        "good": "커리어에서 성장의 기회가 많은 해입니다. 새로운 도전을 두려워하지 마세요.",
        "neutral": "안정적으로 현재 위치를 다지기 좋은 해입니다. 기반을 튼튼히 하세요.",
        "caution": "직장에서 변화가 있을 수 있어요. 신중하게 대응하고 준비하세요."
    },
    "money": {
        "good": "재물운이 상승하는 해입니다. 투자나 저축에 좋은 시기예요.",
        "neutral": "수입과 지출의 균형을 맞추기 좋은 해입니다. 계획적인 소비가 중요해요.",
        "caution": "예상치 못한 지출이 있을 수 있어요. 비상금을 마련해두세요."
    },
    "relationship": {
        "good": "대인관계가 풍요로워지는 해입니다. 좋은 인연이 찾아올 수 있어요.",
        "neutral": "기존 관계를 돈독히 하기 좋은 해입니다. 소통에 집중하세요.",
        "caution": "관계에서 갈등이 생길 수 있어요. 말과 행동을 조심하세요."
    },
    "health": {
        "good": "건강 에너지가 충만한 해입니다. 운동을 시작하기 좋아요.",
        "neutral": "꾸준한 관리가 필요한 해입니다. 규칙적인 생활을 유지하세요.",
        "caution": "건강에 주의가 필요한 해입니다. 과로를 피하고 충분히 쉬세요."
    }
}


def get_year_ganji(year: int) -> str:
    idx = (year - 4) % 60
    return GANJI_60[idx]


def get_year_element(ganji: str) -> str:
    if not ganji:
        return "earth"
    stem = ganji[0]
    return YEAR_ELEMENT_MAP.get(stem, "earth")


def generate_seun_analysis(
    birth_year: int,
    birth_month: int,
    birth_day: int,
    birth_hour: int,
    birth_minute: int,
    gender: str,
    target_years: List[int] = None
) -> List[SeunAnalysis]:
    if target_years is None:
        current_year = datetime.now().year
        target_years = [current_year, current_year + 1]
    
    base = get_calculated_pillars(birth_year, birth_month, birth_day, birth_hour, birth_minute, gender)
    if not base:
        return []
    
    base_counts = base.get("oheng_counts", {})
    balance_weights = compute_balance_weights(base_counts)
    
    results = []
    
    for year in target_years:
        ganji = get_year_ganji(year)
        year_element = get_year_element(ganji)
        
        year_counts = {year_element: 2}
        
        merged = {}
        for elem in ["wood", "fire", "earth", "metal", "water"]:
            base_val = base_counts.get(elem, 0)
            year_val = year_counts.get(elem, 0)
            merged[elem] = base_val + year_val * 0.5
        
        scores = compute_scores(merged, balance_weights, "general")
        overall = scores.get("overall", 50)
        
        if overall >= 60:
            level = "good"
        elif overall <= 39:
            level = "caution"
        else:
            level = "neutral"
        
        seun = SeunAnalysis(
            year=year,
            ganji=ganji,
            career=SEUN_TEMPLATES["career"][level],
            money=SEUN_TEMPLATES["money"][level],
            relationship=SEUN_TEMPLATES["relationship"][level],
            health=SEUN_TEMPLATES["health"][level]
        )
        results.append(seun)
    
    return results


def generate_seun_from_input(birth_input, target_years: List[int] = None) -> List[SeunAnalysis]:
    try:
        y, m, d = map(int, birth_input.birth_solar.split("-"))
        hh, mm = 12, 0
        if birth_input.birth_time:
            parts = birth_input.birth_time.split(":")
            hh = int(parts[0])
            mm = int(parts[1]) if len(parts) > 1 else 0
        gender = birth_input.gender or "male"
        
        return generate_seun_analysis(y, m, d, hh, mm, gender, target_years)
    except Exception as e:
        logger.exception(f"Error generating seun: {e}")
        return []


def needs_seun_update(current_seun: List[SeunAnalysis], current_year: int) -> bool:
    """세운 갱신 필요 여부 확인"""
    if not current_seun:
        return True

    seun_years = [s.year for s in current_seun]

    if current_year not in seun_years:
        return True
    if current_year + 1 not in seun_years:
        return True

    return False


async def generate_seun_ai(birth_input, target_years: List[int] = None) -> List[SeunAnalysis]:
    """
    Gemini 3 Flash로 세운(년운) AI 추론

    Args:
        birth_input: BirthInput 객체 (birth_solar, birth_time, gender)
        target_years: 분석할 연도 리스트 (기본: 올해 + 내년)

    Returns:
        List[SeunAnalysis]
    """
    try:
        # 1. 연도 설정
        current_year = datetime.now().year
        if target_years is None:
            target_years = [current_year, current_year + 1]

        # 2. 사주 기본 정보 파싱
        y, m, d = map(int, birth_input.birth_solar.split("-"))
        hh, mm = 12, 0
        if birth_input.birth_time:
            parts = birth_input.birth_time.split(":")
            hh = int(parts[0])
            mm = int(parts[1]) if len(parts) > 1 else 0
        gender = birth_input.gender or "male"

        # 3. 사주팔자 계산
        pillars = get_calculated_pillars(y, m, d, hh, mm, gender)
        if not pillars:
            logger.error("[SEUN AI] 사주 계산 실패, 템플릿 fallback")
            return generate_seun_from_input(birth_input, target_years)

        # 4. 사주 정보 포맷 (pillars는 문자열 형태: "乙亥(을해)")
        year_pillar = pillars.get("year", "")
        month_pillar = pillars.get("month", "")
        day_pillar = pillars.get("day", "")
        hour_pillar = pillars.get("hour", "")

        saju_str = f"년주: {year_pillar}, 월주: {month_pillar}, 일주: {day_pillar}, 시주: {hour_pillar}"

        day_master = pillars.get("day_master", "")
        oheng = pillars.get("oheng_counts", {})

        # 5. 각 연도의 간지 계산
        years_info = []
        for year in target_years:
            ganji = get_year_ganji(year)
            years_info.append({"year": year, "ganji": ganji})

        years_str = ", ".join([f"{y['year']}년({y['ganji']})" for y in years_info])

        # 6. Gemini 3 Flash 프롬프트
        prompt = f"""당신은 한국 전통 명리학(사주팔자) 전문가입니다.
아래 사주 정보와 각 연도의 간지를 바탕으로 세운(년운)을 분석해주세요.

[사주 정보]
- 사주팔자: {saju_str}
- 일간(Day Master): {day_master}
- 오행 분포: 목({oheng.get('wood', 0)}) 화({oheng.get('fire', 0)}) 토({oheng.get('earth', 0)}) 금({oheng.get('metal', 0)}) 수({oheng.get('water', 0)})

[분석 대상 연도]
{years_str}

[요청]
각 연도별 세운을 아래 JSON 배열 형식으로만 출력하세요. 설명 없이 JSON만 출력하세요.
각 항목은 자연스럽고 친근한 말투로 작성하되, 구체적이고 실용적인 조언을 포함해주세요.

[
    {{
        "year": 연도(숫자),
        "ganji": "간지",
        "career": "커리어/직업운 (1-2문장)",
        "money": "금전운/재물운 (1-2문장)",
        "relationship": "대인관계/연애운 (1-2문장)",
        "health": "건강운 (1-2문장)"
    }}
]"""

        seun_model_id = await config_service.get_model_seun()
        seun_reasoning_effort = await config_service.get_reasoning_effort_seun()
        provider = ProviderFactory.get_provider(get_provider_for_model(seun_model_id))
        logger.info(f"[SEUN AI] {seun_model_id} 호출 시작... 대상 연도: {target_years}")

        response = await provider.generate(
            prompt=prompt,
            model_id=seun_model_id,
            temperature=0.7,
            max_tokens=2048,
            response_format={"type": "json_object"},
            reasoning_effort=seun_reasoning_effort,
        )

        logger.info(f"[SEUN AI] Gemini 응답 수신: {response[:300]}...")

        # 8. JSON 파싱
        result = json.loads(response)

        # 배열인지 확인
        if not isinstance(result, list):
            raise ValueError("Expected JSON array")

        # 9. SeunAnalysis 객체로 변환
        seun_list = []
        for item in result:
            seun = SeunAnalysis(
                year=item.get("year", 0),
                ganji=item.get("ganji", ""),
                career=item.get("career", ""),
                money=item.get("money", ""),
                relationship=item.get("relationship", ""),
                health=item.get("health", "")
            )
            seun_list.append(seun)

        logger.info(f"[SEUN AI] 성공적으로 {len(seun_list)}개 연도 생성 완료")
        return seun_list

    except json.JSONDecodeError as e:
        logger.exception(f"[SEUN AI] JSON 파싱 실패: {e}, 템플릿 fallback")
        return generate_seun_from_input(birth_input, target_years)
    except Exception as e:
        logger.exception("[SEUN AI] Unexpected error, falling back to template: %s", e)
        return generate_seun_from_input(birth_input, target_years)
