"""
병렬 사주 리딩 서비스

탭별로 독립적인 LLM 호출을 병렬로 실행하여 응답 시간을 단축합니다.
기존 단일 호출 방식(60-120초)을 병렬 호출 방식(30-50초)으로 개선합니다.
"""

import asyncio
import json
import logging
import time
from pathlib import Path
from typing import Dict, Any, Optional, List, Tuple, Union
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)

from ..schemas import (
    BirthInput,
    ReadingResponse,
    PersonaType,
    PillarsData,
    CardData,
    TabsData,
    MetaData,
    ElementStats,
    CharacterData,
    LoveTab,
    MoneyTab,
    CareerTab,
    StudyTab,
    HealthTab,
    LifeFlowTab,
    CompatibilityTab,
    DaeunTab,
    LuckyTab,
    AdvancedAnalysis,
    Timeline,
)
from ..schemas.enums import ContextTopic
from ..config import get_settings
from ..utils.json_parser import clean_llm_json_response, parse_llm_json
from ..job_manager import job_manager


class TabType(str, Enum):
    """탭 유형"""

    BASE_INFO = "base_info"  # one_liner, pillars, card
    LOVE = "love"
    MONEY = "money"
    CAREER = "career"
    STUDY = "study"
    HEALTH = "health"
    COMPATIBILITY = "compatibility"
    LIFE_FLOW = "life_flow"
    DAEUN = "daeun"
    LUCKY = "lucky"
    ADVANCED = "advanced"


UPPER_READABILITY_TAB_TYPES = {
    TabType.LOVE,
    TabType.MONEY,
    TabType.CAREER,
    TabType.STUDY,
    TabType.HEALTH,
    TabType.COMPATIBILITY,
}


@dataclass
class TabResult:
    """탭별 생성 결과"""

    tab_type: TabType
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    latency_ms: int = 0
    retry_count: int = 0


