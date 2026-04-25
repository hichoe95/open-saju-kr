"""
사주 리딩 캐시 재구성 로직
"""
import asyncio
import logging
from datetime import datetime
from typing import Any, Dict, Optional

from ...schemas import (
    Timeline,
    PillarsData, CardData, TabsData, MetaData, ReadingResponse,
    LoveTab, MoneyTab, CareerTab, StudyTab, HealthTab, LifeFlowTab, CompatibilityTab,
    DaeunTab, LuckyTab,
    AdvancedAnalysis, SipsinAnalysis, SipsinItem,
    GeokgukYongsin, InteractionAnalysis, InteractionItem,
    SinsalAnalysis, SinsalItem, DaeunAnalysis, DaeunItem,
    PracticalSummary,
)
from ...schemas.tabs import SajuCharacter
from ...services.seun_generator import needs_seun_update, generate_seun_ai
from ...services.today_fortune import generate_today_fortune_ai
from ...utils.flow_calculator import get_saju_character

from .helpers import _parse_card

logger = logging.getLogger(__name__)

def _reconstruct_timeline(data: Optional[Dict]) -> Timeline:
    """Timeline 객체 재구성"""
    if not data:
        return Timeline()
    return Timeline(
        past=data.get("past", ""),
        present=data.get("present", ""),
        future=data.get("future", "")
    )

def _reconstruct_tabs_from_cache(tabs_json: Dict) -> TabsData:
    """캐시된 tabs_json을 TabsData로 변환"""
    if not tabs_json:
        return TabsData()
    
    def safe_tab(cls, data):
        if not data:
            return cls()
        try:
            # Timeline 필드 처리
            if 'timeline' in data and isinstance(data['timeline'], dict):
                data['timeline'] = _reconstruct_timeline(data['timeline'])
            return cls(**data)
        except Exception as e:
            logger.warning(f"WARN: Tab reconstruction failed for {cls.__name__}: {e}")
            return cls()
    
    return TabsData(
        love=safe_tab(LoveTab, tabs_json.get('love')),
        money=safe_tab(MoneyTab, tabs_json.get('money')),
        career=safe_tab(CareerTab, tabs_json.get('career')),
        study=safe_tab(StudyTab, tabs_json.get('study')),
        health=safe_tab(HealthTab, tabs_json.get('health')),
        compatibility=safe_tab(CompatibilityTab, tabs_json.get('compatibility')) if tabs_json.get('compatibility') else None,
        life_flow=safe_tab(LifeFlowTab, tabs_json.get('life_flow')),
        daeun=safe_tab(DaeunTab, tabs_json.get('daeun')),
        lucky=safe_tab(LuckyTab, tabs_json.get('lucky'))
    )

