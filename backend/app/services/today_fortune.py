import logging
from datetime import datetime, date
from typing import Dict, Any, Optional
import hashlib
import json

from ..utils.saju_calculator import get_today_ganji, get_calculated_pillars
from ..utils.flow_calculator import (
    merge_weighted_pillars,
    compute_balance_weights,
    compute_scores,
    relation_strengths,
    REL_KO,
    ELEMENT_KO,
    dominant_elements,
)
from ..providers.factory import ProviderFactory
from ..schemas import ModelSelection, Provider
from .config_service import config_service, get_provider_for_model
from sajupy import calculate_saju

logger = logging.getLogger(__name__)


FORTUNE_TEMPLATES = {
    "good": [
        "오늘은 {element} 기운이 조화롭게 흘러 {area}에서 좋은 결과를 기대할 수 있어요.",
        "길한 기운이 감도는 하루입니다. {area}에 집중하면 뜻밖의 성과가 있을 거예요.",
        "{element}의 기운이 당신을 돕고 있어요. 적극적으로 행동해보세요.",
    ],
    "neutral": [
        "평온한 하루가 예상됩니다. 무리하지 말고 꾸준히 진행하세요.",
        "오늘은 준비와 계획에 집중하기 좋은 날이에요.",
        "큰 변화보다는 안정을 추구하는 것이 좋겠어요.",
    ],
    "caution": [
        "오늘은 {area}에서 신중함이 필요해요. 결정을 서두르지 마세요.",
        "기운의 흐름이 다소 거친 날입니다. 충동적인 행동은 피하세요.",
        "컨디션 관리에 신경 쓰고, 무리한 약속은 피하는 게 좋겠어요.",
    ]
}

AREA_MAPPING = {
    "비겁": "자기 주도적인 일",
    "식상": "창작이나 표현 활동",
    "재성": "재물이나 실질적인 성과",
    "관성": "직장이나 사회적 역할",
    "인성": "학습이나 내면 성장",
}

ELEMENT_AREA_MAPPING = {
    "wood": "새로운 시작과 성장",
    "fire": "열정적인 활동과 표현",
    "earth": "안정과 신뢰 구축",
    "metal": "결단력 있는 정리",
    "water": "유연한 대처와 소통",
}


def _get_deterministic_index(seed: str, max_val: int) -> int:
    h = hashlib.md5(seed.encode("utf-8")).hexdigest()
    return int(h, 16) % max_val