class ParallelPromptManager:
    """병렬 처리용 프롬프트 매니저"""

    def __init__(self):
        self.prompts_dir = Path(__file__).parent.parent / "prompts"
        self._cache: Dict[str, str] = {}

    def _load_template(self, filename: str, subdir: str = "") -> str:
        """템플릿 파일 로드"""
        if subdir:
            filepath = self.prompts_dir / subdir / filename
        else:
            filepath = self.prompts_dir / filename

        cache_key = f"{subdir}/{filename}" if subdir else filename
        if cache_key in self._cache:
            return self._cache[cache_key]

        if not filepath.exists():
            raise FileNotFoundError(f"프롬프트 템플릿을 찾을 수 없습니다: {filepath}")

        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()

        self._cache[cache_key] = content
        return content

    def build_common_context(
        self,
        input_data: BirthInput,
        *,
        tab_type: Optional[TabType] = None,
        calculated_pillars: Optional[dict] = None,
        monthly_ganji: Optional[list] = None,
        myungri_data: Optional[dict] = None,
        daeun_info: str = "",
        today_ganji: str = "",
    ) -> str:
        """공통 컨텍스트 빌드"""
        context_filename = (
            "common_context_upper_tabs_v1.txt"
            if tab_type in UPPER_READABILITY_TAB_TYPES
            else "common_context_v1.txt"
        )
        template = self._load_template(context_filename, "shared")

        # 사주 간지 정보 포맷팅
        pillars_info = "정보 없음"
        if calculated_pillars:
            time_name = calculated_pillars.get("korean_time", "")
            hour_val = calculated_pillars.get("hour", "?")
            if time_name:
                hour_val = f"{hour_val} ({time_name})"

            pillars_info = (
                f"- 년주: {calculated_pillars.get('year', '?')}\n"
                f"- 월주: {calculated_pillars.get('month', '?')}\n"
                f"- 일주: {calculated_pillars.get('day', '?')}\n"
                f"- 시주: {hour_val}"
            )

        # 월별 간지 정보 포맷팅
        monthly_ganji_info = "정보 없음"
        if monthly_ganji:
            rows = []
            for item in monthly_ganji:
                rows.append(f"- {item['month']}월: {item['ganji']}")
            monthly_ganji_info = "\n".join(rows)

        # 컨텍스트 정보 구성
        user_name = input_data.name or "미입력"
        gender_label = "남성" if input_data.gender == "male" else "여성"
        calendar_label = "양력" if input_data.calendar_type == "solar" else "음력"
        topic_name = "종합"
        details_str = "없음"
        context_str = "없음"
        if input_data.context:
            topic_map = {
                ContextTopic.LOVE: "연애/썸",
                ContextTopic.CAREER: "커리어/이직",
                ContextTopic.MONEY: "재물/투자",
                ContextTopic.HEALTH: "건강",
                ContextTopic.STUDY: "학업/시험",
                ContextTopic.GENERAL: "종합",
            }
            topic_name = topic_map.get(input_data.context.topic, "종합")
            details_str = input_data.context.details or "없음"
            context_str = (
                f"{topic_name}: {input_data.context.details}"
                if input_data.context.details
                else topic_name
            )

        # 명리학 데이터 포맷팅 (prompt_manager.py와 동일하게)
        myungri_info = "정보 없음"
        if myungri_data:
            # Bazi MCP 데이터 포맷 (JSON 통으로 전달)
            if "chart" in myungri_data:
                myungri_info = f"<BAZI_ANALYSIS_DATA>\n{json.dumps(myungri_data, ensure_ascii=False, separators=(',', ':'))}\n</BAZI_ANALYSIS_DATA>"
            else:
                # 기존 명리학 데이터 포맷 처리 (십신, 합충형파해, 신살 등)
                lines = []

                # 오행 분포
                oheng = myungri_data.get("oheng", {})
                lines.append(
                    f"[오행 분포] 목:{oheng.get('목', 0)} 화:{oheng.get('화', 0)} 토:{oheng.get('토', 0)} 금:{oheng.get('금', 0)} 수:{oheng.get('수', 0)}"
                )

                # 음양 균형
                yinyang = myungri_data.get("yinyang", {})
                lines.append(
                    f"[음양 균형] 양:{yinyang.get('양', 0)} 음:{yinyang.get('음', 0)}"
                )

                # 신강/신약 (핵심!)
                lines.append(f"[신강/신약] {myungri_data.get('strength', '판단불가')}")

                # 십신 분포
                sipsin = myungri_data.get("sipsin", {})
                sipsin_details = sipsin.get("details", {})
                sipsin_lines = []
                for pos, data in sipsin_details.items():
                    pos_kr = (
                        pos.replace("_stem", "간")
                        .replace("_branch", "지")
                        .replace("year", "년")
                        .replace("month", "월")
                        .replace("day", "일")
                        .replace("hour", "시")
                    )
                    sipsin_lines.append(
                        f"  - {pos_kr}: {data.get('char', '')} → {data.get('sipsin', '')}"
                    )
                if sipsin_lines:
                    lines.append("[십신 배치 (확정)]")
                    lines.extend(sipsin_lines)

                # 십신군 분포
                groups = sipsin.get("groups", {})
                if groups:
                    lines.append(
                        f"[십신군 분포] 비겁:{groups.get('비겁', 0)} 식상:{groups.get('식상', 0)} 재성:{groups.get('재성', 0)} 관성:{groups.get('관성', 0)} 인성:{groups.get('인성', 0)}"
                    )
                    lines.append(
                        f"  → 강함: {sipsin.get('dominant', '')} / 약함: {sipsin.get('weak', '')}"
                    )

                # 합충형파해
                interactions = myungri_data.get("interactions", {})
                interaction_items = interactions.get("items", [])
                if interaction_items:
                    lines.append("[합충형파해 (확정)]")
                    for item in interaction_items:
                        lines.append(
                            f"  - {item.get('type', '')}: {item.get('pillars', '')} ({item.get('chars', '')})"
                        )

                # 공망
                gongmang = interactions.get("gongmang", [])
                if gongmang:
                    lines.append(f"[공망 (확정)] {', '.join(gongmang)}")

                # 신살
                sinsal_items = myungri_data.get("sinsal", {}).get("items", [])
                if sinsal_items:
                    lines.append("[신살 (확정)]")
                    for item in sinsal_items:
                        lines.append(
                            f"  - {item.get('name', '')} {item.get('icon', '')} ({item.get('position', '')})"
                        )

                # 12운성
                twelve_stages = myungri_data.get("twelve_stages", {})
                if twelve_stages:
                    lines.append("[12운성 (확정)]")
                    pillar_names = {'year': '년지', 'month': '월지', 'day': '일지', 'hour': '시지'}
                    for key in ['year', 'month', 'day', 'hour']:
                        stage_data = twelve_stages.get(key, {})
                        if stage_data:
                            lines.append(
                                f"  - {pillar_names[key]}({stage_data.get('branch', '')}): {stage_data.get('stage', '')}"
                            )

                # 지장간
                jijanggan = myungri_data.get("jijanggan", {})
                if jijanggan:
                    lines.append("[지장간 (확정)]")
                    pillar_names_j = {'year': '년지', 'month': '월지', 'day': '일지', 'hour': '시지'}
                    for key in ['year', 'month', 'day', 'hour']:
                        jj_data = jijanggan.get(key, {})
                        if jj_data:
                            hidden = jj_data.get('jijanggan', [])
                            jeonggi = jj_data.get('jeonggi', '')
                            branch = jj_data.get('branch', '')
                            if len(hidden) == 1:
                                lines.append(f"  - {pillar_names_j[key]}({branch}): {hidden[0]}(정기)")
                            else:
                                parts = []
                                labels = ['여기', '중기', '정기']
                                for i, h in enumerate(hidden):
                                    label = labels[i] if i < len(labels) else ''
                                    parts.append(f"{h}({label})")
                                lines.append(f"  - {pillar_names_j[key]}({branch}): {', '.join(parts)}")
                myungri_info = "\n".join(lines)

        replacements = {
            "{pillars_info}": pillars_info,
            "{monthly_ganji_info}": monthly_ganji_info,
            "{user_name}": user_name,
            "{birth_solar}": input_data.birth_solar,
            "{birth_lunar}": input_data.birth_lunar or "미입력",
            "{birth_time}": input_data.birth_time,
            "{calendar_type}": calendar_label,
            "{gender}": gender_label,
            "{birth_place}": input_data.birth_place,
            "{timezone}": input_data.timezone,
            "{topic}": topic_name,
            "{details}": details_str,
            "{context}": context_str,
            "{daeun_info}": daeun_info,
            "{today_ganji}": today_ganji,
            "{myungri_info}": myungri_info,
        }

        result = template
        for placeholder, value in replacements.items():
            result = result.replace(placeholder, str(value))

        return result

    def build_tab_prompt(
        self,
        tab_type: TabType,
        persona: PersonaType,
        common_context: str,
        version: str = "v1",
    ) -> str:
        """탭별 프롬프트 빌드"""
        # 페르소나 템플릿 로드
        try:
            persona_prompt = self._load_template(f"persona_{persona.value}.txt")
        except FileNotFoundError:
            persona_prompt = self._load_template("persona_classic.txt")

        # 탭별 템플릿 로드
        tab_filename_map = {
            TabType.BASE_INFO: "base_info_v1.txt",
            TabType.LOVE: "tab_love_v1.txt",
            TabType.MONEY: "tab_money_v1.txt",
            TabType.CAREER: "tab_career_v1.txt",
            TabType.STUDY: "tab_study_v1.txt",
            TabType.HEALTH: "tab_health_v1.txt",
            TabType.COMPATIBILITY: "tab_compatibility_v1.txt",
            TabType.LIFE_FLOW: "tab_life_flow_v1.txt",
            TabType.DAEUN: "tab_daeun_v1.txt",
            TabType.LUCKY: "tab_lucky_v1.txt",
            TabType.ADVANCED: "advanced_v1.txt",
        }

        tab_template = self._load_template(tab_filename_map[tab_type], "parallel")

        # 변수 치환
        result = tab_template.replace("{persona_prompt}", persona_prompt)
        result = result.replace("{common_context}", common_context)

        return result

    def build_lucky_context(
        self,
        input_data: BirthInput,
        calculated_pillars: Optional[dict] = None,
        myungri_data: Optional[dict] = None,
        today_ganji: str = "",
    ) -> str:
        user_name = input_data.name or "미입력"
        gender_label = "남성" if input_data.gender == "male" else "여성"
        calendar_label = "양력" if input_data.calendar_type == "solar" else "음력"
        topic_name = "종합"
        details_str = "없음"
        context_str = "없음"
        if input_data.context:
            topic_map = {
                ContextTopic.LOVE: "연애/썸",
                ContextTopic.CAREER: "커리어/이직",
                ContextTopic.MONEY: "재물/투자",
                ContextTopic.HEALTH: "건강",
                ContextTopic.STUDY: "학업/시험",
                ContextTopic.GENERAL: "종합",
            }
            topic_name = topic_map.get(input_data.context.topic, "종합")
            details_str = input_data.context.details or "없음"
            context_str = (
                f"{topic_name}: {input_data.context.details}"
                if input_data.context.details
                else topic_name
            )

        pillars_info = "정보 없음"
        if calculated_pillars:
            time_name = calculated_pillars.get("korean_time", "")
            hour_val = calculated_pillars.get("hour", "?")
            if time_name:
                hour_val = f"{hour_val} ({time_name})"
            pillars_info = (
                f"- 년주: {calculated_pillars.get('year', '?')}\n"
                f"- 월주: {calculated_pillars.get('month', '?')}\n"
                f"- 일주: {calculated_pillars.get('day', '?')}\n"
                f"- 시주: {hour_val}"
            )

        oheng_str = "정보 없음"
        if calculated_pillars and "oheng_counts" in calculated_pillars:
            c = calculated_pillars["oheng_counts"]
            oheng_str = (
                f"목(木):{c.get('wood', 0)} 화(火):{c.get('fire', 0)} "
                f"토(土):{c.get('earth', 0)} 금(金):{c.get('metal', 0)} 수(水):{c.get('water', 0)}"
            )
        elif myungri_data:
            if "chart" in myungri_data:
                c = myungri_data["chart"].get("five_elements", {}).get("counts", {})
                if c:
                    oheng_str = (
                        f"목(木):{c.get('wood', 0)} 화(火):{c.get('fire', 0)} "
                        f"토(土):{c.get('earth', 0)} 금(金):{c.get('metal', 0)} 수(水):{c.get('water', 0)}"
                    )
            elif "oheng" in myungri_data:
                o = myungri_data["oheng"]
                oheng_str = (
                    f"목(木):{o.get('목', 0)} 화(火):{o.get('화', 0)} "
                    f"토(土):{o.get('토', 0)} 금(金):{o.get('금', 0)} 수(水):{o.get('수', 0)}"
                )

        yinyang_str = "정보 없음"
        strength_str = "판단불가"
        if myungri_data:
            kv = myungri_data.get("korean_verified_data", {})
            if kv:
                if "yinyang" in kv:
                    yy = kv["yinyang"]
                    yinyang_str = f"양(陽):{yy.get('yang', yy.get('양', 0))} 음(陰):{yy.get('yin', yy.get('음', 0))}"
                if "strength" in kv:
                    strength_str = kv["strength"]
            if yinyang_str == "정보 없음" and "yinyang" in myungri_data:
                yy = myungri_data["yinyang"]
                yinyang_str = f"양(陽):{yy.get('양', 0)} 음(陰):{yy.get('음', 0)}"
            if strength_str == "판단불가" and "strength" in myungri_data:
                strength_str = myungri_data["strength"]
        if strength_str == "판단불가" and calculated_pillars:
            strength_str = calculated_pillars.get("strength", "판단불가")

        sinsal_items: list = []
        if myungri_data:
            sinsal_items = myungri_data.get("korean_shinsal", [])
            if not sinsal_items:
                sinsal_items = myungri_data.get("sinsal", {}).get("items", [])
        if not sinsal_items and calculated_pillars:
            sinsal_items = calculated_pillars.get("sinsal_items", [])

        if sinsal_items:
            sinsal_lines = [
                f"  - {item.get('name', '')} {item.get('icon', '')} ({item.get('position', '')})"
                for item in sinsal_items
                if item.get("name")
            ]
            sinsal_section = "[신살 (확정)]\n" + "\n".join(sinsal_lines)
        else:
            sinsal_section = "[신살] 정보 없음"

        # 12운성
        twelve_stages_section = "[12운성] 정보 없음"
        if myungri_data and "twelve_stages" in myungri_data:
            ts = myungri_data["twelve_stages"]
            if ts:
                pillar_names = {'year': '년지', 'month': '월지', 'day': '일지', 'hour': '시지'}
                ts_lines = []
                for key in ['year', 'month', 'day', 'hour']:
                    sd = ts.get(key, {})
                    if sd:
                        ts_lines.append(f"  - {pillar_names[key]}({sd.get('branch', '')}): {sd.get('stage', '')}")
                if ts_lines:
                    twelve_stages_section = "[12운성 (확정)]\n" + "\n".join(ts_lines)

        # 지장간
        jijanggan_section = "[지장간] 정보 없음"
        if myungri_data and "jijanggan" in myungri_data:
            jj = myungri_data["jijanggan"]
            if jj:
                pillar_names_j = {'year': '년지', 'month': '월지', 'day': '일지', 'hour': '시지'}
                jj_lines = []
                for key in ['year', 'month', 'day', 'hour']:
                    jd = jj.get(key, {})
                    if jd:
                        hidden = jd.get('jijanggan', [])
                        branch = jd.get('branch', '')
                        if len(hidden) == 1:
                            jj_lines.append(f"  - {pillar_names_j[key]}({branch}): {hidden[0]}(정기)")
                        else:
                            parts = []
                            labels = ['여기', '중기', '정기']
                            for i, h in enumerate(hidden):
                                label = labels[i] if i < len(labels) else ''
                                parts.append(f"{h}({label})")
                            jj_lines.append(f"  - {pillar_names_j[key]}({branch}): {', '.join(parts)}")
                if jj_lines:
                    jijanggan_section = "[지장간 (확정)]\n" + "\n".join(jj_lines)
        current_daeun = "정보 없음"
        if calculated_pillars:
            d = calculated_pillars.get("daeun", {})
            current_daeun = d.get("current_daeun_ganji", "정보 없음")

        return (
            "[공통 사주 정보 - 행운키트 탭 전용]\n\n"
            "아래 간지 정보는 sajupy 만세력 라이브러리로 정밀 계산된 확정값입니다.\n"
            "이 데이터는 재계산 없이 그대로 활용하세요.\n\n"
            "[입력 정보]\n"
            f"- 이름(있으면): {user_name}\n"
            f"- 양력 생년월일: {input_data.birth_solar}\n"
            f"- 음력 생년월일(있으면): {input_data.birth_lunar or '미입력'}\n"
            f"- 출생 시간: {input_data.birth_time} (24시간제)\n"
            f"- 달력 기준: {calendar_label}\n"
            f"- 성별: {gender_label}\n"
            f"- 출생지/국가: {input_data.birth_place}\n"
            f"- 기준 시간대: {input_data.timezone}\n"
            f"- 상담 주제: {topic_name}\n"
            f"- 고민 상세: {details_str}\n"
            f"- 추가 상황(선택): {context_str}\n\n"
            f"[사주팔자 정보]\n{pillars_info}\n\n"
            f"[오늘 일진]\n오늘의 일진: {today_ganji}\n\n"
            f"[오행 분포 (확정)]\n{oheng_str}\n\n"
            f"[음양 균형 (확정)]\n{yinyang_str}\n\n"
            f"[신강/신약 (확정)]\n{strength_str}\n\n"
            f"{sinsal_section}\n\n"
            f"{twelve_stages_section}\n\n"
            f"{jijanggan_section}\n\n"
            f"[현재 대운]\n{current_daeun}\n\n"
            "---\n\n"
            "[핵심 지침 - 행운키트]\n\n"
            "1. **말투와 톤**: 페르소나 섹션의 말투/톤 지침을 따르세요.\n"
            "2. **관찰로 시작**: 추상적 도입 대신 사주에서 먼저 눈에 들어오는 흐름을 짚고 시작하세요.\n"
            "3. **한자 병기**: 주요 간지·오행은 첫 언급에서만 한글 발음과 함께 병기하세요 (예: 갑자(甲子)).\n"
            "4. **오행 기반 분석**: 오행 분포와 신강/신약을 바탕으로 지금 도움이 되는 흐름과 주의할 흐름을 읽어 주세요.\n"
            "5. **원인-결과 설명**: 이렇기 때문에 이렇게 느껴질 수 있다는 인과관계를 풀어주세요.\n"
            "6. **장면으로 구체화**: 오늘의 미션은 구체적 장면에서 할 수 있는 행동으로 제시하세요.\n"
            "7. **단정 금지**: 길흉을 단정하지 말고 조건부 표현을 사용하세요.\n"
            "8. **선택적 강조**: 핵심적인 통찰만 짧고 선명하게 강조하세요."
        )