def _reconstruct_advanced_from_cache(advanced_json: Dict) -> AdvancedAnalysis:
    """캐시된 advanced_json을 AdvancedAnalysis로 변환 (항상 유효한 객체 반환)"""
    if not advanced_json:
        # None 대신 빈 기본 객체 반환하여 UI 렌더링 보장
        logger.warning("WARN: advanced_json이 비어있음, 빈 기본 객체 반환")
        return AdvancedAnalysis(
            wonguk_summary="",
            sipsin=SipsinAnalysis(),
            interactions=InteractionAnalysis(),
            sinsal=SinsalAnalysis(),
            daeun=DaeunAnalysis(),
            practical=PracticalSummary()
        )
    
    try:
        # SipsinItem 리스트 재구성
        sipsin_dist = []
        sipsin_data = advanced_json.get('sipsin', {})
        if sipsin_data and isinstance(sipsin_data.get('distribution'), list):
            for item in sipsin_data['distribution']:
                try:
                    sipsin_dist.append(SipsinItem(**item))
                except (TypeError, ValueError) as e:
                    logger.debug(f"DEBUG: SipsinItem 파싱 실패: {e}")
        
        # InteractionItem 리스트 재구성
        interaction_items = []
        interactions_data = advanced_json.get('interactions', {})
        if interactions_data and isinstance(interactions_data.get('items'), list):
            for item in interactions_data['items']:
                try:
                    interaction_items.append(InteractionItem(**item))
                except (TypeError, ValueError) as e:
                    logger.debug(f"DEBUG: InteractionItem 파싱 실패: {e}")
        
        # SinsalItem 리스트 재구성
        sinsal_items = []
        sinsal_data = advanced_json.get('sinsal', {})
        if sinsal_data and isinstance(sinsal_data.get('items'), list):
            for item in sinsal_data['items']:
                try:
                    sinsal_items.append(SinsalItem(**item))
                except (TypeError, ValueError) as e:
                    logger.debug(f"DEBUG: SinsalItem 파싱 실패: {e}")
        
        # DaeunItem 리스트 재구성
        daeun_items = []
        daeun_data = advanced_json.get('daeun', {})
        if daeun_data and isinstance(daeun_data.get('items'), list):
            for item in daeun_data['items']:
                try:
                    daeun_items.append(DaeunItem(**item))
                except (TypeError, ValueError) as e:
                    logger.debug(f"DEBUG: DaeunItem 파싱 실패: {e}")
        
        return AdvancedAnalysis(
            wonguk_summary=advanced_json.get('wonguk_summary', ''),
            yinyang_ratio=advanced_json.get('yinyang_ratio', {"yang": 4, "yin": 4}),
            strength=advanced_json.get('strength', ''),
            day_master=advanced_json.get('day_master', ''),
            sipsin=SipsinAnalysis(
                distribution=sipsin_dist,
                dominant=sipsin_data.get('dominant', '') if sipsin_data else '',
                weak=sipsin_data.get('weak', '') if sipsin_data else '',
                core_trait=sipsin_data.get('core_trait', '') if sipsin_data else '',
                strengths=sipsin_data.get('strengths', []) if sipsin_data else [],
                risks=sipsin_data.get('risks', []) if sipsin_data else []
            ),
            geokguk_yongsin=GeokgukYongsin(**advanced_json.get('geokguk_yongsin', {})) if advanced_json.get('geokguk_yongsin') else GeokgukYongsin(),
            interactions=InteractionAnalysis(
                items=interaction_items,
                gongmang=interactions_data.get('gongmang', []) if interactions_data else [],
                gongmang_meaning=interactions_data.get('gongmang_meaning', '') if interactions_data else ''
            ),
            sinsal=SinsalAnalysis(
                items=sinsal_items,
                summary=sinsal_data.get('summary', '') if sinsal_data else ''
            ),
            daeun=DaeunAnalysis(
                direction=daeun_data.get('direction', '') if daeun_data else '',
                start_age=daeun_data.get('start_age', 0) if daeun_data else 0,
                start_basis=daeun_data.get('start_basis', '') if daeun_data else '',
                items=daeun_items
            ),
            seun=[],  # 세운은 캐시에서 제외되므로 빈 리스트
            practical=PracticalSummary(**advanced_json.get('practical', {})) if advanced_json.get('practical') else PracticalSummary(),
            time_uncertainty_note=advanced_json.get('time_uncertainty_note', '')
        )
    except Exception:
        logger.exception("Advanced analysis reconstruction failed")
        # None 대신 빈 기본 객체 반환하여 UI 렌더링 보장
        return AdvancedAnalysis(
            wonguk_summary="분석 데이터 복원 중 일부 오류가 발생했습니다.",
            sipsin=SipsinAnalysis(),
            interactions=InteractionAnalysis(),
            sinsal=SinsalAnalysis(),
            daeun=DaeunAnalysis(),
            practical=PracticalSummary()
        )

async def _reconstruct_response_from_cache(
    cache,
    request,
    settings,
    saju_image_base64: Optional[str] = None,
    saju_image_prompt: Optional[str] = None,
    latency_ms: int = 0
) -> ReadingResponse:
    """캐시에서 ReadingResponse 재구성 + 실시간 데이터 주입 (SQLAlchemy 객체용)"""
    from ...services.today_fortune import generate_today_fortune_from_input

    # 1. 기본 데이터 재구성
    pillars = PillarsData(**cache.pillars_json) if cache.pillars_json else PillarsData()
    card = _parse_card(cache.card_json) if cache.card_json else CardData()
    tabs = _reconstruct_tabs_from_cache(cache.tabs_json) if cache.tabs_json else TabsData()
    advanced = _reconstruct_advanced_from_cache(cache.advanced_json)

    # 2. [병렬화] 오늘의 운세 + 세운을 동시에 생성
    current_year = datetime.now().year
    needs_seun = needs_seun_update(advanced.seun, current_year)
    
    today_fortune_task = generate_today_fortune_ai(request.input, model=request.model)
    seun_task = generate_seun_ai(request.input) if needs_seun else None
    
    if seun_task:
        today_result, seun_result = await asyncio.gather(
            today_fortune_task,
            seun_task,
            return_exceptions=True
        )
    else:
        today_result = await today_fortune_task
        seun_result = None
    
    # 결과 처리 - today_fortune
    if isinstance(today_result, BaseException):
        logger.warning(f"WARN: today_fortune 병렬 생성 실패: {today_result}, 템플릿 fallback 사용")
        today_fortune = generate_today_fortune_from_input(request.input)
    else:
        today_fortune = today_result
    
    tabs.lucky.today_overview = today_fortune.get("today_overview", "")
    tabs.lucky.today_love = today_fortune.get("today_love", "")
    tabs.lucky.today_money = today_fortune.get("today_money", "")
    tabs.lucky.today_advice = today_fortune.get("today_advice", "")

    # Lucky Kit (daily fields)
    tabs.lucky.lucky_color = today_fortune.get("lucky_color", tabs.lucky.lucky_color)
    tabs.lucky.lucky_number = today_fortune.get("lucky_number", tabs.lucky.lucky_number)
    tabs.lucky.lucky_direction = today_fortune.get("lucky_direction", tabs.lucky.lucky_direction)
    tabs.lucky.lucky_item = today_fortune.get("lucky_item", tabs.lucky.lucky_item)
    tabs.lucky.power_spot = today_fortune.get("power_spot", tabs.lucky.power_spot)

    tabs.lucky.golden_time = today_fortune.get("golden_time", tabs.lucky.golden_time)
    tabs.lucky.dead_time = today_fortune.get("dead_time", tabs.lucky.dead_time)
    tabs.lucky.food_recommendation = today_fortune.get("food_recommendation", tabs.lucky.food_recommendation)
    tabs.lucky.mission_of_day = today_fortune.get("mission_of_day", tabs.lucky.mission_of_day)
    tabs.lucky.power_hour = today_fortune.get("power_hour", tabs.lucky.power_hour)
    tabs.lucky.talisman_phrase = today_fortune.get("talisman_phrase", tabs.lucky.talisman_phrase)
    
    if not today_fortune.get("today_overview"):
        logger.warning(f"WARN: today_fortune 생성 실패 또는 빈 응답: {today_fortune}")

    # 결과 처리 - seun
    if needs_seun and seun_result is not None:
        if isinstance(seun_result, BaseException):
            logger.warning(f"WARN: seun 병렬 생성 실패: {seun_result}")
        else:
            advanced.seun = seun_result
            logger.debug(f"DEBUG: Seun regenerated by AI for year {current_year} (parallel)")

    return ReadingResponse(
        one_liner=cache.one_liner or "",
        pillars=pillars,
        card=card,
        tabs=tabs,
        advanced_analysis=advanced,
        rendered_markdown="",
        saju_image_base64=saju_image_base64,
        saju_image_prompt=saju_image_prompt,
        meta=MetaData(
            provider=request.model.provider.value,
            model_id=request.model.model_id,
            prompt_version=settings.prompt_version,
            latency_ms=latency_ms
        )
    )

