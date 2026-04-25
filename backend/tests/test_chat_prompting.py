import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.chat_service import ChatService


PROMPTS_DIR = Path(__file__).resolve().parents[1] / "app" / "prompts"


def _read_prompt(relative_path: str) -> str:
    return (PROMPTS_DIR / relative_path).read_text(encoding="utf-8")


def test_system_prompt_prefers_signal_based_guidance():
    content = _read_prompt("system_v1.txt")

    assert "가장 가능성이 높은 흐름/리스크/대응" in content
    assert "흐름이 어떻게 이어질지 자연스럽게 풀어 설명" in content
    assert "이야기하듯 녹여서" in content
    assert "주 흐름 1개 + 대안 시나리오 1개" not in content
    assert '"가능성/리스크/운영법" 중심으로 설명' not in content


def test_common_contexts_require_scenarios_signals_and_responses():
    for relative_path in [
        "shared/common_context_v1.txt",
        "shared/common_context_upper_tabs_v1.txt",
    ]:
        content = _read_prompt(relative_path)
        assert "장면" in content or "실제 상황" in content or "실생활" in content
        assert (
            "전환 지점" in content
            or "먼저 보이는 신호" in content
            or "핵심 분기점" in content
            or "실생활 연결" in content
        )
        assert (
            "어떤 조건에서 어느 쪽으로 기울기 쉬운지" in content
            or "길흉을 딱 잘라 예언하지 말고" in content
            or "지금 어떤 흐름이 우세한지" in content
        )
        assert "주 시나리오 1개 + 대안 시나리오 1개" not in content


def test_classic_persona_keeps_traditional_tone_but_uses_plain_korean():
    content = _read_prompt("persona_classic.txt")

    assert (
        "설명은 쉬운 말이 먼저" in content
        or "어려운 말로 포장된 답변은 오히려 답이 아니라는 것을 안다" in content
    )
    assert "사자성어" in content and "가볍게" in content
    assert "지금 이 흐름 속에서 무엇을 경계하고 무엇을 붙잡아야 하는지" in content


def test_other_personas_also_gain_signal_language():
    expectations = {
        "persona_warm.txt": "그들의 이야기를 끝까지 듣는다",
        "persona_mz.txt": "직접 공략집을 만들어주는",
        "persona_witty.txt": "피하고 싶어하는 진실을 웃으면서도 받아들일 수 있게",
    }

    for relative_path, expected_phrase in expectations.items():
        content = _read_prompt(relative_path)
        assert expected_phrase in content


def test_active_chat_system_message_requests_flow_signal_and_response_structure():
    ChatService._prompt_cache.clear()

    message = ChatService._build_chat_system_message(
        {
            "persona": "classic",
            "domain": "general",
            "saju_context": {"summary": "테스트"},
            "birth_key": "1990-01-01_14_solar_male_classic",
        },
        is_first_turn=False,
    )

    assert "페르소나의 말결이 흐려지지 않게" in message
    assert "사주 구조는 필요할 때 대화 속에 녹여내세요" in message
    assert "정확한 날짜/사건/퍼센트를 단정적으로 예언하지 마세요." in message


def test_active_chat_system_message_relaxes_forced_followup_question_rule():
    ChatService._prompt_cache.clear()

    message = ChatService._build_chat_system_message(
        {
            "persona": "classic",
            "domain": "general",
            "saju_context": {"summary": "테스트"},
            "birth_key": "1990-01-01_14_solar_male_classic",
        },
        is_first_turn=False,
    )

    assert (
        "필요하다면 다음 대화로 이어갈 질문을 던질 수 있지만, 강제하지는 마세요."
        in message
    )
    assert "모든 답변을 같은 공감 문장으로 시작할 필요는 없습니다." in message


def test_chat_classic_fallback_matches_new_plain_korean_tone():
    ChatService._prompt_cache.clear()
    prompt = ChatService._get_persona_prompt("classic")

    assert (
        "설명은 쉬운 말이 먼저" in prompt
        or "어려운 말로 포장된 답변은 오히려 답이 아니라는 것을 안다" in prompt
    )