class ParallelReadingService:
    """병렬 사주 리딩 서비스"""

    # TODO LLM-6: Standardize error handling across parallel tab processing.
    # TODO LLM-6: Currently some failures are silently dropped while others propagate.

    def __init__(self, provider):
        self.provider = provider
        self.prompt_manager = ParallelPromptManager()
        self.settings = get_settings()
        self._max_concurrent = self.settings.parallel_max_concurrent

    async def _generate_tab_with_retry(
        self,
        tab_type: TabType,
        prompt: str,
        model_id: str,
        semaphore: asyncio.Semaphore,
        base_temperature: float = 0.85,
        reasoning_effort: str = "high",
    ) -> TabResult:
        """탭별 LLM 호출 (재시도 로직 포함)"""
        start_time = time.time()
        max_retries = self.settings.parallel_retry_count
        last_error = None

        for attempt in range(max_retries + 1):
            try:
                async with semaphore:
                    temperature = (
                        base_temperature
                        if attempt == 0
                        else max(0.5, base_temperature - 0.2)
                    )
                    current_effort = reasoning_effort if attempt == 0 else "medium"

                    # TODO CONC-11: parallel_tab_timeout is per-task but total wall clock may exceed expectations.
                    # Consider separate per-task and total timeout configurations.
                    response_text = await asyncio.wait_for(
                        self.provider.generate(
                            prompt=prompt,
                            model_id=model_id,
                            temperature=temperature,
                            response_format={"type": "json_object"},
                            reasoning_effort=current_effort,
                        ),
                        timeout=self.settings.parallel_tab_timeout,
                    )

                parsed = parse_llm_json(response_text)

                if not parsed:
                    raise json.JSONDecodeError(
                        "parse_llm_json returned empty dict", response_text[:200], 0
                    )

                latency_ms = int((time.time() - start_time) * 1000)
                return TabResult(
                    tab_type=tab_type,
                    success=True,
                    data=parsed,
                    latency_ms=latency_ms,
                    retry_count=attempt,
                )

            except asyncio.TimeoutError:
                last_error = f"Timeout after {self.settings.parallel_tab_timeout}s"
                logger.warning(
                    f"{tab_type.value} timeout (attempt {attempt + 1}/{max_retries + 1})"
                )
            except json.JSONDecodeError as e:
                last_error = f"JSON parse error: {e}"
                logger.warning(
                    f"{tab_type.value} JSON error (attempt {attempt + 1}/{max_retries + 1}): {e}"
                )
            except Exception as e:
                last_error = str(e)
                logger.warning(
                    f"{tab_type.value} error (attempt {attempt + 1}/{max_retries + 1}): {e}"
                )

            if attempt < max_retries:
                backoff = min(2**attempt, 10)
                await asyncio.sleep(backoff)

        latency_ms = int((time.time() - start_time) * 1000)
        return TabResult(
            tab_type=tab_type,
            success=False,
            error=last_error,
            latency_ms=latency_ms,
            retry_count=max_retries,
        )

    async def generate_parallel(
        self,
        input_data: BirthInput,
        model_id: str,
        temperature: float = 0.7,
        reasoning_effort: str = "high",
        job_id: Optional[str] = None,
        calculated_pillars: Optional[dict] = None,
        monthly_ganji: Optional[list] = None,
        myungri_data: Optional[dict] = None,
    ) -> Tuple[Dict[str, Any], List[TabResult]]:
        """
        병렬로 모든 탭 생성

        Returns:
            Tuple[merged_data, tab_results]: 병합된 결과와 탭별 결과 리스트
        """
        start_time = time.time()

        # 대운 정보 포맷팅
        daeun_str = ""
        today_ganji = ""
        if calculated_pillars:
            today_ganji = calculated_pillars.get("today_ganji", "")
            d = calculated_pillars.get("daeun", {})
            if d:
                timeline_info = ""
                for item in d.get("timeline", []):
                    timeline_info += f"- {item['age_start']}~{item['age_end']}세: {item['ganji']} 대운\n"

                daeun_str = (
                    f"현재 대운의 방향: {d.get('direction', '')}\n"
                    f"대운수: {d.get('number', '')}\n"
                    f"전체 대운 흐름:\n{timeline_info}\n"
                    f"현재 나이 기준 대운: {d.get('current_daeun_ganji', '알 수 없음')}"
                )

        # 공통 컨텍스트 빌드
        common_context = self.prompt_manager.build_common_context(
            input_data=input_data,
            calculated_pillars=calculated_pillars,
            monthly_ganji=monthly_ganji,
            myungri_data=myungri_data,
            daeun_info=daeun_str,
            today_ganji=today_ganji,
        )
        upper_tabs_common_context = self.prompt_manager.build_common_context(
            input_data=input_data,
            tab_type=TabType.LOVE,
            calculated_pillars=calculated_pillars,
            monthly_ganji=monthly_ganji,
            myungri_data=myungri_data,
            daeun_info=daeun_str,
            today_ganji=today_ganji,
        )

        # 탭별 프롬프트 생성
        persona = input_data.persona or PersonaType.CLASSIC
        tabs_to_generate = [
            TabType.BASE_INFO,
            TabType.LOVE,
            TabType.MONEY,
            TabType.CAREER,
            TabType.STUDY,
            TabType.HEALTH,
            TabType.COMPATIBILITY,
            TabType.LIFE_FLOW,
            TabType.DAEUN,
            TabType.LUCKY,
            TabType.ADVANCED,
        ]

        semaphore = asyncio.Semaphore(self._max_concurrent)

        total_tabs = len(tabs_to_generate)
        completed_count = 0

        tasks: List[asyncio.Task] = []
        for tab_type in tabs_to_generate:
            ctx = (
                self.prompt_manager.build_lucky_context(
                    input_data=input_data,
                    calculated_pillars=calculated_pillars,
                    myungri_data=myungri_data,
                    today_ganji=today_ganji,
                )
                if tab_type == TabType.LUCKY
                else upper_tabs_common_context
                if tab_type in UPPER_READABILITY_TAB_TYPES
                else common_context
            )
            prompt = self.prompt_manager.build_tab_prompt(
                tab_type=tab_type, persona=persona, common_context=ctx
            )
            task = asyncio.create_task(
                self._generate_tab_with_retry(
                    tab_type=tab_type,
                    prompt=prompt,
                    model_id=model_id,
                    semaphore=semaphore,
                    base_temperature=temperature,
                    reasoning_effort=reasoning_effort,
                )
            )
            tasks.append(task)

        merged_data: Dict[str, Any] = {}
        tab_results: List[TabResult] = []

        # asyncio.as_completed returns new Future objects, not original tasks
        # But _generate_tab_with_retry always returns TabResult (handles exceptions internally)
        # So we can safely await and use result.tab_type
        for future in asyncio.as_completed(tasks):
            result = await future  # Always returns TabResult, never raises

            completed_count += 1
            if job_id:
                job_manager.update_progress(job_id, completed_count, total_tabs)
                logger.info(
                    f"[PARALLEL] Progress: {completed_count}/{total_tabs} ({result.tab_type.value})"
                )

            tab_results.append(result)

            if result.success and result.data:
                if result.tab_type == TabType.BASE_INFO:
                    merged_data.update(result.data)
                elif result.tab_type == TabType.ADVANCED:
                    merged_data["advanced_analysis"] = result.data.get(
                        "advanced_analysis", {}
                    )
                else:
                    if "tabs" not in merged_data:
                        merged_data["tabs"] = {}
                    tab_key = result.tab_type.value
                    if tab_key in result.data:
                        merged_data["tabs"][tab_key] = result.data[tab_key]
                    else:
                        merged_data["tabs"][tab_key] = result.data

        total_time = int((time.time() - start_time) * 1000)
        success_count = sum(1 for r in tab_results if r.success)
        logger.info(
            f"[PARALLEL] Total: {total_time}ms, Success: {success_count}/{len(tab_results)}"
        )

        return merged_data, tab_results

    def apply_fallbacks(
        self,
        merged_data: Dict[str, Any],
        tab_results: List[TabResult],
        calculated_pillars: Optional[dict] = None,
        python_myungri: Optional[dict] = None,
    ) -> Dict[str, Any]:
        """실패한 탭에 대해 Fallback 데이터 적용"""

        # 실패한 탭 확인
        failed_tabs = [r.tab_type for r in tab_results if not r.success]

        for tab_type in failed_tabs:
            logger.info(f"[FALLBACK] Applying fallback for: {tab_type.value}")

            if tab_type == TabType.BASE_INFO:
                # 기본 정보 Fallback
                if "one_liner" not in merged_data:
                    merged_data["one_liner"] = (
                        "타고난 결을 천천히 읽어보면 강점이 더 선명해지는 사람입니다."
                    )
                if "pillars" not in merged_data and calculated_pillars:
                    merged_data["pillars"] = {
                        "year": calculated_pillars.get("year", ""),
                        "month": calculated_pillars.get("month", ""),
                        "day": calculated_pillars.get("day", ""),
                        "hour_A": calculated_pillars.get("hour", ""),
                        "hour_B": calculated_pillars.get("hour", ""),
                        "hour_note": "계산된 데이터",
                    }
                if "card" not in merged_data:
                    stats = {}
                    if calculated_pillars and "oheng_counts" in calculated_pillars:
                        stats = calculated_pillars["oheng_counts"]
                    merged_data["card"] = {
                        "stats": stats,
                        "character": {
                            "summary": "지금은 핵심 결만 먼저 보이는데, 차분히 들여다볼수록 더 많은 층이 드러나는 타입이에요.",
                            "buffs": [],
                            "debuffs": [],
                        },
                        "tags": [],
                    }

            elif tab_type == TabType.ADVANCED:
                # 종합 분석 Fallback
                if "advanced_analysis" not in merged_data:
                    merged_data["advanced_analysis"] = {
                        "wonguk_summary": "사주 원국을 살펴볼 때, 타고난 기운의 흐름이 느껴지는데 조금 더 시간을 들여 정리할 필요가 있을 것 같아요.",
                        "sipsin": {"distribution": [], "dominant": "", "weak": ""},
                        "interactions": {"items": [], "gongmang": []},
                        "sinsal": {"items": [], "summary": ""},
                        "daeun": {"items": []},
                        "practical": {},
                    }

            else:
                # 일반 탭 Fallback
                if "tabs" not in merged_data:
                    merged_data["tabs"] = {}

                tab_key = tab_type.value
                if tab_key not in merged_data["tabs"]:
                    merged_data["tabs"][tab_key] = {
                        "summary": "이 흐름은 실마리부터 먼저 보이고 있어요. 곧 더 또렷한 해석으로 이어질 수 있을 것 같아요.",
                        "full_text": "지금은 이 탭의 결이 먼저 잡히는 단계예요. 같은 흐름으로 다시 열어보면, 왜 이런 반응과 선택이 반복되는지 더 선명하게 읽힐 가능성이 큽니다.",
                        "timeline": {"past": "", "present": "", "future": ""},
                    }

        return merged_data


_parallel_prompt_manager: Optional[ParallelPromptManager] = None
_service_cache: Dict[str, "ParallelReadingService"] = {}


def get_parallel_prompt_manager() -> ParallelPromptManager:
    global _parallel_prompt_manager
    if _parallel_prompt_manager is None:
        _parallel_prompt_manager = ParallelPromptManager()
    return _parallel_prompt_manager


def get_parallel_reading_service(provider) -> "ParallelReadingService":
    cache_key = getattr(provider, "provider_name", type(provider).__name__)
    if cache_key not in _service_cache:
        _service_cache[cache_key] = ParallelReadingService(provider)
    return _service_cache[cache_key]