async def _reconstruct_response_from_cache_dict(
    cache_dict: Dict[str, Any],
    request,
    settings,
    saju_image_base64: Optional[str] = None,
    saju_image_prompt: Optional[str] = None,
    latency_ms: int = 0
) -> ReadingResponse:
    """캐시에서 ReadingResponse 재구성 (Supabase REST dict용)
    
    [변경] 오늘의 운세/세운 자동 생성 제거 - DailyFortuneButton(유료)으로 분리
    캐시된 데이터를 그대로 반환하며, 오늘의 운세는 별도 유료 API 통해 생성
    """
    # 기본 데이터 재구성 (캐시 그대로 사용)
    pillars_json = cache_dict.get("pillars_json")
    card_json = cache_dict.get("card_json")
    tabs_json = cache_dict.get("tabs_json")
    advanced_json: Dict[str, Any] = cache_dict.get("advanced_json") or {}
    extras = cache_dict.get("extras_json") or {}

    pillars = PillarsData(**pillars_json) if pillars_json else PillarsData()
    card = _parse_card(card_json) if card_json else CardData()
    tabs = _reconstruct_tabs_from_cache(tabs_json) if tabs_json else TabsData()
    advanced = _reconstruct_advanced_from_cache(advanced_json)

    character_data: Optional[SajuCharacter] = None
    pillars_source = pillars_json or {}
    day_pillar = pillars_source.get("day", "") if isinstance(pillars_source, dict) else ""
    if isinstance(day_pillar, str) and day_pillar:
        raw_character = get_saju_character(day_pillar[0])
        if raw_character:
            character_data = SajuCharacter(**raw_character)

    # NOTE: 오늘의 운세는 DailyFortuneButton(유료)으로 분리
    # 세운(seun)은 캐시에서 제거되므로 재생성 필요
    current_year = datetime.now().year
    if needs_seun_update(advanced.seun, current_year):
        try:
            seun_result = await generate_seun_ai(request.input)
            if seun_result:
                advanced.seun = seun_result
                logger.debug(f"DEBUG: Seun regenerated for year {current_year} (dict cache path)")
        except Exception as e:
            logger.warning(f"WARN: seun regeneration failed in dict path: {e}")

    
    return ReadingResponse(
        one_liner=cache_dict.get("one_liner", "") or "",
        pillars=pillars,
        card=card,
        saju_dna=extras.get("saju_dna"),
        hidden_personality=extras.get("hidden_personality"),
        superpower=extras.get("superpower"),
        hashtags=extras.get("hashtags"),
        famous_same_stem=extras.get("famous_same_stem"),
        yearly_predictions=extras.get("yearly_predictions"),
        character=character_data,
        tabs=tabs,
        advanced_analysis=advanced,
        rendered_markdown="",
        saju_image_base64=saju_image_base64,
        saju_image_prompt=saju_image_prompt,
        meta=MetaData(
            provider=request.model.provider.value,
            model_id=request.model.model_id,
            prompt_version=settings.prompt_version,
            latency_ms=latency_ms
        )
    )
