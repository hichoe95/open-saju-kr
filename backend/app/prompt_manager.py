"""
프롬프트 매니저 - 템플릿 로드 및 변수 주입
"""

import os
from pathlib import Path
from typing import Optional
from .schemas import BirthInput, ContextTopic, PersonaType, CompatibilityScenario


class PromptManager:
    """프롬프트 템플릿 관리"""

    def __init__(self):
        self.prompts_dir = Path(__file__).parent / "prompts"
        self._cache = {}

    def _load_template(self, filename: str) -> str:
        """템플릿 파일 로드 (캐싱 - 개발 모드 해제)"""
        # 개발 환경에서는 캐싱 비활성화하여 즉시 반영
        # if filename in self._cache:
        #     return self._cache[filename]

        filepath = self.prompts_dir / filename
        if not filepath.exists():
            raise FileNotFoundError(f"프롬프트 템플릿을 찾을 수 없습니다: {filename}")

        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()

        self._cache[filename] = content
        return content

    def get_persona_prompt(self, persona: Optional[PersonaType]) -> str:
        normalized = persona or PersonaType.CLASSIC
        try:
            return self._load_template(f"persona_{normalized.value}.txt")
        except FileNotFoundError:
            return self._load_template("persona_classic.txt")

    def build_prompt(
        self,
        input_data: BirthInput,
        version: str = "v1",
        calculated_pillars: Optional[dict] = None,
        monthly_ganji: Optional[list] = None,
        myungri_data: Optional[dict] = None,  # 확정 계산된 명리학 데이터
    ) -> str:
        """
        사용자 입력을 기반으로 완성된 프롬프트 생성

        Args:
            input_data: 사용자 입력 데이터
            version: 프롬프트 버전
            calculated_pillars: 미리 계산된 사주 간지 정보
            monthly_ganji: 미리 계산된 월별 간지 정보
            myungri_data: 확정 계산된 명리학 데이터 (십신, 합충형파해, 신살 등)

        Returns:
            완성된 프롬프트 문자열
        """
        # 기본 템플릿 로드
        base_template = self._load_template(f"base_{version}.txt")

        # 페르소나 템플릿 로드 및 주입
        try:
            persona_template = self.get_persona_prompt(input_data.persona)
            base_template = persona_template + "\n\n" + base_template
        except FileNotFoundError:
            pass

        # 사주 간지 정보 포맷팅
        # 사주 간지 정보 포맷팅
        pillars_info = "정보 없음 (모델이 직접 계산 필요)"
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

        # 대운 정보 및 일진 포맷팅
        daeun_str = "정보 없음"
        today_ganji = "정보 없음"

        if calculated_pillars:
            # 일진
            today_ganji = calculated_pillars.get("today_ganji", "정보 없음")

            # 대운
            d = calculated_pillars.get("daeun", {})
            if d:
                ganji_flow = ", ".join(d.get("ganji_list", []))

                # 타임라인 정보 생성
                timeline_info = ""
                for item in d.get("timeline", []):
                    timeline_info += f"- {item['age_start']}~{item['age_end']}세: {item['ganji']} 대운\n"

                daeun_str = (
                    f"현재 대운의 방향: {d.get('direction', '')}\n"
                    f"대운수: {d.get('number', '')}\n"
                    f"전체 대운 흐름:\n{timeline_info}\n"
                    f"현재 나이 기준 대운: {d.get('current_daeun_ganji', '알 수 없음')}\n"
                    f"주의: 위 흐름을 보고 각 대운별 핵심 테마를 분석해라."
                )

        # 확정 명리학 데이터 포맷팅
        myungri_info = "정보 없음"
        if myungri_data:
            # Bazi MCP 데이터 포맷 (JSON 통으로 전달)
            if "chart" in myungri_data:
                import json

                # 데이터가 너무 크면 요약하거나 필요한 부분만 선택 가능하지만, 일단 전체 전달
                myungri_json = json.dumps(myungri_data, ensure_ascii=False, indent=2)
                myungri_info = (
                    f"<BAZI_ANALYSIS_DATA>\n{myungri_json}\n</BAZI_ANALYSIS_DATA>"
                )
            else:
                # 기존 명리학 데이터 포맷 처리
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

                # 신강/신약
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

                myungri_info = "\n".join(lines)

        # 변수 치환 (안전한 방식 - JSON 템플릿의 {} 충돌 방지)
        replacements = {
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
            "{pillars_info}": pillars_info,
            "{monthly_ganji_info}": monthly_ganji_info,
            "{daeun_info}": daeun_str,
            "{today_ganji}": today_ganji,
            "{myungri_info}": myungri_info,
        }

        prompt = base_template
        for placeholder, value in replacements.items():
            prompt = prompt.replace(placeholder, value)

        # 연애/썸 추가 블록 (해당되는 경우)
        if input_data.context and input_data.context.topic == ContextTopic.LOVE:
            try:
                love_addon = self._load_template(f"love_addon_{version}.txt")
                # 추가 블록 변수 치환 (간단 버전)
                love_addon = love_addon.replace(
                    "{love_stage}", input_data.context.details or ""
                )
                love_addon = love_addon.replace("{partner_style}", "알 수 없음")
                love_addon = love_addon.replace("{goal}", "자연스러운 발전")
                love_addon = love_addon.replace("{avoid}", "부담 주기")
                prompt += "\n\n" + love_addon
            except FileNotFoundError:
                pass  # 추가 블록이 없으면 스킵

        # [ENHANCED] 사용자 특별 질문/상황에 대한 카테고리별 고도화 분석 지침
        if (
            input_data.context
            and input_data.context.details
            and input_data.context.topic != ContextTopic.GENERAL
        ):
            topic = input_data.context.topic
            user_question = input_data.context.details

            # 카테고리별 맞춤 분석 지침
            category_instructions = {
                ContextTopic.LOVE: f'''
[SPECIAL MISSION: 연애/썸 집중 분석]
사용자의 구체적 상황: "{user_question}"

**반드시 준수할 분석 지침:**
1. tabs.love.full_text 작성 시, 일반적인 연애운이 아니라 **위 상황에 대한 직접적인 분석과 조언**을 제공해야 합니다.
2. 상대방의 심리를 사주적 관점에서 추론해주세요 (예: "상대가 조심스러운 이유는 당신의 ○○ 기운이...")
3. 구체적인 행동 가이드 제시:
   - 지금 당장 보낼 수 있는 카톡/문자 멘트 예시 3개
   - 다음 만남에서 해야 할 행동 2가지
   - 절대 하지 말아야 할 행동 2가지
4. 타이밍 분석: 언제 고백/진전이 좋을지 운의 흐름으로 제안
''',
                ContextTopic.CAREER: f'''
[SPECIAL MISSION: 커리어/이직 집중 분석]
사용자의 구체적 상황: "{user_question}"

**반드시 준수할 분석 지침:**
1. tabs.career.full_text 작성 시, 일반적인 직업운이 아니라 **위 상황에 대한 맞춤 전략**을 제시해야 합니다.
2. 이직/현 직장 유지 판단 기준을 사주로 분석:
   - 지금이 움직여야 할 시기인지, 기다려야 할 시기인지
   - 어떤 산업/직무가 사주적으로 유리한지
3. 구체적인 행동 가이드:
   - 이번 주 안에 해야 할 액션 아이템 3개
   - 면접/협상 시 강조해야 할 본인의 강점 (사주 기반)
   - 피해야 할 회사/상사 유형
4. tabs.career.next_steps 에 바로 실행 가능한 체크리스트를 넣어주세요.
''',
                ContextTopic.MONEY: f'''
[SPECIAL MISSION: 재물/투자 집중 분석]
사용자의 구체적 상황: "{user_question}"

**반드시 준수할 분석 지침:**
1. tabs.money.full_text 작성 시, 막연한 재물운이 아니라 **위 상황에 대한 구체적 판단**을 내려야 합니다.
2. 투자/지출 결정에 대한 사주적 관점:
   - 지금 시기가 공격적으로 투자할 때인지, 보수적으로 지킬 때인지
   - 어떤 자산/방식이 사주와 맞는지 (부동산, 주식, 사업 등)
3. 리스크 경고:
   - 손실이 나기 쉬운 시기/상황 경고
   - 피해야 할 투자 유형
4. tabs.money.rules 에 "이것만 지키면 돈이 새지 않는다" 규칙 3개를 명확히 제시하세요.
''',
                ContextTopic.HEALTH: f'''
[SPECIAL MISSION: 건강 집중 분석]
사용자의 구체적 상황: "{user_question}"

**반드시 준수할 분석 지침:**
1. tabs.health.full_text 작성 시, 일반적인 건강 조언이 아니라 **위 증상/상황에 맞는 분석**을 제공해야 합니다.
2. 사주 오행 기반 건강 분석:
   - 어떤 장기/기관이 취약한지 (목→간, 화→심장 등)
   - 현재 시기에 특히 주의해야 할 건강 포인트
3. 실천 가능한 생활 습관 제안:
   - 오행 균형을 맞추는 식단/운동
   - 피해야 할 음식/습관
4. **주의: 의료적 진단이 아님을 명시하고, 심각한 증상은 병원 방문을 권유하세요.**
''',
                ContextTopic.STUDY: f'''
[SPECIAL MISSION: 학업/시험 집중 분석]
사용자의 구체적 상황: "{user_question}"

**반드시 준수할 분석 지침:**
1. tabs.study.full_text 작성 시, 일반적인 학업운이 아니라 **위 시험/공부 상황에 맞는 전략**을 제시해야 합니다.
2. 사주 기반 학습 스타일 분석:
   - 어떤 공부법이 나에게 맞는지 (혼자 vs 그룹, 아침 vs 저녁 등)
   - 집중력이 높은 시간대/환경
3. 시험/합격 운 분석:
   - 언제 시험을 보는 게 유리한지
   - 시험 당일 주의사항/긴장 관리법
4. tabs.study.routine 에 "일주일 공부 루틴" 예시를 구체적으로 제시하세요.
''',
            }

            # 해당 카테고리의 지침 추가
            if topic in category_instructions:
                prompt += category_instructions[topic]

        # [SYSTEM] 시간 표기 관련 지침
        prompt += """
\n
[SYSTEM: 시간 표기 지침]
advanced_analysis.time_uncertainty_note 작성 시, 구체적인 시각(예: 08:30)보다는 위 '시주' 정보에 있는 **전통 시간 명칭(예: 진시(辰時), 술시(戌時) 등)**을 사용하여 기준 시간을 표기하십시오. 이는 사용자가 자신의 출생시 구간을 더 직관적으로 이해하도록 돕기 위함입니다.
"""

        return prompt

    def build_compatibility_prompt(
        self,
        user_a_input: BirthInput,
        user_a_pillars: dict,
        user_a_oheng: dict,
        user_b_input: BirthInput,
        user_b_pillars: dict,
        user_b_oheng: dict,
        version: str = "v1",
        scenario: CompatibilityScenario = CompatibilityScenario.LOVER,
    ) -> str:
        scenario_file = f"compatibility_scenarios/{scenario.value}.txt"
        try:
            template = self._load_template(scenario_file)
        except FileNotFoundError:
            template = self._load_template(f"compatibility_{version}.txt")

        # Pillars formatting Helper
        def format_pillars(p):
            return f"- 년주: {p.get('year')}\n- 월주: {p.get('month')}\n- 일주: {p.get('day')}\n- 시주: {p.get('hour')}"

        def format_oheng(o):
            return f"목:{o.get('목', 0)} 화:{o.get('화', 0)} 토:{o.get('토', 0)} 금:{o.get('금', 0)} 수:{o.get('수', 0)}"

        replacements = {
            "{user_a_birth}": f"{user_a_input.birth_solar} {user_a_input.birth_time}",
            "{user_a_pillars}": format_pillars(user_a_pillars),
            "{user_a_oheng}": format_oheng(user_a_oheng),
            "{user_a_oheng}": format_oheng(user_a_oheng),
            "{user_a_day_master}": user_a_pillars.get("day", "?")[0],  # 천간
            "{user_a_gender}": "남성" if user_a_input.gender == "male" else "여성",
            "{user_a_name}": user_a_input.name or "A",
            "{user_b_birth}": f"{user_b_input.birth_solar} {user_b_input.birth_time}",
            "{user_b_pillars}": format_pillars(user_b_pillars),
            "{user_b_oheng}": format_oheng(user_b_oheng),
            "{user_b_day_master}": user_b_pillars.get("day", "?")[0],
            "{user_b_gender}": "남성" if user_b_input.gender == "male" else "여성",
            "{user_b_name}": user_b_input.name or "B",
        }

        for k, v in replacements.items():
            template = template.replace(k, str(v))

        return template

    def get_prompt_version_info(self, version: str = "v1") -> dict:
        """프롬프트 버전 정보 반환 (프론트 표시용)"""
        return {
            "version": version,
            "description": f"기본 사주 해석 템플릿 {version}",
            "last_updated": "2024-12-29",
        }


# 싱글톤 인스턴스
_prompt_manager: Optional[PromptManager] = None


def get_prompt_manager() -> PromptManager:
    """프롬프트 매니저 싱글톤 반환"""
    global _prompt_manager
    if _prompt_manager is None:
        _prompt_manager = PromptManager()
    return _prompt_manager