def generate_today_fortune(
    birth_year: int,
    birth_month: int,
    birth_day: int,
    birth_hour: int,
    birth_minute: int,
    gender: str
) -> Dict[str, str]:
    today = date.today()
    today_str = today.strftime("%Y-%m-%d")
    
    base = get_calculated_pillars(birth_year, birth_month, birth_day, birth_hour, birth_minute, gender)
    if not base:
        return {
            "today_overview": "오늘의 운세를 계산할 수 없습니다.",
            "today_love": "",
            "today_money": "",
            "today_advice": "생년월일시를 확인해주세요."
        }
    
    today_dt = datetime.now()
    today_saju = calculate_saju(today_dt.year, today_dt.month, today_dt.day, today_dt.hour, today_dt.minute)
    
    today_elements = {}
    if today_saju:
        for key in ["year_element", "month_element", "day_element", "hour_element"]:
            elem = today_saju.get(key, "")
            if elem:
                today_elements[elem] = today_elements.get(elem, 0) + 1
    
    base_counts = base.get("oheng_counts", {})
    balance_weights = compute_balance_weights(base_counts)
    
    today_counts = {}
    for elem, cnt in today_elements.items():
        elem_lower = elem.lower() if elem else ""
        if elem_lower in ["wood", "fire", "earth", "metal", "water"]:
            today_counts[elem_lower] = today_counts.get(elem_lower, 0) + cnt
    
    merged = {}
    for elem in ["wood", "fire", "earth", "metal", "water"]:
        base_val = base_counts.get(elem, 0)
        today_val = today_counts.get(elem, 0)
        merged[elem] = base_val * 0.6 + today_val * 0.4
    
    scores = compute_scores(merged, balance_weights, "general")
    overall_score = scores.get("overall", 50)
    
    seed = f"{birth_year}-{birth_month}-{birth_day}_{today_str}"
    
    dominant = dominant_elements(today_counts) if today_counts else ["earth"]
    main_element = dominant[0] if dominant else "earth"
    element_ko = ELEMENT_KO.get(main_element, "토")
    element_area = ELEMENT_AREA_MAPPING.get(main_element, "균형 잡힌 활동")

    # relation_strengths는 (오행 counts dict, 일간 오행)을 받음
    day_master = base.get("day_master", "wood") if base else "wood"
    rel = relation_strengths(base_counts, day_master) if base_counts else {}
    top_rel = max(rel, key=lambda k: rel[k]) if rel else "비겁"
    # 십신 영문→한글 매핑
    rel_to_sipsin = {"peer": "비겁", "resource": "인성", "output": "식상", "wealth": "재성", "power": "관성"}
    top_sipsin = rel_to_sipsin.get(top_rel, "비겁")
    area = AREA_MAPPING.get(top_sipsin, "일상적인 일")
    
    if overall_score >= 60:
        template_type = "good"
    elif overall_score <= 39:
        template_type = "caution"
    else:
        template_type = "neutral"
    
    templates = FORTUNE_TEMPLATES[template_type]
    idx = _get_deterministic_index(seed + "_overview", len(templates))
    overview = templates[idx].format(element=element_ko, area=area)
    
    love_templates = {
        "good": "연애운이 좋은 날이에요. 적극적인 표현이 좋은 결과를 가져올 거예요.",
        "neutral": "평온한 관계 운입니다. 상대방의 이야기에 귀 기울여보세요.",
        "caution": "감정적인 대화는 피하고, 차분하게 상대를 대해보세요."
    }
    
    money_templates = {
        "good": "재물운이 상승하는 날입니다. 좋은 기회가 찾아올 수 있어요.",
        "neutral": "지출을 줄이고 저축에 집중하기 좋은 날이에요.",
        "caution": "충동적인 소비는 피하세요. 큰 결정은 미루는 게 좋아요."
    }
    
    advice_templates = {
        "good": f"{element_ko}의 기운을 활용해 {area}에 집중해보세요.",
        "neutral": "오늘 하루는 무리하지 말고 내일을 준비하는 시간으로 활용하세요.",
        "caution": "오늘은 신중하게 행동하고, 중요한 결정은 며칠 뒤로 미루세요."
    }
    
    return {
        "today_overview": overview,
        "today_love": love_templates[template_type],
        "today_money": money_templates[template_type],
        "today_advice": advice_templates[template_type]
    }


def generate_today_fortune_from_input(birth_input) -> Dict[str, str]:
    """템플릿 기반 오늘의 운세 (동기, fallback용)"""
    try:
        y, m, d = map(int, birth_input.birth_solar.split("-"))
        hh, mm = 12, 0
        if birth_input.birth_time:
            parts = birth_input.birth_time.split(":")
            hh = int(parts[0])
            mm = int(parts[1]) if len(parts) > 1 else 0
        gender = birth_input.gender or "male"

        return generate_today_fortune(y, m, d, hh, mm, gender)
    except Exception as e:
        logger.exception("Error generating today fortune: %s", e)
        return {
            "today_overview": "오늘의 운세를 불러올 수 없습니다.",
            "today_love": "",
            "today_money": "",
            "today_advice": ""
        }


