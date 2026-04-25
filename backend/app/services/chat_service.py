import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple, cast

from fastapi import HTTPException

from ..api.payment import FEATURE_PRICES, charge_for_paid_feature, refund_on_failure
from ..db.supabase_client import db_execute, supabase
from ..providers.base import llm_call_with_retry
from ..providers.factory import ProviderFactory
from ..schemas.chat import (
    ChatHistoryResponse,
    ChatMessageResponse,
    ChatRole,
    ChatSendResponse,
    ChatSessionResponse,
    ChatStatus,
)
from ..services.config_service import config_service, get_provider_for_model
from ..utils.json_parser import parse_llm_json
from ..utils.text_postprocessor import postprocess_reading_response

logger = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"

_PERSONA_FALLBACK: Dict[str, str] = {
    "mz": """[페르소나: MZ 도사]
너는 친근하고 현대적인 감각의 MZ세대 사주 분석가야.
- 말투: 친한 형/누나가 조언해주는 느낌으로 따뜻하고 이해하기 쉽게
- 비유: 밈, 드라마, 유명인, 트렌드 자유롭게 인용
- 원칙: 단정하지 말고, 이렇기 때문에 이렇게 느껴질 수 있다는 인과관계로 설명
- 톤 예시: "야 근데 진짜 역마 에너지 뿜뿜이네? 이런 구조면 아이디어는 넘치는데 실행하다 복잡해지는 경험이 많을 듯"
""",
    "witty": """[페르소나: 위트있는 도사]
너는 재치있고 유머러스하지만 핵심은 정확히 짚어주는 도사야.
- 말투: 솔직담핳하게, 위트와 유머를 섞어서 전달
- 표현: "솔직히 말해줄게", "뭐 어쩌겠어", "근데 진짜로"
- 원칙: 긴장-증거-전환 구조. 먼저 딜레마 언급하고, 사주 구조 증거 제시, 전환 지점 덧붙이기
- 톤 예시: "솔직히 말해줄게, 이 시기에 투자하면... 음, 용기가 대단하긴 하겠다. 하지만 네 사주 구조상 이런 패턴이 있어"
""",
    "warm": """[페르소나: 따뜻한 도사]
너는 친근하고 공감해주며 응원하는 멘토 같은 도사야.
- 말투: 부드럽고 따뜻한 해요체 사용
- 표현: "걱정 마세요", "충분히 잘하고 있어요", "당신의 강점은..."
- 원칙: 관찰로 시작. 사용자의 뉘앙스를 짚어주며 시작. 원인-결과 설명으로 신뢰 구축
- 톤 예시: "걱정이 많으시죠? 충분히 이해해요. 당신의 사주를 볼 때, 이런 구조 때문에 이렇게 느껴지실 수 있어요"
""",
    "classic": """[페르소나: 청학동 도인]
너는 오래 공부한 스승처럼 차분하고 분명하게 말하는 전통 도사야.
- 말투: 격식 있는 경어체, 짧거나 중간 길이의 맑은 문장
- 원칙: 관찰로 시작하여 사주에서 먼저 보이는 패턴 짚기. 설명을 통한 신뢰 구축
- 표현: 흐름을 먼저 짚고, 먼저 보이는 신호와 대응을 함께 설명
- 톤 예시: "지금은 성급히 밀어붙이기보다 흐름을 먼저 살필 때입니다. 이런 구조이기 때문에, 사람과 일의 반응이 조금씩 붙기 시작하면 그때는 움직여도 늦지 않습니다."
""",
}

DOMAIN_CONTEXT: Dict[str, str] = {
    "general": "일반적인 인생 고민",
    "compatibility": "궁합, 관계, 인연에 대한 고민",
    "love": "연애, 썸, 관계에 대한 고민",
    "money": "금전, 투자, 재테크에 대한 고민",
    "career": "이직, 취업, 커리어에 대한 고민",
    "study": "학업, 시험, 진로에 대한 고민",
    "health": "건강에 대한 고민",
}


