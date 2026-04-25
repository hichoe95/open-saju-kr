"""
LLM 응답 JSON 파싱 유틸리티
"""
import json
import logging
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

MAX_INPUT_SIZE = 10_000_000


def clean_llm_json_response(text: str) -> str:
    """LLM 응답에서 순수 JSON 추출 (코드블록 제거)"""
    if not text:
        return ""
    
    cleaned = text.strip()
    
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()
    
    return cleaned


def _extract_json_boundaries(text: str) -> Optional[str]:
    """텍스트에서 JSON 객체 경계 추출 (regex 없이 - ReDoS 방지)"""
    first_brace = text.find('{')
    last_brace = text.rfind('}')
    
    if first_brace != -1 and last_brace > first_brace:
        return text[first_brace:last_brace + 1]
    return None


def _repair_incomplete_json(json_str: str) -> str:
    """스택 기반 불완전 JSON 복구 (문자열 내부 괄호 구분)"""
    stack = []
    in_string = False
    escape = False
    
    for char in json_str:
        if escape:
            escape = False
            continue
        if char == '\\' and in_string:
            escape = True
            continue
        if char == '"':
            in_string = not in_string
            continue
        if not in_string:
            if char in '{[':
                stack.append(char)
            elif char == '}' and stack and stack[-1] == '{':
                stack.pop()
            elif char == ']' and stack and stack[-1] == '[':
                stack.pop()
    
    closing = {'[': ']', '{': '}'}
    return json_str + ''.join(closing.get(c, '') for c in reversed(stack))


def parse_llm_json(text: str, max_size: int = MAX_INPUT_SIZE) -> Dict[str, Any]:
    """
    LLM 응답을 JSON으로 파싱 (여러 복구 전략 적용)
    
    1차: 직접 파싱
    2차: JSON 객체 경계 추출
    3차: 스택 기반 불완전 JSON 복구
    """
    if not text or not text.strip():
        return {}
    
    if len(text) > max_size:
        logger.warning(f"Input too large: {len(text)} bytes, truncating")
        text = text[:max_size]
    
    cleaned = clean_llm_json_response(text)
    
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, list) and parsed and isinstance(parsed[0], dict):
            return parsed[0]
        if isinstance(parsed, dict):
            return parsed
        return {}
    except json.JSONDecodeError:
        pass
    
    extracted = _extract_json_boundaries(cleaned)
    if extracted:
        try:
            return json.loads(extracted)
        except json.JSONDecodeError:
            pass
    
    try:
        repaired = _repair_incomplete_json(cleaned)
        return json.loads(repaired)
    except json.JSONDecodeError:
        pass
    
    logger.warning("All JSON parsing strategies failed")
    return {}


def safe_get_nested(data: Dict[str, Any], *keys, default: Any = None) -> Any:
    """중첩 딕셔너리에서 안전하게 값 추출"""
    current = data
    for key in keys:
        if not isinstance(current, dict):
            return default
        current = current.get(key)
        if current is None:
            return default
    return current