async def generate_today_fortune_ai(
    birth_input,
    model: Optional[ModelSelection] = None,
) -> Dict[str, str]:
    """오늘 운세/행운키트 AI 추론 (캐시 복원용)

    NOTE:
    - tabs.lucky의 일일 변화 필드는 캐시에 저장하지 않기 때문에,
      캐시 HIT 시 여기서 매번 재생성해서 주입한다.
    - 기존 호출부 호환을 위해 model 파라미터는 optional로 둔다.
    """
    try:
        # ------------------------------------------------------------------
        # Model selection (backward compatible defaults)
        # ------------------------------------------------------------------
        if model is None:
            today_model_id = await config_service.get_model_daily_fortune()
            today_reasoning_effort = await config_service.get_reasoning_effort_daily_fortune()
            model = ModelSelection(
                provider=get_provider_for_model(today_model_id),
                model_id=today_model_id,
                temperature=0.7,
                reasoning_effort=today_reasoning_effort,
            )

        # 1. 사주 기본 정보 파싱
        y, m, d = map(int, birth_input.birth_solar.split("-"))
        hh, mm = 12, 0
        if birth_input.birth_time:
            parts = birth_input.birth_time.split(":")
            hh = int(parts[0])
            mm = int(parts[1]) if len(parts) > 1 else 0
        gender = birth_input.gender or "male"

        # 2. 오늘 정보 + seed (일자 단위로 변화)
        today = datetime.now()
        today_saju = calculate_saju(today.year, today.month, today.day, today.hour, today.minute)
        today_day_pillar = today_saju.get("day_pillar", "") if today_saju else ""
        today_str = today.strftime("%Y년 %m월 %d일")

        # seed: 일자 단위로 변화하도록 고정
        seed = f"{birth_input.birth_solar}_{birth_input.birth_time or 'unknown'}_{birth_input.gender or 'male'}_{today.strftime('%Y-%m-%d')}"

        # 3. 사주팔자 계산
        pillars = get_calculated_pillars(y, m, d, hh, mm, gender)
        if not pillars:
            logger.error("[TODAY FORTUNE AI] 사주 계산 실패, 템플릿 fallback")
            fallback_today = generate_today_fortune(y, m, d, hh, mm, gender)
            fallback_today.update(_generate_lucky_kit_fallback(pillars={}, seed=seed))
            return fallback_today

        # 4. 사주 정보 포맷 (pillars는 문자열 형태: "乙亥(을해)")
        year_pillar = pillars.get("year", "")
        month_pillar = pillars.get("month", "")
        day_pillar = pillars.get("day", "")
        hour_pillar = pillars.get("hour", "")

        saju_str = f"년주: {year_pillar}, 월주: {month_pillar}, 일주: {day_pillar}, 시주: {hour_pillar}"

        day_master = pillars.get("day_master", "")
        oheng = pillars.get("oheng_counts", {})

        # 5. 프롬프트
        prompt = f"""당신은 한국 전통 명리학(사주팔자) 전문가입니다.
아래 사주 정보와 오늘의 일진을 바탕으로 '오늘 운세'와 '행운 키트'를 작성해주세요.

[사주 정보]
- 사주팔자: {saju_str}
- 일간(Day Master): {day_master}
- 오행 분포: 목({oheng.get('wood', 0)}) 화({oheng.get('fire', 0)}) 토({oheng.get('earth', 0)}) 금({oheng.get('metal', 0)}) 수({oheng.get('water', 0)})

[오늘 정보]
- 날짜: {today_str}
- 오늘 일진: {today_day_pillar}

[요청]
아래 JSON 형식으로만 출력하세요. 설명 없이 JSON만 출력하세요.
각 항목은 자연스럽고 친근한 말투로 작성하되, 구체적이고 실용적인 조언을 포함해주세요.

{{
    "lucky_color": "오늘의 행운 컬러 (1개)",
    "lucky_number": "행운 숫자 (1개)",
    "lucky_direction": "행운 방향 (예: 동쪽/남쪽/서쪽/북쪽/중앙)",
    "lucky_item": "행운 아이템 (일상에서 쉽게 접할 수 있는 것)",
    "power_spot": "기운이 좋은 장소 (구체적이고 일상적인 장소)",
    "today_overview": "오늘 하루 총평 (2-3문장, 일진과 사주의 관계를 바탕으로)",
    "today_love": "오늘 연애운 (1-2문장)",
    "today_money": "오늘 금전운 (1-2문장)",
    "today_advice": "오늘의 실천 조언 (1-2문장)",
    "golden_time": "오늘 최고의 시간대 (예: 14:00-16:00)",
    "dead_time": "피해야 할 시간대 (예: 09:00-11:00)",
    "food_recommendation": "오늘의 점메추 (부족한 오행 보충 음식)",
    "mission_of_day": "오늘의 미션 (구체적인 행동 1개)",
    "power_hour": "파워 타임 (집중력 최고 시간대)",
    "talisman_phrase": "오늘의 부적 문구 (마음에 새길 한 문장)"
}}"""

        # 6. LLM 호출 (유저 선택 모델 사용)
        provider = ProviderFactory.get_provider(model.provider)
        logger.info(f"[TODAY FORTUNE AI] Provider={model.provider.value}, model_id={model.model_id} 호출 시작...")

        generate_kwargs: Dict[str, Any] = {
            "prompt": prompt,
            "model_id": model.model_id,
            "temperature": model.temperature,
            "max_tokens": 2048,
            "response_format": {"type": "json_object"},
        }
        if getattr(model, "reasoning_effort", None):
            generate_kwargs["reasoning_effort"] = model.reasoning_effort

        response = await provider.generate(**generate_kwargs)

        logger.info(f"[TODAY FORTUNE AI] 응답 수신: {str(response)[:200]}...")

        # 7. JSON 파싱
        result = json.loads(response)

        # 8. fallback 보정 (누락/빈 값 최소화)
        fallback_today = generate_today_fortune(y, m, d, hh, mm, gender)
        fallback_lucky = _generate_lucky_kit_fallback(pillars=pillars, seed=seed)

        expected_keys = [
            "lucky_color",
            "lucky_number",
            "lucky_direction",
            "lucky_item",
            "power_spot",
            "today_overview",
            "today_love",
            "today_money",
            "today_advice",
            "golden_time",
            "dead_time",
            "food_recommendation",
            "mission_of_day",
            "power_hour",
            "talisman_phrase",
        ]
        for key in expected_keys:
            if key not in result or result.get(key) in (None, ""):
                if key in fallback_today:
                    result[key] = fallback_today.get(key, "")
                else:
                    result[key] = fallback_lucky.get(key, "")

        logger.info("[TODAY FORTUNE AI] 생성 완료")
        return result

    except json.JSONDecodeError as e:
        logger.exception(f"[TODAY FORTUNE AI] JSON 파싱 실패: {e}, 템플릿 fallback")
        fallback = generate_today_fortune_from_input(birth_input)
        fallback.update(_generate_lucky_kit_fallback(pillars={}, seed=f"{birth_input.birth_solar}_{birth_input.birth_time or 'unknown'}_{birth_input.gender or 'male'}_{datetime.now().strftime('%Y-%m-%d')}"))
        return fallback
    except Exception as e:
        logger.exception("[TODAY FORTUNE AI] Unexpected error, falling back to template: %s", e)
        fallback = generate_today_fortune_from_input(birth_input)
        fallback.update(_generate_lucky_kit_fallback(pillars={}, seed=f"{birth_input.birth_solar}_{birth_input.birth_time or 'unknown'}_{birth_input.gender or 'male'}_{datetime.now().strftime('%Y-%m-%d')}"))
        return fallback


