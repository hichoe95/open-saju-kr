import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.chat import ChatSessionCreateRequest, create_chat_session
from app.api.decision import ExtendedDecisionInput, create_decision
from app.prompt_manager import PromptManager
from app.providers.base import build_runtime_system_message
from app.schemas import BirthInput, ContextInput, ContextTopic, PersonaType
from app.services.parallel_reading import ParallelPromptManager


def _make_birth_input() -> BirthInput:
    return BirthInput(
        name="홍길동",
        birth_solar="1990-01-01",
        birth_lunar="1989-12-05",
        birth_time="14:30",
        timezone="Asia/Seoul",
        birth_place="서울",
        calendar_type="solar",
        gender="male",
        persona=PersonaType.CLASSIC,
        context=ContextInput(
            topic=ContextTopic.CAREER, details="이직 타이밍이 궁금합니다."
        ),
    )


def test_runtime_system_message_comes_from_shared_prompt_file():
    system_message = build_runtime_system_message({"type": "json_object"})

    assert "흐름이 어떻게 이어질지 자연스럽게 풀어 설명" in system_message
    assert "이야기하듯 녹여서" in system_message
    assert "사용자 프롬프트 상단에 [페르소나] 섹션이 있으면" in system_message
    assert "유효한 JSON 형식으로만 작성하세요." in system_message
    assert "가능성과 조언 중심으로 설명" not in system_message


def test_single_prompt_manager_includes_full_birth_and_context_fields():
    prompt = PromptManager().build_prompt(_make_birth_input())

    assert "이름(있으면): 홍길동" in prompt
    assert "음력 생년월일(있으면): 1989-12-05" in prompt
    assert "달력 기준: 양력" in prompt
    assert "성별: 남성" in prompt
    assert "출생지/국가: 서울" in prompt
    assert "기준 시간대: Asia/Seoul" in prompt
    assert "상담 주제: 커리어/이직" in prompt
    assert "고민 상세: 이직 타이밍이 궁금합니다." in prompt
    assert "{user_name}" not in prompt
    assert "{topic}" not in prompt
    assert "{details}" not in prompt


def test_parallel_prompt_manager_includes_full_birth_and_context_fields():
    prompt = ParallelPromptManager().build_common_context(_make_birth_input())

    assert "이름(있으면): 홍길동" in prompt
    assert "음력 생년월일(있으면): 1989-12-05" in prompt
    assert "달력 기준: 양력" in prompt
    assert "성별: 남성" in prompt
    assert "출생지/국가: 서울" in prompt
    assert "기준 시간대: Asia/Seoul" in prompt
    assert "상담 주제: 커리어/이직" in prompt
    assert "고민 상세: 이직 타이밍이 궁금합니다." in prompt
    assert "{user_name}" not in prompt
    assert "{topic}" not in prompt
    assert "{details}" not in prompt


def test_prompt_managers_default_to_classic_persona_when_missing():
    birth_input = _make_birth_input().model_copy(update={"persona": None})

    single_prompt = PromptManager().build_prompt(birth_input)
    lucky_context = ParallelPromptManager().build_lucky_context(birth_input)

    assert "[페르소나: 청학동 도인]" in single_prompt
    assert "상담 주제: 커리어/이직" in lucky_context
    assert "고민 상세: 이직 타이밍이 궁금합니다." in lucky_context
    assert "달력 기준: 양력" in lucky_context
    assert "성별: 남성" in lucky_context


