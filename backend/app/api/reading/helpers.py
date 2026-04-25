"""
사주 리딩 헬퍼 유틸리티
"""
from typing import Any, Dict

from ...schemas import (
    CardData, CharacterData, ElementStats,
    TabsData, LoveTab, MoneyTab, CareerTab, StudyTab, HealthTab,
    CompatibilityTab, LifeFlowTab, DaeunTab, LuckyTab,
)

def _parse_card(data: Dict[str, Any]) -> CardData:
    """카드 데이터 파싱"""
    if not data:
        return CardData()
    
    stats = ElementStats(**data.get("stats", {})) if data.get("stats") else ElementStats()
    character = CharacterData(**data.get("character", {})) if data.get("character") else CharacterData()
    tags = data.get("tags", [])
    
    return CardData(stats=stats, character=character, tags=tags)

def _clean_text(text: str) -> str:
    """텍스트 불필요한 문자 제거"""
    if not text:
        return ""
    # 마크다운 제거나 문법 변환은 프론트엔드에서 처리하도록 원본 유지
    return text.strip().strip('"').strip("'")

def _clean_data_recursive(data: Any, skip_keys: list = None) -> Any:
    """재귀적으로 데이터를 순회하며 문자열 필드 정제"""
    if skip_keys is None:
        skip_keys = []
        
    if isinstance(data, dict):
        new_data = {}
        for k, v in data.items():
            if k in skip_keys:
                new_data[k] = v
            else:
                new_data[k] = _clean_data_recursive(v, skip_keys=None) # 하위 뎁스는 skip_keys 초기화 (혹은 전달? full_text는 최상위에만 있으므로)
        return new_data
    elif isinstance(data, list):
        return [_clean_data_recursive(item, skip_keys=None) for item in data]
    elif isinstance(data, str):
        return _clean_text(data)
    elif isinstance(data, (int, float)):
        return str(data)  # 숫자 -> 문자열 자동 변환 (Pydantic 호환성)
    else:
        return data

def _parse_tabs(data: Dict[str, Any]) -> TabsData:
    """탭 데이터 파싱"""
    if not data:
        return TabsData()
    
    # 모든 탭 데이터에 대해 정제 수행 (full_text 제외)
    # _clean_data_recursive는 인자를 deep copy하여 반환하는 효과가 있음
    # 각 키별로 개별 적용
    
    tab_keys = ['love', 'money', 'career', 'study', 'health', 'compatibility', 'life_flow', 'daeun', 'lucky']
    cleaned_tabs = {}
    
    for key in tab_keys:
        raw_tab_data = data.get(key)
        if raw_tab_data:
            # 모든 필드(full_text 포함)에 대해 동일한 정제 로직 적용
            cleaned_tabs[key] = _clean_data_recursive(raw_tab_data)
        else:
            cleaned_tabs[key] = None

    def _safe_tab(tab_cls, data, tab_name):
        if not data:
            return tab_cls() if tab_name != 'compatibility' else None
        try:
            return tab_cls(**data)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Tab '{tab_name}' parse failed, using default: {e}")
            return tab_cls() if tab_name != 'compatibility' else None

    return TabsData(
        love=_safe_tab(LoveTab, cleaned_tabs['love'], 'love'),
        money=_safe_tab(MoneyTab, cleaned_tabs['money'], 'money'),
        career=_safe_tab(CareerTab, cleaned_tabs['career'], 'career'),
        study=_safe_tab(StudyTab, cleaned_tabs['study'], 'study'),
        health=_safe_tab(HealthTab, cleaned_tabs['health'], 'health'),
        compatibility=_safe_tab(CompatibilityTab, cleaned_tabs['compatibility'], 'compatibility'),
        life_flow=_safe_tab(LifeFlowTab, cleaned_tabs['life_flow'], 'life_flow'),
        daeun=_safe_tab(DaeunTab, cleaned_tabs['daeun'], 'daeun'),
        lucky=_safe_tab(LuckyTab, cleaned_tabs['lucky'], 'lucky'),
    )