def _generate_lucky_kit_fallback(pillars: Dict[str, Any], seed: str) -> Dict[str, str]:
    """LLM 실패 시 행운키트 최소값 생성 (일자 단위로 변화).

    - AI 응답이 깨졌을 때 UI가 빈값으로 무너지는 것을 방지
    - 규칙 기반으로 '부족한 오행 보충' 컨셉을 유지
    """

    oheng = pillars.get("oheng_counts", {}) if pillars else {}
    elements = ["wood", "fire", "earth", "metal", "water"]
    counts = {e: int(oheng.get(e, 0) or 0) for e in elements}
    min_val = min(counts.values()) if counts else 0
    lacking = [e for e in elements if counts.get(e, 0) == min_val] if counts else ["earth"]
    lacking_elem = lacking[_get_deterministic_index(seed + "_lacking", len(lacking))] if lacking else "earth"

    element_to_direction = {
        "wood": "동쪽",
        "fire": "남쪽",
        "earth": "중앙",
        "metal": "서쪽",
        "water": "북쪽",
    }

    element_to_numbers = {
        "wood": ["1", "2"],
        "fire": ["3", "4"],
        "earth": ["5", "6"],
        "metal": ["7", "8"],
        "water": ["9", "0"],
    }

    element_to_colors = {
        "wood": ["그린", "올리브", "민트"],
        "fire": ["레드", "코랄", "오렌지"],
        "earth": ["베이지", "브라운", "머스터드"],
        "metal": ["화이트", "실버", "그레이"],
        "water": ["네이비", "블루", "블랙"],
    }

    element_to_items = {
        "wood": ["책갈피", "식물 키링", "나무 젓가락"],
        "fire": ["립밤", "핫팩", "빨간 펜"],
        "earth": ["손수건", "텀블러", "메모지"],
        "metal": ["열쇠", "동전", "스테인리스 컵"],
        "water": ["이어폰", "물병", "우산"],
    }

    element_to_spots = {
        "wood": ["공원 산책로", "나무 많은 골목", "식물 많은 카페"],
        "fire": ["햇빛 잘 드는 창가", "따뜻한 조명 아래", "사람 많은 활기찬 공간"],
        "earth": ["정리된 책상", "서점/문구점", "조용한 라운지"],
        "metal": ["헬스장", "깨끗한 로비", "깔끔한 작업 공간"],
        "water": ["강/분수 근처", "샤워 후 화장대 앞", "조용한 음악이 있는 곳"],
    }

    element_to_food = {
        "wood": ["나물비빔밥", "샐러드", "쌈밥"],
        "fire": ["마라탕", "불고기", "매운 떡볶이"],
        "earth": ["된장찌개", "감자탕", "보쌈"],
        "metal": ["칼국수", "해물파전", "우동"],
        "water": ["냉면", "미역국", "회덮밥"],
    }

    missions = [
        "오늘은 인사 먼저 하기",
        "할 일 1개를 25분만 집중해서 끝내기",
        "물 한 컵 더 마시기",
        "불필요한 지출 1건 참기",
        "미루던 연락 1명에게 보내기",
    ]

    talismans = [
        "오늘은 나를 믿고 한 걸음만 더.",
        "급할수록 숨을 고르고, 정확하게.",
        "좋은 운은 준비한 사람에게 붙는다.",
        "작게 시작해도, 끝까지 가면 된다.",
        "내 페이스를 지키면 운이 따라온다.",
    ]

    golden_times = ["10:00-12:00", "14:00-16:00", "19:00-21:00"]
    dead_times = ["08:00-10:00", "12:00-13:00", "16:00-18:00"]
    power_hours = ["06:00-08:00", "13:00-14:00", "21:00-23:00"]

    return {
        "lucky_color": element_to_colors[lacking_elem][_get_deterministic_index(seed + "_color", len(element_to_colors[lacking_elem]))],
        "lucky_number": element_to_numbers[lacking_elem][_get_deterministic_index(seed + "_num", len(element_to_numbers[lacking_elem]))],
        "lucky_direction": element_to_direction.get(lacking_elem, "중앙"),
        "lucky_item": element_to_items[lacking_elem][_get_deterministic_index(seed + "_item", len(element_to_items[lacking_elem]))],
        "power_spot": element_to_spots[lacking_elem][_get_deterministic_index(seed + "_spot", len(element_to_spots[lacking_elem]))],
        "golden_time": golden_times[_get_deterministic_index(seed + "_gold", len(golden_times))],
        "dead_time": dead_times[_get_deterministic_index(seed + "_dead", len(dead_times))],
        "food_recommendation": element_to_food[lacking_elem][_get_deterministic_index(seed + "_food", len(element_to_food[lacking_elem]))],
        "mission_of_day": missions[_get_deterministic_index(seed + "_mission", len(missions))],
        "power_hour": power_hours[_get_deterministic_index(seed + "_power", len(power_hours))],
        "talisman_phrase": talismans[_get_deterministic_index(seed + "_talisman", len(talismans))],
    }