class ChatService:
    _prompt_cache: Dict[str, str] = {}

    @classmethod
    def _load_prompt_template(cls, filename: str) -> str:
        if filename in cls._prompt_cache:
            return cls._prompt_cache[filename]

        filepath = PROMPTS_DIR / filename
        try:
            content = filepath.read_text(encoding="utf-8")
            cls._prompt_cache[filename] = content
            return content
        except Exception:
            logger.exception("[CHAT] 프롬프트 로드 실패: %s", filename)
            return ""

    @staticmethod
    def _chunk_fallback_stream_text(content: str) -> List[str]:
        chunks: List[str] = []
        buffer = ""
        soft_breaks = {" ", "\n", ".", ",", "?", "!", ":", ";"}

        for char in content:
            buffer += char
            if len(buffer) >= 20 and char in soft_breaks:
                chunks.append(buffer)
                buffer = ""
            elif len(buffer) >= 36:
                chunks.append(buffer)
                buffer = ""

        if buffer:
            chunks.append(buffer)

        return chunks or [content]

    @staticmethod
    def _normalize_persona(persona: str | None) -> str:
        normalized = (persona or "classic").strip().lower()
        return normalized if normalized in _PERSONA_FALLBACK else "classic"

    @classmethod
    def _get_persona_prompt(cls, persona: str | None) -> str:
        normalized = cls._normalize_persona(persona)
        filename = f"persona_{normalized}.txt"
        content = cls._load_prompt_template(filename)
        if content:
            return content
        return _PERSONA_FALLBACK.get(normalized, _PERSONA_FALLBACK["classic"])

    @staticmethod
    def _stringify_saju_context(saju_context: Any) -> str:
        if saju_context is None:
            return "분석 정보 없음"

        if isinstance(saju_context, str):
            stripped = saju_context.strip()
            return stripped if stripped else "분석 정보 없음"

        if isinstance(saju_context, (dict, list)):
            if not saju_context:
                return "분석 정보 없음"
            try:
                return json.dumps(saju_context, ensure_ascii=False)
            except TypeError:
                return str(saju_context)

        return str(saju_context)

    @staticmethod
    def _shorten_text(text: str, limit: int = 220) -> str:
        normalized = " ".join(text.split())
        if len(normalized) <= limit:
            return normalized
        return f"{normalized[:limit].rstrip()}..."

    @classmethod
    def _message_content_for_context(
        cls, row: Dict[str, Any], shorten: int | None = None
    ) -> str:
        content = str(row.get("content", ""))
        response_format = str(row.get("response_format", "freeform"))

        if response_format == "decision":
            parsed = parse_llm_json(content)
            if parsed:
                content = json.dumps(parsed, ensure_ascii=False)

        if shorten is not None:
            return cls._shorten_text(content, limit=shorten)
        return content

    @classmethod
    def _build_history_summary_and_recent(
        cls,
        history_rows: List[Dict[str, Any]],
        max_turn_window: int = 5,
    ) -> Tuple[str, str]:
        if not history_rows:
            return "이전 대화 없음", "이전 대화 없음"

        turns = sorted(
            {
                int(row.get("turn", 0))
                for row in history_rows
                if row.get("role") in {ChatRole.user.value, ChatRole.assistant.value}
            }
        )

        if not turns:
            return "이전 대화 없음", "이전 대화 없음"

        if len(turns) <= max_turn_window:
            summary_turns: set[int] = set()
            recent_turns = set(turns)
        else:
            summary_turns = set(turns[:-max_turn_window])
            recent_turns = set(turns[-max_turn_window:])

        older_rows = [
            row for row in history_rows if int(row.get("turn", 0)) in summary_turns
        ]
        recent_rows = [
            row for row in history_rows if int(row.get("turn", 0)) in recent_turns
        ]

        history_summary = "오래된 대화 없음"
        if older_rows:
            grouped: Dict[int, Dict[str, str]] = {}
            for row in older_rows:
                turn = int(row.get("turn", 0))
                role = str(row.get("role", ""))
                grouped.setdefault(turn, {})[role] = cls._message_content_for_context(
                    row, shorten=180
                )

            lines: List[str] = []
            for turn in sorted(grouped.keys()):
                user_text = grouped[turn].get(
                    ChatRole.user.value, "(사용자 메시지 없음)"
                )
                assistant_text = grouped[turn].get(
                    ChatRole.assistant.value,
                    "(도사 답변 없음)",
                )
                lines.append(
                    f"- Turn {turn}: 사용자='{user_text}' | 도사='{assistant_text}'"
                )
            history_summary = "\n".join(lines)

        recent_lines: List[str] = []
        for row in recent_rows:
            turn = int(row.get("turn", 0))
            role = "사용자" if row.get("role") == ChatRole.user.value else "도사"
            content = cls._message_content_for_context(row, shorten=1200)
            recent_lines.append(f"Turn {turn} {role}: {content}")
        recent_history = "\n".join(recent_lines) if recent_lines else "이전 대화 없음"

        return history_summary, recent_history

    @staticmethod
    def _extract_birth_info_from_session(session_row: Dict[str, Any]) -> str:
        saju_context = session_row.get("saju_context")
        if isinstance(saju_context, dict):
            birth_solar = str(saju_context.get("birth_solar") or "").strip()
            birth_time = str(saju_context.get("birth_time") or "").strip()
            calendar_type = str(saju_context.get("calendar_type") or "solar").strip()
            gender = str(saju_context.get("gender") or "").strip()
            if birth_solar:
                hour_label = f" {birth_time}시" if birth_time else ""
                extra = ", ".join([x for x in [calendar_type, gender] if x])
                return (
                    f"{birth_solar}{hour_label} ({extra})"
                    if extra
                    else f"{birth_solar}{hour_label}"
                )

        birth_key = str(session_row.get("birth_key", "")).strip()
        if not birth_key:
            return "정보 없음"

        if len(birth_key) == 64 and all(
            ch in "0123456789abcdef" for ch in birth_key.lower()
        ):
            return "보호된 출생정보(사주 맥락 참조)"

        parts = birth_key.split("_")
        if len(parts) >= 4:
            birth_date, hour, calendar, gender = parts[:4]
            return f"{birth_date} {hour}시 ({calendar}, {gender})"
        return "사주 맥락 참조"

    @staticmethod
    def _normalize_birth_time_for_match(raw_value: Any) -> str:
        normalized = str(raw_value or "").strip()
        if not normalized:
            return ""
        if ":" in normalized:
            normalized = normalized.split(":", 1)[0].strip()
        return normalized.zfill(2) if normalized.isdigit() else normalized

    @classmethod
    def _matches_birth_context(
        cls,
        session_row: Dict[str, Any],
        birth_context: Dict[str, str],
    ) -> bool:
        saju_context = session_row.get("saju_context")
        if not isinstance(saju_context, dict):
            return False

        session_birth_solar = str(saju_context.get("birth_solar") or "").strip()
        session_birth_time = cls._normalize_birth_time_for_match(
            saju_context.get("birth_time")
        )
        session_gender = str(saju_context.get("gender") or "").strip().lower()
        session_calendar_type = (
            str(saju_context.get("calendar_type") or "solar").strip().lower()
        )
        target_birth_time = cls._normalize_birth_time_for_match(
            birth_context.get("birth_time", "")
        )

        return (
            session_birth_solar == birth_context.get("birth_solar", "")
            and session_birth_time == target_birth_time
            and session_gender == birth_context.get("gender", "")
            and session_calendar_type == birth_context.get("calendar_type", "solar")
        )

    @classmethod
    def _build_chat_system_message(
        cls,
        session_row: Dict[str, Any],
        is_first_turn: bool = False,
    ) -> str:
        persona_prompt = cls._get_persona_prompt(
            str(session_row.get("persona", "classic"))
        )
        saju_context = cls._stringify_saju_context(session_row.get("saju_context"))
        domain = str(session_row.get("domain", "general"))
        domain_name = DOMAIN_CONTEXT.get(domain, "일반적인 고민")
        birth_info = cls._extract_birth_info_from_session(session_row)

        kst = datetime.now(timezone.utc) + timedelta(hours=9)
        current_time_str = kst.strftime("%Y년 %m월 %d일 %H시 %M분")

        turn_instruction = ""
        if is_first_turn:
            turn_instruction = """이것은 사용자와의 첫 대화입니다.
첫 만남이라는 사실은 기억하되, 페르소나가 원래 말을 꺼내는 방식으로 자연스럽게 시작하세요.
사주 맥락은 필요할 때 꺼내고, 사람을 먼저 보는 태도는 잃지 마세요."""
        else:
            turn_instruction = """이것은 멀티턴 대화의 후속 턴입니다.
이전 대화를 억지로 요약하지 말고, 지금 이어지는 대화처럼 자연스럽게 답하세요.
페르소나의 말결이 흐려지지 않게 하되, 반복 설명은 피하세요."""

        return f"""{persona_prompt}

당신은 사주 상담을 제공하는 AI 도사입니다.
중요: 위 [페르소나] 지침의 말투와 톤을 끝까지 유지하세요.
{turn_instruction}

[현재 시각]
{current_time_str}

[사용자 정보]
- 생년월일시: {birth_info}
- 상담 분야: {domain_name}

[사주 분석 맥락]
{saju_context}

[대화 흐름]
사용자가 지금 눈앞에서 대화하고 있다고 느끼게, 자연스러운 대화체로 답하세요. 사주 맥락을 근거로 들려주되, 해설서가 아닌 대화 상대로서의 입장을 유지하세요. 필요하다면 다음 대화로 이어갈 질문을 던질 수 있지만, 강제하지는 마세요.
- 반드시 한국어 자유형 마크다운 텍스트로만 응답하세요.
- JSON, 코드블록, 키-값 포맷을 사용하지 마세요.
- 사용자가 요청하지 않으면 소제목/번호/불릿을 만들지 마세요.
- 기본은 짧은 문단 2~5개로 답하고, 문단 안에서 부드럽게 연결하세요.

[핵심 원칙]
- 페르소나의 말투와 톤이 응답 전체에 자연스럽게 스며들도록 하세요.
- 사주 구조는 필요할 때 대화 속에 녹여내세요. 해설체로 설명하기보다, 그 사람의 입장에서 들려주듯 풀어주세요.
- 사용자의 뉘앙스나 감정을 읽되, 모든 답변을 같은 공감 문장으로 시작할 필요는 없습니다.
- "이렇다"고 단정하기보다, "이렇기 때문에 이렇게 느껴질 수 있다"는 인과를 풀어주세요.
- 현실적이고 구체적인 관찰 포인트나 다음 행동은 도움이 될 때만 제안하세요.
- 정확한 날짜/사건/퍼센트를 단정적으로 예언하지 마세요.
- 의료/법률/투자 판단을 직접 지시하는 표현은 피하세요.

[금지]
- 보고서체/강의체/평가서체 문장을 쓰지 마세요.
- "요약", "장점", "단점", "실행 계획" 같은 섹션 제목을 만들지 마세요.
- 같은 문장을 반복하거나 장황하게 길게 늘이지 마세요.
- JSON 형식으로 응답하지 마세요."""

    @classmethod
    def _build_chat_messages(
        cls,
        session_row: Dict[str, Any],
        question: str,
        history_rows: List[Dict[str, Any]] | None = None,
    ) -> List[Dict[str, str]]:
        is_first_turn = not history_rows
        system_msg = cls._build_chat_system_message(
            session_row, is_first_turn=is_first_turn
        )

        messages: List[Dict[str, str]] = [{"role": "system", "content": system_msg}]

        if history_rows:
            for row in history_rows:
                role = row.get("role")
                if role in (ChatRole.user.value, ChatRole.assistant.value):
                    content = cls._message_content_for_context(row, shorten=1500)
                    messages.append({"role": str(role), "content": content})

        messages.append({"role": "user", "content": question})
        return messages

    async def _cleanup_turn_messages(self, session_id: str, turn: int) -> None:
        try:
            await db_execute(
                lambda: (
                    supabase.table("chat_messages")
                    .delete()
                    .eq("session_id", session_id)
                    .eq("turn", turn)
                    .execute()
                )
            )
        except Exception:
            logger.warning(
                "[CHAT] 턴 메시지 정리 실패: session_id=%s turn=%s", session_id, turn
            )

    async def _rollback_failed_stream_turn(
        self,
        *,
        session_id: str,
        user_id: str,
        target_turn: int | None,
        turn_reserved: bool,
        reserved_from_turn: int | None,
        charged_transaction_id: str | None,
        is_regenerate: bool,
        response_persisted: bool,
        refund_reason: str,
    ) -> bool:
        refunded = False

        if target_turn is not None and not response_persisted and not is_regenerate:
            await self._cleanup_turn_messages(session_id, target_turn)

        if charged_transaction_id and not is_regenerate and not response_persisted:
            refunded = await refund_on_failure(
                user_id,
                charged_transaction_id,
                refund_reason,
            )

        if (
            turn_reserved
            and not response_persisted
            and reserved_from_turn is not None
            and target_turn is not None
        ):
            await db_execute(
                lambda: (
                    supabase.table("chat_sessions")
                    .update({"current_turn": reserved_from_turn})
                    .eq("id", session_id)
                    .eq("user_id", user_id)
                    .eq("current_turn", target_turn)
                    .execute()
                )
            )

        return refunded

    # Legacy - kept for backward compatibility
    @classmethod
    def _build_turn1_prompt(cls, session_row: Dict[str, Any], question: str) -> str:
        kst = datetime.now(timezone.utc) + timedelta(hours=9)
        current_time_str = kst.strftime("%Y년 %m월 %d일 %H시 %M분")
        persona_prompt = cls._get_persona_prompt(
            str(session_row.get("persona", "classic"))
        )
        domain = str(session_row.get("domain", "general"))
        domain_name = DOMAIN_CONTEXT.get(domain, "일반적인 고민")
        saju_context_text = cls._stringify_saju_context(session_row.get("saju_context"))
        birth_info = cls._extract_birth_info_from_session(session_row)

        return f"""{persona_prompt}

사용자의 사주 정보와 이전 분석 결과를 참고하여, 구체적인 질문에 대해 실질적인 조언을 제공해주세요.
중요: 위 [페르소나] 지침의 말투와 톤을 철저히 따라 응답하세요.

[현재 시각 (기준)]
{current_time_str}

[사용자 기본 정보]
- 생년월일시: {birth_info}

[이전 사주 분석 맥락]
{saju_context_text}

[질문 분야]
{domain_name}

[사용자의 구체적 질문]
{question}

---

위 정보를 기반으로 아래 JSON 형식으로 답변해주세요.
모든 내용은 한국어로 작성하고, 사주 분석 결과를 참고하여 맞춤형 조언을 제공하세요.

{{
  "recommendation": "go" 또는 "wait" 또는 "no" (go: 진행해도 좋음, wait: 조금 기다려볼 것, no: 재고 필요),
  "summary": "결론을 1-2문장으로 요약",
  "pros": ["이 결정의 장점/기회 3개"],
  "cons": ["이 결정의 단점/리스크 3개"],
  "risk_checks": ["주의해야 할 점 2-3개"],
  "next_actions": ["당장 해야 할 구체적인 행동 2-3개"],
  "advice": "도사가 사용자에게 직접 말하듯이 건네는 조언. (3~5문장, 위 [페르소나] 지침의 말투/톤을 정확히 반영하여 작성)",
  "disclaimer": "사주는 참고용이며 최종 결정은 본인의 판단에 따르세요."
}}

응답은 반드시 유효한 JSON 형식으로만 작성하세요. 마크다운 코드블록을 사용하지 마세요.
"""

    @classmethod
    def _build_followup_prompt(
        cls,
        session_row: Dict[str, Any],
        question: str,
        history_summary: str,
        recent_history: str,
    ) -> str:
        template = cls._load_prompt_template("chat_followup.txt")
        if not template:
            persona_prompt = cls._get_persona_prompt(
                str(session_row.get("persona", "classic"))
            )
            saju_context = cls._stringify_saju_context(session_row.get("saju_context"))
            return (
                f"{persona_prompt}\n\n"
                f"[사주 컨텍스트]\n{saju_context}\n\n"
                f"[이전 대화 요약]\n{history_summary}\n\n"
                f"[최근 대화 기록]\n{recent_history}\n\n"
                f"[사용자 새 질문]\n{question}\n\n"
                "JSON이 아닌 자유형 마크다운 텍스트로 답변하세요."
            )

        replacements = {
            "{persona_prompt}": cls._get_persona_prompt(
                str(session_row.get("persona", "classic"))
            ),
            "{saju_context}": cls._stringify_saju_context(
                session_row.get("saju_context")
            ),
            "{history_summary}": history_summary,
            "{recent_history}": recent_history,
            "{question}": question,
        }

        prompt = template
        for placeholder, value in replacements.items():
            prompt = prompt.replace(placeholder, value)
        return prompt

    # Legacy - kept for backward compatibility
    @staticmethod
    def _normalize_decision_payload(data: Dict[str, Any]) -> Dict[str, Any]:
        def _to_str_list(value: Any, limit: int) -> List[str]:
            if not isinstance(value, list):
                return []
            output: List[str] = []
            for item in value:
                text = str(item).strip()
                if text:
                    output.append(text)
                if len(output) >= limit:
                    break
            return output

        recommendation = str(data.get("recommendation", "wait")).strip().lower()
        if recommendation not in {"go", "wait", "no"}:
            recommendation = "wait"

        return {
            "recommendation": recommendation,
            "summary": str(data.get("summary", "")).strip(),
            "pros": _to_str_list(data.get("pros"), 3),
            "cons": _to_str_list(data.get("cons"), 3),
            "risk_checks": _to_str_list(data.get("risk_checks"), 3),
            "next_actions": _to_str_list(data.get("next_actions"), 3),
            "advice": str(data.get("advice", "")).strip(),
            "disclaimer": str(
                data.get(
                    "disclaimer",
                    "사주는 참고용이며 최종 결정은 본인의 판단에 따르세요.",
                )
            ).strip(),
        }

    # Legacy - kept for backward compatibility
    @staticmethod
    async def _call_decision_llm(prompt: str) -> Dict[str, Any]:
        model_id = await config_service.get_model_decision()
        reasoning_effort = await config_service.get_reasoning_effort_decision()
        provider = ProviderFactory.get_provider(get_provider_for_model(model_id))

        response_text = await llm_call_with_retry(
            provider.generate,
            prompt=prompt,
            model_id=model_id,
            temperature=0.7,
            response_format={"type": "json_object"},
            reasoning_effort=reasoning_effort,
        )
        parsed = parse_llm_json(response_text)
        if not parsed:
            logger.error("[CHAT] Turn1 JSON parsing failed: %s", response_text[:500])
            raise HTTPException(
                status_code=500, detail="AI 응답 형식이 올바르지 않습니다"
            )
        processed = postprocess_reading_response(parsed)
        if not isinstance(processed, dict):
            raise HTTPException(status_code=500, detail="AI 응답 처리에 실패했습니다")
        return ChatService._normalize_decision_payload(processed)

    @staticmethod
    async def _call_followup_llm(prompt: str) -> str:
        model_id = await config_service.get_model_decision()
        reasoning_effort = await config_service.get_reasoning_effort_decision()
        provider = ProviderFactory.get_provider(get_provider_for_model(model_id))

        response_text = await llm_call_with_retry(
            provider.generate,
            prompt=prompt,
            model_id=model_id,
            temperature=0.7,
            reasoning_effort=reasoning_effort,
        )
        cleaned = response_text.strip()
        if not cleaned:
            raise HTTPException(status_code=500, detail="AI 후속 답변이 비어 있습니다")
        return cleaned

    @staticmethod
    def _coerce_datetime(value: Any) -> datetime:
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            normalized = value.strip()
            if normalized:
                try:
                    parsed = datetime.fromisoformat(normalized.replace("Z", "+00:00"))
                    if parsed.tzinfo is None:
                        return parsed.replace(tzinfo=timezone.utc)
                    return parsed
                except ValueError:
                    pass
        return datetime.now(timezone.utc)

    @staticmethod
    def _to_session_response(row: Dict[str, Any]) -> ChatSessionResponse:
        max_turns = int(row.get("max_turns", 20))
        current_turn = int(row.get("current_turn", 0))
        remaining_turns = max(0, max_turns - current_turn)
        return ChatSessionResponse(
            id=str(row.get("id")),
            user_id=str(row.get("user_id")),
            birth_key=str(row.get("birth_key", "")),
            domain=str(row.get("domain", "general")),
            persona=str(row.get("persona", "classic")),
            status=ChatStatus(str(row.get("status", ChatStatus.active.value))),
            max_turns=max_turns,
            current_turn=current_turn,
            remaining_turns=remaining_turns,
            created_at=ChatService._coerce_datetime(row.get("created_at")),
            updated_at=ChatService._coerce_datetime(row.get("updated_at")),
        )

    @staticmethod
    def _parse_message_content(response_format: str, content: str) -> dict | str:
        if response_format == "decision":
            try:
                parsed = json.loads(content)
                if isinstance(parsed, dict):
                    return parsed
            except json.JSONDecodeError:
                logger.warning("[CHAT] decision content JSON 파싱 실패, 원문 반환")
        return content

    @classmethod
    def _to_message_response(cls, row: Dict[str, Any]) -> ChatMessageResponse:
        response_format = str(row.get("response_format", "freeform"))
        content = str(row.get("content", ""))
        parsed_content = cls._parse_message_content(response_format, content)
        return ChatMessageResponse(
            id=str(row.get("id")),
            session_id=str(row.get("session_id")),
            turn=int(row.get("turn", 0)),
            role=ChatRole(str(row.get("role", ChatRole.user.value))),
            content=parsed_content,
            response_format=response_format,
            tokens_used=int(row.get("tokens_used", 0)),
            cost_coins=int(row.get("cost_coins", 0)),
            created_at=ChatService._coerce_datetime(row.get("created_at")),
        )

    async def create_session(
        self,
        user_id: str,
        birth_key: str,
        domain: str,
        persona: str,
        saju_context: Dict[str, Any],
        max_turns: int = 20,
    ) -> ChatSessionResponse:
        payload = {
            "user_id": user_id,
            "birth_key": birth_key,
            "domain": domain,
            "persona": persona,
            "saju_context": saju_context,
            "status": ChatStatus.active.value,
            "max_turns": max_turns,
            "current_turn": 0,
        }

        try:
            result = await db_execute(
                lambda: supabase.table("chat_sessions").insert(payload).execute()
            )
            if not result.data:
                raise HTTPException(status_code=500, detail="세션 생성에 실패했습니다")
            first_row = result.data[0]
            if not isinstance(first_row, dict):
                raise HTTPException(
                    status_code=500, detail="세션 데이터 형식이 올바르지 않습니다"
                )
            return self._to_session_response(cast(Dict[str, Any], first_row))
        except HTTPException:
            raise
        except Exception:
            logger.exception("[CHAT] create_session 실패")
            raise HTTPException(
                status_code=500, detail="세션 생성 중 오류가 발생했습니다"
            )

    async def get_sessions(
        self,
        user_id: str,
        limit: int = 10,
        birth_key: str | None = None,
        birth_context: Dict[str, str] | None = None,
    ) -> List[ChatSessionResponse]:
        try:
            query = supabase.table("chat_sessions").select("*").eq("user_id", user_id)
            if birth_key and not birth_context:
                query = query.eq("birth_key", birth_key)

            result = await db_execute(
                lambda: (
                    query.order("updated_at", desc=True)
                    .limit(max(limit * 5, 50))
                    .execute()
                )
            )
            rows = result.data if isinstance(result.data, list) else []
            filtered = [
                row
                for row in rows
                if isinstance(row, dict)
                and row.get("status") in {"active", "completed"}
            ]
            if birth_context:
                filtered = [
                    row
                    for row in filtered
                    if self._matches_birth_context(row, birth_context)
                    or (birth_key and str(row.get("birth_key") or "") == birth_key)
                ]
            return [self._to_session_response(row) for row in filtered[:limit]]
        except Exception:
            logger.exception("[CHAT] get_sessions 실패")
            raise HTTPException(
                status_code=500, detail="세션 목록 조회 중 오류가 발생했습니다"
            )

    async def _get_session_row(self, user_id: str, session_id: str) -> Dict[str, Any]:
        result = await db_execute(
            lambda: (
                supabase.table("chat_sessions")
                .select("*")
                .eq("id", session_id)
                .eq("user_id", user_id)
                .limit(1)
                .execute()
            )
        )
        rows = result.data if isinstance(result.data, list) else []
        if not rows:
            raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다")
        row = rows[0]
        if not isinstance(row, dict):
            raise HTTPException(
                status_code=500, detail="세션 데이터 형식이 올바르지 않습니다"
            )
        return row

    async def get_session(self, user_id: str, session_id: str) -> ChatHistoryResponse:
        try:
            session_row = await self._get_session_row(user_id, session_id)
            message_result = await db_execute(
                lambda: (
                    supabase.table("chat_messages")
                    .select("*")
                    .eq("session_id", session_id)
                    .order("created_at", desc=False)
                    .execute()
                )
            )
            message_rows = (
                message_result.data if isinstance(message_result.data, list) else []
            )
            messages = [
                self._to_message_response(row)
                for row in message_rows
                if isinstance(row, dict)
            ]
            return ChatHistoryResponse(
                session=self._to_session_response(session_row),
                messages=messages,
            )
        except HTTPException:
            raise
        except Exception:
            logger.exception("[CHAT] get_session 실패")
            raise HTTPException(
                status_code=500, detail="세션 조회 중 오류가 발생했습니다"
            )

    @staticmethod
    def _validate_active_session_or_raise(
        session_row: Dict[str, Any],
    ) -> Tuple[int, int]:
        status = str(session_row.get("status", ChatStatus.active.value))
        current_turn = int(session_row.get("current_turn", 0))
        max_turns = int(session_row.get("max_turns", 20))

        if status != ChatStatus.active.value:
            raise HTTPException(status_code=400, detail="비활성 세션입니다")
        if current_turn >= max_turns:
            raise HTTPException(status_code=400, detail="최대 턴 수를 초과했습니다")
        return current_turn, max_turns

    async def _get_context_history_rows(
        self, session_id: str, current_turn: int
    ) -> List[Dict[str, Any]]:
        if current_turn <= 0:
            return []

        result = await db_execute(
            lambda: (
                supabase.table("chat_messages")
                .select("*")
                .eq("session_id", session_id)
                .in_("role", [ChatRole.user.value, ChatRole.assistant.value])
                .lte("turn", current_turn)
                .order("created_at", desc=False)
                .execute()
            )
        )
        rows = result.data if isinstance(result.data, list) else []
        return [row for row in rows if isinstance(row, dict)]

    @staticmethod
    def _get_chat_feature_key_for_turn(current_turn: int) -> str:
        return "ai_chat" if current_turn == 0 else "ai_chat_followup"

    @staticmethod
    def _is_payment_shortage_error(error_text: str) -> bool:
        normalized = error_text.upper()
        return (
            "INSUFFICIENT_BALANCE" in normalized
            or "WALLET_NOT_FOUND" in normalized
            or "부족" in error_text
        )

    async def _charge_chat_turn(
        self,
        user_id: str,
        session_id: str,
        current_turn: int,
    ) -> Tuple[int, str | None]:
        feature_key = self._get_chat_feature_key_for_turn(current_turn)
        default_price = int(FEATURE_PRICES.get(feature_key, 20))
        price = await config_service.get_feature_price(feature_key, default_price)
        description = "AI 도사 상담" if current_turn == 0 else "AI 도사 후속 상담"
        reference_id = f"chat:{session_id}:turn:{current_turn + 1}"

        payment = await charge_for_paid_feature(
            user_id=user_id,
            feature_key=feature_key,
            price=price,
            description=description,
            reference_id=reference_id,
        )

        if not payment.success:
            error_text = payment.error or "결제 처리 실패"
            if self._is_payment_shortage_error(error_text):
                raise HTTPException(status_code=402, detail=error_text)
            raise HTTPException(status_code=400, detail=error_text)

        if payment.is_free:
            return 0, None

        transaction_id = payment.transaction_id

        if not transaction_id:
            raise HTTPException(
                status_code=500, detail="결제 거래 ID를 찾을 수 없습니다"
            )

        return price, transaction_id

    async def send_message(
        self,
        user_id: str,
        session_id: str,
        content: str,
        role: ChatRole = ChatRole.user,
    ) -> ChatSendResponse:
        charged_transaction_id: str | None = None
        charged_amount = 0
        response_persisted = False
        next_turn: int | None = None
        turn_reserved = False
        reserved_from_turn: int | None = None
        reserved_session_row: Dict[str, Any] | None = None

        try:
            normalized_content = content.strip()
            if role != ChatRole.system and not normalized_content:
                raise HTTPException(
                    status_code=400, detail="메시지 내용이 비어 있습니다"
                )

            session_row = await self._get_session_row(user_id, session_id)
            current_turn, _max_turns = self._validate_active_session_or_raise(
                session_row
            )

            if role == ChatRole.system:
                system_result = await db_execute(
                    lambda: (
                        supabase.table("chat_messages")
                        .insert(
                            {
                                "session_id": session_id,
                                "turn": current_turn,
                                "role": ChatRole.system.value,
                                "content": normalized_content,
                                "response_format": "system",
                                "tokens_used": 0,
                                "cost_coins": 0,
                            }
                        )
                        .execute()
                    )
                )
                if not system_result.data:
                    raise HTTPException(
                        status_code=500, detail="시스템 메시지 저장에 실패했습니다"
                    )
                system_row = system_result.data[0]
                if not isinstance(system_row, dict):
                    raise HTTPException(
                        status_code=500,
                        detail="시스템 메시지 데이터 형식이 올바르지 않습니다",
                    )
                typed_system_row = cast(Dict[str, Any], system_row)

                return ChatSendResponse(
                    message=self._to_message_response(typed_system_row),
                    session=self._to_session_response(session_row),
                    coins_spent=0,
                )

            next_turn = current_turn + 1
            reserved_from_turn = current_turn

            reserve_result = await db_execute(
                lambda: (
                    supabase.table("chat_sessions")
                    .update({"current_turn": next_turn})
                    .eq("id", session_id)
                    .eq("user_id", user_id)
                    .eq("status", ChatStatus.active.value)
                    .eq("current_turn", current_turn)
                    .execute()
                )
            )
            if not reserve_result.data:
                raise HTTPException(
                    status_code=409,
                    detail="다른 요청이 처리 중입니다. 잠시 후 다시 시도해주세요.",
                )
            first_reserved_row = reserve_result.data[0]
            if not isinstance(first_reserved_row, dict):
                raise HTTPException(
                    status_code=500, detail="세션 예약 데이터 형식이 올바르지 않습니다"
                )
            reserved_session_row = cast(Dict[str, Any], first_reserved_row)
            turn_reserved = True

            charged_amount, charged_transaction_id = await self._charge_chat_turn(
                user_id=user_id,
                session_id=session_id,
                current_turn=current_turn,
            )

            if current_turn == 0:
                chat_messages = self._build_chat_messages(
                    session_row, normalized_content
                )
            else:
                history_rows = await self._get_context_history_rows(
                    session_id, current_turn
                )
                chat_messages = self._build_chat_messages(
                    session_row,
                    normalized_content,
                    history_rows,
                )

            model_id = await config_service.get_model_decision()
            reasoning_effort = await config_service.get_reasoning_effort_decision()
            provider = ProviderFactory.get_provider(get_provider_for_model(model_id))

            llm_response = await llm_call_with_retry(
                provider.generate,
                prompt="",
                model_id=model_id,
                temperature=0.7,
                reasoning_effort=reasoning_effort,
                messages=chat_messages,
            )
            assistant_content = llm_response.strip()
            if not assistant_content:
                raise HTTPException(status_code=500, detail="AI 답변이 비어 있습니다")
            response_format = "freeform"

            await db_execute(
                lambda: (
                    supabase.table("chat_messages")
                    .insert(
                        {
                            "session_id": session_id,
                            "turn": next_turn,
                            "role": ChatRole.user.value,
                            "content": normalized_content,
                            "response_format": "freeform",
                            "tokens_used": 0,
                            "cost_coins": 0,
                        }
                    )
                    .execute()
                )
            )

            assistant_result = await db_execute(
                lambda: (
                    supabase.table("chat_messages")
                    .insert(
                        {
                            "session_id": session_id,
                            "turn": next_turn,
                            "role": ChatRole.assistant.value,
                            "content": assistant_content,
                            "response_format": response_format,
                            "tokens_used": 0,
                            "cost_coins": charged_amount,
                            "transaction_id": charged_transaction_id,
                        }
                    )
                    .execute()
                )
            )

            if not assistant_result.data:
                raise HTTPException(
                    status_code=500, detail="응답 메시지 저장에 실패했습니다"
                )
            assistant_row = assistant_result.data[0]
            if not isinstance(assistant_row, dict):
                raise HTTPException(
                    status_code=500,
                    detail="응답 메시지 데이터 형식이 올바르지 않습니다",
                )
            typed_assistant_row = cast(Dict[str, Any], assistant_row)

            if not reserved_session_row:
                raise HTTPException(
                    status_code=500, detail="세션 예약 상태가 누락되었습니다"
                )
            typed_updated_row = reserved_session_row
            response_persisted = True

            assistant_message = self._to_message_response(typed_assistant_row)
            updated_session = self._to_session_response(typed_updated_row)
            return ChatSendResponse(
                message=assistant_message,
                session=updated_session,
                coins_spent=charged_amount,
            )
        except HTTPException as e:
            if not response_persisted and e.status_code >= 500:
                refunded = await self._rollback_failed_stream_turn(
                    session_id=session_id,
                    user_id=user_id,
                    target_turn=next_turn,
                    turn_reserved=turn_reserved,
                    reserved_from_turn=reserved_from_turn,
                    charged_transaction_id=charged_transaction_id,
                    is_regenerate=False,
                    response_persisted=response_persisted,
                    refund_reason="채팅 응답 실패",
                )
                detail_prefix = str(e.detail)
                if charged_transaction_id and refunded:
                    raise HTTPException(
                        status_code=e.status_code,
                        detail=f"{detail_prefix} 엽전이 환불되었습니다.",
                    )
                if charged_transaction_id and not refunded:
                    raise HTTPException(
                        status_code=e.status_code,
                        detail=f"{detail_prefix} 환불 처리에 실패했습니다. 고객센터에 문의해주세요.",
                    )
                raise
            if (
                turn_reserved
                and reserved_from_turn is not None
                and next_turn is not None
            ):
                await self._cleanup_turn_messages(session_id, next_turn)
                await db_execute(
                    lambda: (
                        supabase.table("chat_sessions")
                        .update({"current_turn": reserved_from_turn})
                        .eq("id", session_id)
                        .eq("user_id", user_id)
                        .eq("current_turn", next_turn)
                        .execute()
                    )
                )
            raise
        except Exception:
            logger.exception("[CHAT] send_message 실패")
            charged_error_detail: str | None = None
            if not response_persisted:
                refunded = await self._rollback_failed_stream_turn(
                    session_id=session_id,
                    user_id=user_id,
                    target_turn=next_turn,
                    turn_reserved=turn_reserved,
                    reserved_from_turn=reserved_from_turn,
                    charged_transaction_id=charged_transaction_id,
                    is_regenerate=False,
                    response_persisted=response_persisted,
                    refund_reason="채팅 응답 실패",
                )
                detail_suffix = (
                    "엽전이 환불되었습니다."
                    if refunded
                    else "환불 처리에 실패했습니다. 고객센터에 문의해주세요."
                )
                if charged_transaction_id:
                    charged_error_detail = (
                        f"메시지 처리 중 오류가 발생했습니다. {detail_suffix}"
                    )
            if charged_error_detail:
                raise HTTPException(status_code=500, detail=charged_error_detail)
            raise HTTPException(
                status_code=500, detail="메시지 처리 중 오류가 발생했습니다"
            )

    async def send_message_stream(
        self,
        user_id: str,
        session_id: str,
        content: str,
        regenerate_turn: int | None = None,
    ):
        """
        스트리밍 메시지 전송 (모든 턴 지원)

        Yields:
            dict: 스트리밍 이벤트 (delta, done, error)
        """
        charged_transaction_id: str | None = None
        charged_amount = 0
        is_regenerate = regenerate_turn is not None
        response_persisted = False
        target_turn: int | None = None
        existing_assistant_id: str | None = None
        turn_reserved = False
        reserved_from_turn: int | None = None
        reserved_session_row: Dict[str, Any] | None = None

        try:
            normalized_content = content.strip()
            if not normalized_content:
                yield {"type": "error", "message": "메시지 내용이 비어 있습니다"}
                return

            session_row = await self._get_session_row(user_id, session_id)
            current_turn, _max_turns = self._validate_active_session_or_raise(
                session_row
            )

            # 재생성인 경우 해당 턴 검증
            if is_regenerate:
                target_turn = regenerate_turn
                if target_turn != current_turn:
                    yield {"type": "error", "message": "재생성할 수 없는 턴입니다"}
                    return
                existing_assistant_result = await db_execute(
                    lambda: (
                        supabase.table("chat_messages")
                        .select("id")
                        .eq("session_id", session_id)
                        .eq("turn", target_turn)
                        .eq("role", ChatRole.assistant.value)
                        .order("created_at", desc=True)
                        .limit(1)
                        .execute()
                    )
                )
                existing_rows = (
                    existing_assistant_result.data
                    if isinstance(existing_assistant_result.data, list)
                    else []
                )
                if existing_rows and isinstance(existing_rows[0], dict):
                    existing_id = existing_rows[0].get("id")
                    if isinstance(existing_id, str) and existing_id:
                        existing_assistant_id = existing_id
            else:
                target_turn = current_turn + 1
                reserved_from_turn = current_turn

                reserve_result = await db_execute(
                    lambda: (
                        supabase.table("chat_sessions")
                        .update({"current_turn": target_turn})
                        .eq("id", session_id)
                        .eq("user_id", user_id)
                        .eq("status", ChatStatus.active.value)
                        .eq("current_turn", current_turn)
                        .execute()
                    )
                )
                if not reserve_result.data:
                    yield {
                        "type": "error",
                        "message": "다른 요청이 처리 중입니다. 잠시 후 다시 시도해주세요.",
                        "can_retry": True,
                    }
                    return
                first_reserved_row = reserve_result.data[0]
                if not isinstance(first_reserved_row, dict):
                    raise HTTPException(
                        status_code=500,
                        detail="세션 예약 데이터 형식이 올바르지 않습니다",
                    )
                reserved_session_row = cast(Dict[str, Any], first_reserved_row)
                turn_reserved = True

            # 과금 처리 (재생성이 아닌 경우에만)
            if not is_regenerate:
                charged_amount, charged_transaction_id = await self._charge_chat_turn(
                    user_id=user_id,
                    session_id=session_id,
                    current_turn=current_turn,
                )

            # 사용자 메시지 저장 (재생성이 아닌 경우)
            if not is_regenerate:
                await db_execute(
                    lambda: (
                        supabase.table("chat_messages")
                        .insert(
                            {
                                "session_id": session_id,
                                "turn": target_turn,
                                "role": ChatRole.user.value,
                                "content": normalized_content,
                                "response_format": "freeform",
                                "tokens_used": 0,
                                "cost_coins": 0,
                            }
                        )
                        .execute()
                    )
                )

            if current_turn == 0 and not is_regenerate:
                chat_messages = self._build_chat_messages(
                    session_row, normalized_content
                )
            else:
                history_rows = await self._get_context_history_rows(
                    session_id, current_turn
                )
                user_question = normalized_content
                if is_regenerate:
                    if target_turn is None:
                        raise HTTPException(
                            status_code=500,
                            detail="재생성 턴 정보가 누락되었습니다",
                        )
                    user_question = await self._get_user_message_at_turn(
                        session_id,
                        target_turn,
                    )
                chat_messages = self._build_chat_messages(
                    session_row,
                    user_question,
                    history_rows,
                )

            # 모델 설정
            model_id = await config_service.get_model_decision()
            reasoning_effort = await config_service.get_reasoning_effort_decision()
            provider = ProviderFactory.get_provider(get_provider_for_model(model_id))

            # 스트리밍 호출
            full_content = ""
            try:
                try:
                    async for delta in provider.generate_stream(
                        prompt="",
                        model_id=model_id,
                        temperature=0.7,
                        reasoning_effort=reasoning_effort,
                        messages=chat_messages,
                    ):
                        full_content += delta
                        yield {"type": "delta", "content": delta}
                except (NotImplementedError, AttributeError):
                    fallback_response = await llm_call_with_retry(
                        provider.generate,
                        prompt="",
                        model_id=model_id,
                        temperature=0.7,
                        reasoning_effort=reasoning_effort,
                        messages=chat_messages,
                    )
                    fallback_content = fallback_response.strip()
                    if not fallback_content:
                        raise ValueError("AI 답변이 비어 있습니다")
                    full_content = fallback_content
                    for chunk in self._chunk_fallback_stream_text(fallback_content):
                        yield {"type": "delta", "content": chunk}
                        await asyncio.sleep(0.01)

            except Exception as e:
                logger.exception("[CHAT] 스트리밍 중 오류")
                await self._rollback_failed_stream_turn(
                    session_id=session_id,
                    user_id=user_id,
                    target_turn=target_turn,
                    turn_reserved=turn_reserved,
                    reserved_from_turn=reserved_from_turn,
                    charged_transaction_id=charged_transaction_id,
                    is_regenerate=is_regenerate,
                    response_persisted=response_persisted,
                    refund_reason="스트리밍 실패",
                )
                yield {"type": "error", "message": str(e), "can_retry": True}
                return

            # 완료 - 어시스턴트 메시지 저장
            if is_regenerate and existing_assistant_id:
                assistant_result = await db_execute(
                    lambda: (
                        supabase.table("chat_messages")
                        .update(
                            {
                                "content": full_content,
                                "response_format": "freeform",
                                "tokens_used": 0,
                            }
                        )
                        .eq("id", existing_assistant_id)
                        .execute()
                    )
                )
            else:
                assistant_result = await db_execute(
                    lambda: (
                        supabase.table("chat_messages")
                        .insert(
                            {
                                "session_id": session_id,
                                "turn": target_turn,
                                "role": ChatRole.assistant.value,
                                "content": full_content,
                                "response_format": "freeform",
                                "tokens_used": 0,
                                "cost_coins": charged_amount
                                if not is_regenerate
                                else 0,
                                "transaction_id": charged_transaction_id
                                if not is_regenerate
                                else None,
                            }
                        )
                        .execute()
                    )
                )

            if not assistant_result.data:
                raise Exception("응답 메시지 저장에 실패했습니다")

            if not is_regenerate:
                if not reserved_session_row:
                    raise Exception("세션 예약 상태가 누락되었습니다")
                updated_row = reserved_session_row
            else:
                updated_row = session_row

            assistant_row = assistant_result.data[0]
            if not isinstance(assistant_row, dict):
                raise Exception("응답 메시지 데이터 형식이 올바르지 않습니다")

            if not isinstance(updated_row, dict):
                raise Exception("세션 데이터 형식이 올바르지 않습니다")

            response_persisted = True

            yield {
                "type": "done",
                "message": self._to_message_response(
                    cast(Dict[str, Any], assistant_row)
                ).model_dump(mode="json"),
                "session": self._to_session_response(
                    cast(Dict[str, Any], updated_row)
                ).model_dump(mode="json"),
                "coins_spent": charged_amount if not is_regenerate else 0,
            }

        except HTTPException as e:
            if (
                turn_reserved
                and not response_persisted
                and reserved_from_turn is not None
                and target_turn is not None
            ):
                await self._cleanup_turn_messages(session_id, target_turn)
                await db_execute(
                    lambda: (
                        supabase.table("chat_sessions")
                        .update({"current_turn": reserved_from_turn})
                        .eq("id", session_id)
                        .eq("user_id", user_id)
                        .eq("current_turn", target_turn)
                        .execute()
                    )
                )
            yield {
                "type": "error",
                "message": str(e.detail),
                "can_retry": e.status_code >= 500,
            }
        except Exception as e:
            logger.exception("[CHAT] send_message_stream 실패")
            await self._rollback_failed_stream_turn(
                session_id=session_id,
                user_id=user_id,
                target_turn=target_turn,
                turn_reserved=turn_reserved,
                reserved_from_turn=reserved_from_turn,
                charged_transaction_id=charged_transaction_id,
                is_regenerate=is_regenerate,
                response_persisted=response_persisted,
                refund_reason="스트리밍 응답 실패",
            )
            yield {"type": "error", "message": str(e), "can_retry": True}

    async def _get_user_message_at_turn(self, session_id: str, turn: int) -> str:
        result = await db_execute(
            lambda: (
                supabase.table("chat_messages")
                .select("content")
                .eq("session_id", session_id)
                .eq("turn", turn)
                .eq("role", ChatRole.user.value)
                .limit(1)
                .execute()
            )
        )
        rows = result.data if isinstance(result.data, list) else []
        if not rows:
            raise HTTPException(
                status_code=400, detail="재생성할 사용자 메시지를 찾을 수 없습니다"
            )

        first_row = rows[0]
        if not isinstance(first_row, dict):
            raise HTTPException(
                status_code=500, detail="사용자 메시지 데이터 형식이 올바르지 않습니다"
            )

        content = first_row.get("content")
        if not isinstance(content, str) or not content.strip():
            raise HTTPException(
                status_code=400, detail="재생성할 사용자 메시지를 찾을 수 없습니다"
            )

        return content.strip()

    async def close_session(self, user_id: str, session_id: str) -> ChatSessionResponse:
        try:
            _ = await self._get_session_row(user_id, session_id)
            result = await db_execute(
                lambda: (
                    supabase.table("chat_sessions")
                    .update({"status": ChatStatus.completed.value})
                    .eq("id", session_id)
                    .eq("user_id", user_id)
                    .execute()
                )
            )
            if not result.data:
                raise HTTPException(status_code=500, detail="세션 종료에 실패했습니다")
            first_row = result.data[0]
            if not isinstance(first_row, dict):
                raise HTTPException(
                    status_code=500, detail="세션 데이터 형식이 올바르지 않습니다"
                )
            return self._to_session_response(cast(Dict[str, Any], first_row))
        except HTTPException:
            raise
        except Exception:
            logger.exception("[CHAT] close_session 실패")
            raise HTTPException(
                status_code=500, detail="세션 종료 중 오류가 발생했습니다"
            )

    async def delete_session(self, user_id: str, session_id: str) -> None:
        """세션 및 관련 메시지를 삭제한다."""
        try:
            _ = await self._get_session_row(user_id, session_id)

            await db_execute(
                lambda: (
                    supabase.table("chat_messages")
                    .delete()
                    .eq("session_id", session_id)
                    .execute()
                )
            )

            result = await db_execute(
                lambda: (
                    supabase.table("chat_sessions")
                    .delete()
                    .eq("id", session_id)
                    .eq("user_id", user_id)
                    .execute()
                )
            )
            if not result.data:
                raise HTTPException(status_code=500, detail="세션 삭제에 실패했습니다")
        except HTTPException:
            raise
        except Exception:
            logger.exception("[CHAT] delete_session 실패")
            raise HTTPException(
                status_code=500, detail="세션 삭제 중 오류가 발생했습니다"
            )


chat_service = ChatService()