def test_chat_session_creation_stores_full_birth_snapshot(monkeypatch):
    captured: dict[str, object] = {}

    async def _fake_create_session(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(id="session-1", remaining_turns=20)

    monkeypatch.setattr(
        "app.api.chat.make_birth_key", lambda _birth_input: "test-birth-key"
    )
    monkeypatch.setattr(
        "app.api.chat.chat_service.create_session", _fake_create_session
    )

    request = ChatSessionCreateRequest(
        birth_input=_make_birth_input(),
        domain="career",
        persona="classic",
        saju_context={"summary": "기존 분석 요약"},
        max_turns=20,
    )

    response = asyncio.run(
        create_chat_session(request, user_id="user-1", _rate_limit=None)
    )

    saju_context = captured["saju_context"]
    assert isinstance(saju_context, dict)
    assert response.session_id == "session-1"
    assert saju_context["name"] == "홍길동"
    assert saju_context["birth_solar"] == "1990-01-01"
    assert saju_context["birth_lunar"] == "1989-12-05"
    assert saju_context["birth_time"] == "14:30"
    assert saju_context["timezone"] == "Asia/Seoul"
    assert saju_context["birth_place"] == "서울"
    assert saju_context["calendar_type"] == "solar"
    assert saju_context["gender"] == "male"
    assert saju_context["context_topic"] == "career"
    assert saju_context["context_details"] == "이직 타이밍이 궁금합니다."


def test_decision_uses_file_backed_classic_persona_prompt(monkeypatch):
    captured: dict[str, str] = {}

    async def _fake_track(*_args, **_kwargs):
        return None

    async def _fake_get_price(*_args, **_kwargs):
        return 10

    async def _fake_charge(*_args, **_kwargs):
        return SimpleNamespace(success=True, error=None, transaction_id="tx-1")

    class _FakeProvider:
        async def generate(self, **kwargs):
            captured["prompt"] = kwargs["prompt"]
            return '{"recommendation":"wait","summary":"요약","pros":[],"cons":[],"risk_checks":[],"next_actions":[],"advice":"조언","disclaimer":"참고용"}'

    monkeypatch.setattr(
        "app.api.decision.AnalyticsService.track_analysis_event", _fake_track
    )
    monkeypatch.setattr(
        "app.api.decision.config_service.get_feature_price", _fake_get_price
    )
    monkeypatch.setattr("app.api.decision.charge_for_paid_feature", _fake_charge)
    monkeypatch.setattr(
        "app.api.decision.ProviderFactory.get_provider",
        lambda _provider: _FakeProvider(),
    )
    monkeypatch.setattr(
        "app.api.decision.config_service.get_model_decision", _async_value("saju-deep")
    )
    monkeypatch.setattr(
        "app.api.decision.config_service.get_reasoning_effort_decision",
        _async_value("medium"),
    )

    request = ExtendedDecisionInput(
        birth_input=_make_birth_input().model_copy(update={"persona": None}),
        question="지금 이직하는 게 맞을까요?",
        domain="career",
        saju_context="기존 분석 요약",
    )

    response = asyncio.run(
        create_decision(
            request,
            current_user={"id": "user-1"},
            user_id="user-1",
            _rate_limit=None,
        )
    )

    assert response.recommendation == "wait"
    assert "[페르소나: 청학동 도인]" in captured["prompt"]


def _async_value(value):
    async def _runner(*_args, **_kwargs):
        return value

    return _runner


def test_all_parallel_tab_prompts_contain_myungri_binding_skeleton():
    """모든 탭 프롬프트에 '해석의 뼈대' 명리 바인딩 섹션이 존재하는지 검증."""
    import os

    prompts_dir = os.path.join(
        os.path.dirname(__file__), os.pardir, "app", "prompts", "parallel"
    )
    prompts_dir = os.path.normpath(prompts_dir)

    # 바인딩이 추가된 탭 목록 (compatibility + 8개 도메인 탭)
    expected_tabs = [
        "tab_compatibility_v1.txt",
        "tab_love_v1.txt",
        "tab_money_v1.txt",
        "tab_career_v1.txt",
        "tab_health_v1.txt",
        "tab_study_v1.txt",
        "tab_lucky_v1.txt",
        "tab_daeun_v1.txt",
        "tab_life_flow_v1.txt",
    ]

    for tab_file in expected_tabs:
        filepath = os.path.join(prompts_dir, tab_file)
        assert os.path.exists(filepath), f"{tab_file} not found at {filepath}"

        with open(filepath, encoding="utf-8") as f:
            content = f.read()

        assert "해석의 뼈대" in content, (
            f"{tab_file}에 '해석의 뼈대' 명리 바인딩 섹션이 없습니다"
        )


def test_summary_prompts_use_specific_open_loops():
    """love/money/career 탭 summary 필드가 Open Loop 스타일 가이드를 포함하는지 검증."""
    import os

    prompts_dir = os.path.join(
        os.path.dirname(__file__), os.pardir, "app", "prompts", "parallel"
    )
    prompts_dir = os.path.normpath(prompts_dir)

    tabs_with_summary = [
        "tab_love_v1.txt",
        "tab_money_v1.txt",
        "tab_career_v1.txt",
    ]

    for tab_file in tabs_with_summary:
        filepath = os.path.join(prompts_dir, tab_file)
        assert os.path.exists(filepath), f"{tab_file} not found at {filepath}"

        with open(filepath, encoding="utf-8") as f:
            content = f.read()

        assert "Open Loop" in content, (
            f"{tab_file}의 summary 필드에 'Open Loop' 스타일 가이드가 없습니다"
        )
        assert "구체적" in content and "열린 결" in content, (
            f"{tab_file}에 구체적 표현과 열린 결 가이드가 누락되었습니다"
        )


def test_one_liner_prompt_bans_sensational_clickbait():
    """base_info_v1.txt에 선정적/자극적 clickbait 금지 패턴이 명시되어 있는지 검증."""
    import os

    filepath = os.path.join(
        os.path.dirname(__file__),
        os.pardir,
        "app",
        "prompts",
        "parallel",
        "base_info_v1.txt",
    )
    filepath = os.path.normpath(filepath)
    assert os.path.exists(filepath), f"base_info_v1.txt not found at {filepath}"

    with open(filepath, encoding="utf-8") as f:
        content = f.read()

    # 금지 패턴 섹션이 존재해야 함
    assert "BANNED PATTERNS" in content, (
        "base_info_v1.txt에 'BANNED PATTERNS' 섹션이 없습니다"
    )

    # 금지된 자극적 단어들이 명시되어 있어야 함
    banned_phrases = ["충격", "소름", "반드시", "100%"]
    for phrase in banned_phrases:
        assert phrase in content, (
            f"base_info_v1.txt에 금지 단어 '{phrase}'가 명시되지 않았습니다"
        )

    # 신뢰 중심 톤 가이드가 있어야 함
    assert "신뢰" in content and "관찰" in content, (
        "base_info_v1.txt에 신뢰 중심 관찰 톤 가이드가 없습니다"
    )
