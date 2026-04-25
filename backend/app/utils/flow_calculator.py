from __future__ import annotations

import hashlib
import re
from typing import Dict, List, Literal, Tuple

from .saju_calculator import ELEMENT_MAP, _add_korean_pronunciation


ElementKey = Literal["wood", "fire", "earth", "metal", "water"]
RelationKey = Literal["peer", "resource", "output", "wealth", "power"]

ELEMENT_KEYS: List[ElementKey] = ["wood", "fire", "earth", "metal", "water"]

ELEMENT_KO: Dict[ElementKey, str] = {
    "wood": "목",
    "fire": "화",
    "earth": "토",
    "metal": "금",
    "water": "수",
}

KO_TO_ELEMENT: Dict[str, ElementKey] = {
    "목": "wood",
    "화": "fire",
    "토": "earth",
    "금": "metal",
    "수": "water",
    "wood": "wood",
    "fire": "fire",
    "earth": "earth",
    "metal": "metal",
    "water": "water",
}

REL_KO: Dict[RelationKey, str] = {
    "peer": "비겁",
    "resource": "인성",
    "output": "식상",
    "wealth": "재성",
    "power": "관성",
}

# 합/충 (MVP: 가장 많이 쓰는 관계만)
STEM_COMBINE: Dict[str, str] = {"甲": "己", "己": "甲", "乙": "庚", "庚": "乙", "丙": "辛", "辛": "丙", "丁": "壬", "壬": "丁", "戊": "癸", "癸": "戊"}
BRANCH_COMBINE: Dict[str, str] = {"子": "丑", "丑": "子", "寅": "亥", "亥": "寅", "卯": "戌", "戌": "卯", "辰": "酉", "酉": "辰", "巳": "申", "申": "巳", "午": "未", "未": "午"}
BRANCH_CLASH: Dict[str, str] = {"子": "午", "午": "子", "丑": "未", "未": "丑", "寅": "申", "申": "寅", "卯": "酉", "酉": "卯", "辰": "戌", "戌": "辰", "巳": "亥", "亥": "巳"}

# 상생(생) / 상극(극) 관계
GENERATES: Dict[ElementKey, ElementKey] = {
    "wood": "fire",
    "fire": "earth",
    "earth": "metal",
    "metal": "water",
    "water": "wood",
}
GENERATED_BY: Dict[ElementKey, ElementKey] = {v: k for k, v in GENERATES.items()}

CONTROLS: Dict[ElementKey, ElementKey] = {
    "wood": "earth",
    "earth": "water",
    "water": "fire",
    "fire": "metal",
    "metal": "wood",
}
CONTROLLED_BY: Dict[ElementKey, ElementKey] = {v: k for k, v in CONTROLS.items()}


def _empty_elements() -> Dict[ElementKey, float]:
    return {k: 0.0 for k in ELEMENT_KEYS}


def pillar_to_elements(pillar: str, weight: float = 1.0) -> Dict[ElementKey, float]:
    out = _empty_elements()
    if not pillar or len(pillar) < 2:
        return out
    for char in pillar[:2]:
        elem = ELEMENT_MAP.get(char)
        if elem in out:
            out[elem] += weight
    return out


def add_elements(a: Dict[ElementKey, float], b: Dict[ElementKey, float]) -> Dict[ElementKey, float]:
    out = _empty_elements()
    for k in ELEMENT_KEYS:
        out[k] = float(a.get(k, 0.0)) + float(b.get(k, 0.0))
    return out


def scale_elements(a: Dict[ElementKey, float], scale: float) -> Dict[ElementKey, float]:
    out = _empty_elements()
    for k in ELEMENT_KEYS:
        out[k] = float(a.get(k, 0.0)) * float(scale)
    return out


def merge_weighted_pillars(*parts: Tuple[str, float]) -> Dict[ElementKey, float]:
    """
    parts: [(pillar, weight), ...]
    pillar: '甲子' 형태
    """
    merged = _empty_elements()
    for pillar, weight in parts:
        merged = add_elements(merged, pillar_to_elements(pillar, weight))
    return merged


def compute_balance_weights(oheng_counts: Dict[str, float]) -> Dict[ElementKey, float]:
    """
    원국 오행(0~8 카운트)을 기반으로, 부족하면 +, 과하면 - 가중치를 생성합니다.
    """
    counts = {k: float(oheng_counts.get(k, 0.0)) for k in ELEMENT_KEYS}
    total = sum(counts.values())
    avg = (total / 5.0) if total > 0 else 0.0

    weights: Dict[ElementKey, float] = {}
    for k in ELEMENT_KEYS:
        deficit = max(0.0, avg - counts[k])
        excess = max(0.0, counts[k] - avg)
        weights[k] = deficit - (excess * 0.7)
    return weights


def element_relation(day_master_element: ElementKey, elem: ElementKey) -> RelationKey:
    if elem == day_master_element:
        return "peer"
    if elem == GENERATED_BY[day_master_element]:
        return "resource"
    if elem == GENERATES[day_master_element]:
        return "output"
    if elem == CONTROLS[day_master_element]:
        return "wealth"
    if elem == CONTROLLED_BY[day_master_element]:
        return "power"
    return "peer"

def relation_strengths(period_elements: Dict[ElementKey, float], day_master_korean_or_eng: str) -> Dict[RelationKey, float]:
    dm = KO_TO_ELEMENT.get(day_master_korean_or_eng, "wood")
    strengths: Dict[RelationKey, float] = {"peer": 0.0, "resource": 0.0, "output": 0.0, "wealth": 0.0, "power": 0.0}
    for elem in ELEMENT_KEYS:
        rel = element_relation(dm, elem)
        strengths[rel] += float(period_elements.get(elem, 0.0))
    return strengths


def _love_key_from_gender(gender: str | None) -> str:
    if not gender:
        return "love_neutral"
    g = gender.strip().lower()
    if g in ("male", "m", "남", "남성"):
        return "love_male"
    if g in ("female", "f", "여", "여성"):
        return "love_female"
    return "love_neutral"


REL_WEIGHTS: Dict[str, Dict[RelationKey, float]] = {
    "general": {"peer": 0.0, "resource": 0.15, "output": 0.15, "wealth": 0.15, "power": -0.15},
    "money": {"peer": -0.2, "resource": 0.0, "output": 0.2, "wealth": 0.6, "power": -0.1},
    "career": {"peer": 0.0, "resource": 0.2, "output": -0.1, "wealth": 0.1, "power": 0.6},
    "study": {"peer": 0.0, "resource": 0.6, "output": 0.1, "wealth": -0.1, "power": 0.2},
    "health": {"peer": 0.05, "resource": 0.15, "output": 0.05, "wealth": 0.05, "power": -0.1},
    "love_male": {"peer": -0.2, "resource": 0.0, "output": 0.1, "wealth": 0.6, "power": 0.1},
    "love_female": {"peer": -0.2, "resource": 0.1, "output": 0.1, "wealth": 0.1, "power": 0.6},
    "love_neutral": {"peer": -0.2, "resource": 0.1, "output": 0.1, "wealth": 0.35, "power": 0.35},
}


def _score_from_raw(raw: float) -> int:
    # 선형 매핑 + 클램프 (MVP)
    score = round(50 + (raw * 25))
    return max(0, min(100, int(score)))


def compute_scores(
    period_elements: Dict[ElementKey, float],
    day_master_korean_or_eng: str,
    base_balance_weights: Dict[ElementKey, float],
    gender: str | None = None,
) -> Dict[str, int]:
    dm = KO_TO_ELEMENT.get(day_master_korean_or_eng, "wood")

    def raw_for(category_key: str) -> float:
        rel_weights = REL_WEIGHTS[category_key]
        rel_raw = 0.0
        bal_raw = 0.0
        for elem in ELEMENT_KEYS:
            amount = float(period_elements.get(elem, 0.0))
            rel = element_relation(dm, elem)
            rel_raw += amount * float(rel_weights.get(rel, 0.0))
            bal_raw += amount * float(base_balance_weights.get(elem, 0.0))
        # 카테고리는 관계(십성) 비중을 더 높게
        return (rel_raw * 0.65) + (bal_raw * 0.35)

    love_key = _love_key_from_gender(gender)

    return {
        "general": _score_from_raw(raw_for("general")),
        "love": _score_from_raw(raw_for(love_key)),
        "money": _score_from_raw(raw_for("money")),
        "career": _score_from_raw(raw_for("career")),
        "study": _score_from_raw(raw_for("study")),
        "health": _score_from_raw(raw_for("health")),
    }


def score_badge(score: int) -> str:
    if score >= 75:
        return "매우 좋음"
    if score >= 60:
        return "좋음"
    if score >= 40:
        return "보통"
    return "주의"


def wealth_grade(money_score: int) -> str:
    if money_score >= 80:
        return "S"
    elif money_score >= 65:
        return "A"
    elif money_score >= 50:
        return "B"
    elif money_score >= 35:
        return "C"
    return "D"


def category_note(category: str, score: int) -> str:
    tier = score_badge(score)
    notes: Dict[str, Dict[str, str]] = {
        "general": {
            "매우 좋음": "흐름을 타면 성과가 빠르게 쌓여요.",
            "좋음": "조금만 밀어도 일이 굴러가기 쉬워요.",
            "보통": "무리하지 말고 루틴을 지키면 좋아요.",
            "주의": "확장보다 방어·정리가 우선이에요.",
        },
        "love": {
            "매우 좋음": "만남/관계운이 크게 열려요.",
            "좋음": "대화가 부드럽게 풀리기 쉬워요.",
            "보통": "작은 오해만 조심하면 무난해요.",
            "주의": "감정 폭주·단정 짓기만 피하세요.",
        },
        "money": {
            "매우 좋음": "수익/협상운을 적극적으로 써도 좋아요.",
            "좋음": "정산·협상·제안에 유리해요.",
            "보통": "현금흐름 점검 위주로 가면 좋아요.",
            "주의": "충동지출/무리한 베팅은 피하세요.",
        },
        "career": {
            "매우 좋음": "평가/성과 어필이 잘 먹히는 흐름이에요.",
            "좋음": "업무 정리·보고·피드백에 유리해요.",
            "보통": "관계와 일정 관리만 잘하면 무난해요.",
            "주의": "말실수/충돌 리스크를 낮추는 게 핵심이에요.",
        },
        "study": {
            "매우 좋음": "흡수력·집중력이 크게 올라가는 흐름이에요.",
            "좋음": "정리/암기/문제풀이 효율이 좋아요.",
            "보통": "짧게 끊어가는 공부가 잘 맞아요.",
            "주의": "루틴이 깨지기 쉬우니 최소 단위를 지켜요.",
        },
        "health": {
            "매우 좋음": "회복/컨디션 관리가 수월해요.",
            "좋음": "생활 리듬을 잡기 좋아요.",
            "보통": "과로만 피하면 무난해요.",
            "주의": "수면·소화·면역 루틴을 강화하세요.",
        },
    }
    return notes.get(category, notes["general"]).get(tier, "")

def stable_seed(key: str) -> int:
    # Python hash는 프로세스마다 달라질 수 있어(랜덤 시드), md5로 안정적인 시드를 만듭니다.
    h = hashlib.md5(key.encode("utf-8")).hexdigest()
    return int(h[:8], 16)

def _pick_unique(options: List[str], count: int, seed: int) -> List[str]:
    if not options or count <= 0:
        return []
    uniq: List[str] = []
    seen = set()
    for opt in options:
        if opt and opt not in seen:
            seen.add(opt)
            uniq.append(opt)

    # seed마다 옵션의 우선순위가 달라지도록 안정적인 해시로 정렬
    uniq.sort(key=lambda opt: hashlib.md5(f"{seed}|{opt}".encode("utf-8")).hexdigest())
    return uniq[: min(count, len(uniq))]

def _unique_preserve(items: List[str]) -> List[str]:
    out: List[str] = []
    for it in items:
        if it and it not in out:
            out.append(it)
    return out


def highlight_windows(labels: List[str], scores: List[int], *, good_min_len: int, caution_min_len: int):
    def find(cond, min_len: int) -> List[Tuple[int, int]]:
        windows: List[Tuple[int, int]] = []
        start = None
        for i, s in enumerate(scores):
            if cond(s):
                if start is None:
                    start = i
            else:
                if start is not None and (i - start) >= min_len:
                    windows.append((start, i - 1))
                start = None
        if start is not None and (len(scores) - start) >= min_len:
            windows.append((start, len(scores) - 1))
        return windows

    good = find(lambda s: s >= 60, good_min_len)
    caution = find(lambda s: s <= 39, caution_min_len)

    def summarize(windows: List[Tuple[int, int]]) -> str:
        if not windows:
            return ""
        parts: List[str] = []
        for s, e in windows:
            if s == e:
                parts.append(labels[s])
            else:
                parts.append(f"{labels[s]}~{labels[e]}")
        return ", ".join(parts)

    def to_windows(windows: List[Tuple[int, int]]) -> List[Dict]:
        out = []
        for s, e in windows:
            avg = round(sum(scores[s : e + 1]) / max(1, (e - s + 1)))
            out.append(
                {
                    "start_index": s,
                    "end_index": e,
                    "start_label": labels[s],
                    "end_label": labels[e],
                    "avg_score": int(avg),
                }
            )
        return out

    return {
        "good_windows": to_windows(good),
        "caution_windows": to_windows(caution),
        "good_summary": summarize(good),
        "caution_summary": summarize(caution),
    }


def format_ganji(pillar: str) -> str:
    return _add_korean_pronunciation(pillar)


def dominant_elements(period_elements: Dict[ElementKey, float], top_n: int = 2) -> List[ElementKey]:
    pairs = sorted(period_elements.items(), key=lambda kv: kv[1], reverse=True)
    return [k for k, v in pairs if v > 0][:top_n]


def build_detail_advice(
    *,
    category: str,
    score: int,
    period_elements: Dict[ElementKey, float],
    day_master: str,
    base_counts: Dict[str, float],
    date_key: str = "",
    day_pillar: str = "",
    natal_pillars: Dict[str, str] | None = None,
) -> Dict[str, List[str] | str]:
    dm = KO_TO_ELEMENT.get(day_master, "wood")
    dom = dominant_elements(period_elements, top_n=2)
    dom_kor = [ELEMENT_KO[e] for e in dom] if dom else []
    dom_rel = [REL_KO[element_relation(dm, e)] for e in dom] if dom else []

    if score >= 75:
        tier = "매우 좋음"
    elif score >= 60:
        tier = "좋음"
    elif score >= 40:
        tier = "보통"
    else:
        tier = "주의"

    rel_strength = relation_strengths(period_elements, day_master)
    top_rel: RelationKey = max(rel_strength.keys(), key=lambda k: rel_strength[k])
    rel_ranked = sorted(rel_strength.items(), key=lambda kv: kv[1], reverse=True)
    second_rel: RelationKey = rel_ranked[1][0] if len(rel_ranked) > 1 else top_rel
    top_elem: ElementKey | None = dom[0] if dom else None

    # 날짜/카테고리/간지 특성을 시드로 사용 (같은 날짜는 항상 같은 문장 조합)
    seed = stable_seed(f"{date_key}|{category}|{score}|{top_rel}|{top_elem or ''}|{','.join(dom_kor)}")

    # 동적 요약(같은 점수라도 내용이 달라지도록)
    SUMMARY_TEMPLATES: Dict[str, Dict[RelationKey, List[str]]] = {
        "money": {
            "wealth": ["재성 흐름이 살아서 ‘정산/거래’가 잘 풀리기 쉬워요.", "돈의 흐름이 움직이는 날이라 조건 협상에 유리해요."],
            "output": ["식상 흐름이라 아이디어를 ‘제안/판매’로 연결하기 좋아요.", "성과를 숫자/결과물로 만들어 돈으로 바꾸기 좋아요."],
            "resource": ["인성 흐름이라 정보/문서 정리가 곧 돈이 돼요.", "자료/근거를 쌓을수록 손해를 줄일 수 있어요."],
            "power": ["관성 압박이 들어오면 지출/리스크 관리가 핵심이에요.", "규칙·마감이 돈의 흐름을 좌우해요. 방어가 우선이에요."],
            "peer": ["비겁 기운이 올라 경쟁/비교심이 커질 수 있어요. 원칙을 잡아야 해요.", "주변 영향으로 소비/판단이 흔들릴 수 있어요. 기준을 세우세요."],
        },
        "career": {
            "power": ["관성 흐름이라 ‘평가/책임/규율’에 성과가 달려요.", "오늘은 기준·역할이 또렷할수록 일이 잘 풀려요."],
            "resource": ["인성 흐름이라 문서/정리/기획이 빛을 봐요.", "자료를 잘 쥐면 설득력이 확 올라가요."],
            "output": ["식상 흐름이라 실행·발표·성과물이 강점이에요.", "말/표현/결과물로 존재감을 만드는 날이에요."],
            "wealth": ["재성 흐름이라 실적/숫자/성과 정리가 유리해요.", "현실적인 결과(수치/매출/지표)로 승부하기 좋아요."],
            "peer": ["비겁 흐름이라 ‘내 방식’ 고집이 생길 수 있어요. 조율이 포인트예요.", "동료와 경쟁/비교가 생길 수 있어요. 역할을 나누세요."],
        },
        "study": {
            "resource": ["인성 흐름이라 흡수/이해가 잘 되는 날이에요.", "정리/복습이 공부 효율을 확 끌어올려요."],
            "power": ["관성 흐름이라 규칙/루틴을 지키면 성과가 나요.", "시험·마감형 공부에 특히 잘 맞는 날이에요."],
            "output": ["식상 흐름이라 ‘문제풀이/설명’으로 실력이 붙어요.", "배운 걸 말로 풀어내면 기억에 오래 남아요."],
            "wealth": ["재성 흐름이라 목표/성과(점수)를 의식하면 집중이 돼요.", "가성비 좋은 공부(핵심/빈출)에 힘을 실어보세요."],
            "peer": ["비겁 흐름이라 ‘하다가 딴길’로 새기 쉬워요. 범위를 좁히세요.", "다른 사람 페이스에 휘둘리지 말고 내 루틴을 지켜요."],
        },
        "health": {
            "resource": ["인성 흐름이라 회복/정비 루틴을 깔기 좋아요.", "컨디션을 끌어올리려면 ‘정리/휴식’이 답이에요."],
            "power": ["관성 흐름이라 과로/압박이 쌓이기 쉬워요. 선을 긋는 게 중요해요.", "무리하면 바로 티가 날 수 있어요. 속도를 조절하세요."],
            "output": ["식상 흐름이라 활동량을 조금 올리면 리듬이 좋아져요.", "가볍게 땀 내는 활동이 컨디션에 도움 돼요."],
            "wealth": ["재성 흐름이라 먹는 것/소비성 습관이 몸에 바로 반영돼요.", "습관을 관리하면 컨디션이 빨리 좋아져요."],
            "peer": ["비겁 흐름이라 버티는 힘은 올라가지만 무리하기 쉬워요.", "‘참고 버티기’보다 ‘조절’이 이기는 날이에요."],
        },
        "love": {
            "wealth": ["재성 포인트가 살아서 ‘호감/현실적인 만남’이 진전되기 쉬워요.", "만남의 확률을 올리려면 구체적인 제안이 먹혀요."],
            "power": ["관성 포인트가 강하면 관계에서 ‘약속/신뢰’가 핵심이에요.", "선을 지키는 대화가 오히려 매력으로 보여요."],
            "output": ["식상 포인트가 강하면 표현/유머/분위기 메이킹이 좋아요.", "말 한마디가 분위기를 바꾸는 날이에요."],
            "resource": ["인성 포인트가 강하면 공감/경청이 힘이에요.", "상대의 맥락을 읽어주면 관계가 편해져요."],
            "peer": ["비겁 포인트가 강하면 자존심 싸움이 날 수 있어요.", "이기려는 대화만 피하면 훨씬 부드러워져요."],
        },
        "general": {
            "resource": ["인성 흐름이라 정리/학습/준비가 곧 기회예요.", "자료를 쌓고 기반을 다지기 좋아요."],
            "output": ["식상 흐름이라 실행/표현/성과를 내기 좋아요.", "오늘은 ‘하는 만큼 보이는’ 날이에요."],
            "wealth": ["재성 흐름이라 현실적인 결과(돈/성과)를 챙기기 좋아요.", "정리된 만큼 수확이 생겨요."],
            "power": ["관성 흐름이라 규칙/책임을 잘 다루면 흐름이 좋아져요.", "무리한 확장보다 방어/관리로 이기는 날이에요."],
            "peer": ["비겁 흐름이라 내 페이스를 지키는 게 중요해요.", "고집을 줄이고 조율하면 더 유리해요."],
        },
    }

    summary_templates = SUMMARY_TEMPLATES.get(category, SUMMARY_TEMPLATES["general"]).get(top_rel, [])
    summary_core = _pick_unique(summary_templates, 1, seed + 7)
    summary = summary_core[0] if summary_core else category_note(category, score)

    if top_elem:
        summary = f"{summary} (키워드: {REL_KO[top_rel]} · {ELEMENT_KO[top_elem]})"

    # 원국의 약/강 오행 (참고용)
    counts = {k: float(base_counts.get(k, 0.0)) for k in ELEMENT_KEYS}
    min_val = min(counts.values()) if counts else 0.0
    max_val = max(counts.values()) if counts else 0.0
    lacking = [k for k, v in counts.items() if v == min_val]
    dominant = [k for k, v in counts.items() if v == max_val]
    lacking_kor = "·".join([ELEMENT_KO[k] for k in lacking[:2]]) if lacking else ""
    dominant_kor = "·".join([ELEMENT_KO[k] for k in dominant[:2]]) if dominant else ""

    # 밸런스(부족/과다) 관점의 일별 차이를 더 드러내기
    balance_weights = compute_balance_weights(base_counts)
    contrib = {e: float(period_elements.get(e, 0.0)) * float(balance_weights.get(e, 0.0)) for e in ELEMENT_KEYS}
    pos_elem = max(contrib.keys(), key=lambda k: contrib[k]) if contrib else None
    neg_elem = min(contrib.keys(), key=lambda k: contrib[k]) if contrib else None

    # 원국과 오늘의 합/충(간단 버전)
    interaction_lines: List[str] = []
    if natal_pillars and day_pillar and len(day_pillar) >= 2:
        ds, db = day_pillar[0], day_pillar[1]
        natal_items = [(pos, p) for pos, p in natal_pillars.items() if p and len(p) >= 2]
        natal_branches = [(pos, p[1]) for pos, p in natal_items]
        natal_stems = [(pos, p[0]) for pos, p in natal_items]

        # 지지 합/충
        for pos, b in natal_branches:
            if db == b:
                interaction_lines.append(f"오늘의 일지 {db}가 원국 {pos}지지와 같아서 해당 테마가 반복되기 쉬워요.")
                break
        for pos, b in natal_branches:
            if BRANCH_COMBINE.get(db) == b:
                interaction_lines.append(f"오늘의 일지 {db}가 원국 {pos}지지와 합(六合)이라 연결/도움이 붙기 쉬워요.")
                break
        for pos, b in natal_branches:
            if BRANCH_CLASH.get(db) == b:
                interaction_lines.append(f"오늘의 일지 {db}가 원국 {pos}지지와 충(冲)이라 변동/재조정 이슈가 생길 수 있어요.")
                break

        # 천간 합(가볍게)
        for pos, s in natal_stems:
            if STEM_COMBINE.get(ds) == s:
                interaction_lines.append(f"오늘의 천간 {ds}가 원국 {pos}천간과 합(合)이라 협업/타협이 쉬울 수 있어요.")
                break

    why: List[str] = []
    if dom_kor:
        dom_templates = [
            f"이 날은 {', '.join(dom_kor)} 기운이 도드라져요. ({', '.join(dom_rel)})",
            f"{', '.join(dom_kor)} 쪽으로 기운이 몰리면서 {', '.join(dom_rel)} 포인트가 두드러져요.",
            f"오늘은 {', '.join(dom_kor)} 기운이 강해 {', '.join(dom_rel)} 흐름이 잘 보여요.",
        ]
        why.append(_pick_unique(dom_templates, 1, seed + 101)[0])

    rel_templates = [
        f"선택한 카테고리 관점에서는 {REL_KO[top_rel]} 포인트가 가장 크게 움직여요.",
        f"오늘은 {REL_KO[top_rel]} 흐름이 핵심이라 그쪽 선택이 결과를 좌우해요.",
        f"{REL_KO[top_rel]} 쪽 이슈가 들어오기 쉬워요. (일/관계/돈의 '형태'가 그쪽으로 잡혀요)",
    ]
    why.append(_pick_unique(rel_templates, 1, seed + 103)[0])

    extra_candidates: List[str] = []
    if pos_elem and contrib.get(pos_elem, 0.0) > 0.15:
        extra_candidates.append(f"밸런스 관점에서는 {ELEMENT_KO[pos_elem]} 보충 쪽으로 도움이 돼요.")
    if neg_elem and contrib.get(neg_elem, 0.0) < -0.15:
        extra_candidates.append(f"반대로 {ELEMENT_KO[neg_elem]} 쪽은 과열/부담으로 번지지 않게 조절이 필요해요.")
    if lacking_kor and any(e in lacking for e in dom):
        extra_candidates.append(f"특히 원국에서 약한 {lacking_kor} 기운이 들어와 보완 포인트가 생겨요.")
    if dominant_kor and any(e in dominant for e in dom):
        extra_candidates.append(f"반대로 원국에서 강한 {dominant_kor} 기운이 더해지면 과해질 수 있어요. 페이스 조절이 포인트예요.")
    extra_candidates += interaction_lines[:2]

    why += _pick_unique(extra_candidates, max(0, 3 - len(why)), seed + 107)

    # Do/Don't를 날짜별로 다르게 만들기: (관계/오행/점수 구간) 기반으로 조합
    ELEMENT_DO: Dict[ElementKey, List[str]] = {
        "wood": ["새로운 만남/기회는 ‘가볍게 시도’로 문을 열기", "외부 활동/이동을 조금 늘려 흐름을 깨우기", "작게 시작해서 점진적으로 확장하기"],
        "fire": ["표현/제안/발표처럼 ‘보이는 행동’을 한 번 하기", "분위기를 밝게 만드는 말/메시지를 먼저 던지기", "짧게라도 추진력을 붙여 마무리까지 가기"],
        "earth": ["정리/정돈/마감으로 기반을 단단히 만들기", "일정을 촘촘히 잡기보다 여유 버퍼를 확보하기", "큰 결정보다 루틴/기반을 다지는 선택하기"],
        "metal": ["기준/우선순위를 정하고 과감히 쳐내기", "문서/약속/계약은 ‘명확한 문장’으로 남기기", "깔끔한 결정(YES/NO)을 내리기"],
        "water": ["리서치/정보 수집으로 불확실성을 줄이기", "경청/관찰을 늘리고 말은 한 템포 늦추기", "수면/수분/휴식으로 회복력을 챙기기"],
    }
    ELEMENT_DONT: Dict[ElementKey, List[str]] = {
        "wood": ["일을 한 번에 벌리기(확장 과속)", "약속을 과하게 잡아 일정이 터지게 만들기"],
        "fire": ["감정이 달아오른 상태에서 결론 내리기", "말로 이기려는 대화/공개적인 충돌"],
        "earth": ["답답해서 갑자기 판을 뒤엎기", "현실 회피로 미루기/방치하기"],
        "metal": ["날카로운 말/평가로 관계를 깎기", "완벽주의로 시작을 못 하는 것"],
        "water": ["불안해서 결정을 계속 미루기", "과도한 걱정/상상으로 컨디션 떨어뜨리기"],
    }

    CAT_REL_DO: Dict[str, Dict[RelationKey, List[str]]] = {
        "money": {
            "wealth": ["정산/청구/미수금 같은 ‘돈이 정리되는 일’을 처리하기", "가격/조건/분배를 문서로 명확히 하기", "소액으로 테스트하고 데이터로 확장하기"],
            "output": ["아이디어를 제안서/상품/콘텐츠로 만들어보기", "한 가지 채널에 집중해 노출/홍보를 올리기", "성과물(포트폴리오)을 업데이트하기"],
            "resource": ["세금/계약/정산 자료를 한 번 정리하기", "지출 로그를 만들고 패턴을 파악하기", "돈 관련 의사결정은 ‘근거 1개’ 확보 후 하기"],
            "power": ["지출 상한선/규칙을 정하고 그대로 지키기", "카드/구독/고정비를 점검해서 줄이기", "리스크 큰 결제/투자는 보류하기"],
            "peer": ["친분보다 원칙(정산/분배)을 먼저 정하기", "남과 비교하는 소비 대신 목표 기준으로 쓰기", "공동 지출은 항목별로 정리하기"],
        },
        "career": {
            "power": ["업무 범위/마감/책임을 명확히 합의하기", "보고/정리로 신뢰를 쌓기", "리스크 체크리스트를 만들고 선제 대응하기"],
            "resource": ["자료/근거를 모아 설득력 있게 정리하기", "문서화(요약/회의록)로 정보 손실 줄이기", "배경지식/레퍼런스를 빠르게 채우기"],
            "output": ["결과물(문서/코드/발표)을 빠르게 내기", "아이디어를 실행 가능한 단계로 쪼개기", "피드백을 받아 바로 개선하기"],
            "wealth": ["성과지표/숫자를 정리해 공유하기", "현실적인 성과(납기/품질)로 승부하기", "불필요한 일을 쳐내고 핵심에 집중하기"],
            "peer": ["역할/담당을 분명히 나누기", "고집보다 조율(타협안)을 먼저 제시하기", "경쟁심 대신 협업 포인트를 찾기"],
        },
        "study": {
            "resource": ["개념 정리/요약 노트를 만들기", "복습(회고) 비중을 늘리기", "강의/교재를 한 가지로 고정해 파고들기"],
            "power": ["시간/규칙을 정해 타이머로 지키기", "시험형(빈출/기출) 위주로 구조화하기", "계획을 ‘오늘 할 3개’로 줄이기"],
            "output": ["문제풀이 → 오답노트로 바로 연결하기", "배운 걸 ‘설명’해보며 확인하기", "짧은 단위로 반복해서 감을 붙이기"],
            "wealth": ["가성비 높은 파트(점수 잘 나는 부분)에 집중하기", "성과 기록(점수/진도)을 남기기", "방해 요소(앱/알림)를 차단하기"],
            "peer": ["남과 비교 말고 내 루틴을 고정하기", "같이 공부한다면 ‘시간’만 맞추고 범위는 분리하기", "잡생각이 늘면 과제를 더 작게 쪼개기"],
        },
        "health": {
            "resource": ["수면/식사/정리로 회복 루틴을 잡기", "따뜻하게 몸을 풀고 긴장을 낮추기", "과로를 줄이고 쉬는 시간을 확보하기"],
            "power": ["일정을 줄이고 무리한 약속을 끊기", "스트레스원(업무/관계)을 한 단계 내려놓기", "규칙적인 생활로 리듬을 고정하기"],
            "output": ["가벼운 유산소/스트레칭으로 순환 올리기", "짧게라도 햇빛/산책으로 리셋하기", "몸을 움직여 답답함을 풀기"],
            "wealth": ["과식/과음/야식 줄이기", "단 음식/카페인 조절하기", "몸이 좋아하는 ‘가벼운 식단’으로 정리하기"],
            "peer": ["버티기보다 조절(강도/시간)을 우선하기", "혼자 참지 말고 도움/휴식을 요청하기", "컨디션 기준으로 일정 재조정하기"],
        },
        "love": {
            "wealth": ["만남/연락을 ‘구체적 제안’으로 만들기(언제/어디서)", "현실적인 배려(시간/동선)를 챙기기", "호감 신호는 가볍게 먼저 표현하기"],
            "power": ["약속/기준을 명확히 하고 지키기", "선을 지키되 따뜻하게 말하기", "중요한 얘기는 차분한 타이밍에 하기"],
            "output": ["칭찬/유머/표현으로 분위기를 만들기", "대화의 주도권을 ‘즐겁게’ 잡기", "상대가 좋아할 경험(코스)을 제안하기"],
            "resource": ["상대 말을 재확인하며 공감하기", "상대의 맥락/상황을 이해하려고 질문하기", "서두르지 말고 신뢰를 쌓기"],
            "peer": ["자존심 싸움 대신 공동 목표를 제안하기", "상대의 속도를 존중하기", "비교/평가 대신 감정만 공유하기"],
        },
        "general": {
            "resource": ["정리/준비/학습으로 기반 다지기", "자료를 모아 ‘한 번에’ 정리하기", "휴식으로 회복력을 확보하기"],
            "output": ["결과물 하나를 끝까지 완성하기", "표현/공유로 기회를 만들기", "해야 할 일을 작게 쪼개 바로 착수하기"],
            "wealth": ["현실적인 성과(돈/마감/정리)를 챙기기", "불필요한 것을 줄이고 효율 올리기", "정산/정리로 마음을 가볍게 만들기"],
            "power": ["규칙/경계선을 만들고 지키기", "방어·리스크 관리로 안정 만들기", "책임을 과하게 떠안지 않기"],
            "peer": ["내 페이스를 지키기(비교 금지)", "고집을 줄이고 조율하기", "혼자 다 하려 하지 말고 분담하기"],
        },
    }

    CAT_REL_DONT: Dict[str, Dict[RelationKey, List[str]]] = {
        "money": {
            "wealth": ["무리한 베팅/단기 고위험 투자", "친분 기반 돈거래(보증/빌려주기)", "계약을 구두로만 진행하기"],
            "output": ["아이디어만 늘리고 실행/정산을 미루기", "홍보만 하다 마무리(구매/결제)를 놓치기", "근거 없이 감으로만 가격 책정하기"],
            "resource": ["검증 없이 추천/소문을 믿고 움직이기", "세금/수수료/조건을 확인 안 하고 결제하기", "지출을 ‘기분’으로 처리하기"],
            "power": ["벌금/위약금/마감 리스크를 무시하기", "현금흐름을 안 보고 큰 결제하기", "감정적으로 환불/취소를 결정하기"],
            "peer": ["남의 소비 페이스 따라가기", "비교/질투로 소비 결정을 내리기", "공동지출을 애매하게 두기"],
        },
        "career": {
            "power": ["말실수/감정 섞인 피드백", "범위/마감이 불명확한 채로 시작하기", "규정/프로세스를 무시하기"],
            "resource": ["자료 없이 주장만 밀어붙이기", "회의/결정을 기록 없이 흘려보내기", "공부만 하고 실행을 미루기"],
            "output": ["완성도를 이유로 계속 미루기", "아이디어를 한 번에 너무 크게 벌리기", "피드백 없이 혼자 끌고 가기"],
            "wealth": ["숫자/성과를 숨기거나 모호하게 말하기", "불필요한 일을 끌어안기", "실속 없이 보여주기만 하기"],
            "peer": ["팀원과 자존심 싸움", "역할 겹침을 방치하기", "남 탓/비교로 분위기 흐리기"],
        },
        "study": {
            "resource": ["여러 자료를 동시에 갈아타기", "정리 없이 계속 새로 보기만 하기", "수면을 깎아 공부하기"],
            "power": ["계획만 세우고 시작을 미루기", "마감 직전에 몰아서 하기", "규칙을 계속 바꾸기"],
            "output": ["문제풀이만 하고 오답 정리를 안 하기", "양만 채우고 복습을 안 하기", "집중이 깨지는 환경에 오래 있기"],
            "wealth": ["점수만 집착해서 페이스가 무너지기", "비교로 자신감 잃기", "작심삼일로 강한 계획을 세우기"],
            "peer": ["친구 페이스에 맞추느라 루틴 깨기", "잡담/SNS로 시간을 새기", "자기비난으로 끊기"],
        },
        "health": {
            "resource": ["밤샘/수면 부족", "무리한 약속으로 회복 시간 없애기", "몸 신호를 무시하고 버티기"],
            "power": ["압박을 혼자 다 떠안기", "강행군 일정 유지하기", "스트레스를 과음/과식으로 풀기"],
            "output": ["갑자기 강도 높은 운동", "과열되는 활동(무리한 경쟁)", "컨디션 안 좋은데 버티기"],
            "wealth": ["야식/단 음식 과다", "카페인 과다", "과음/폭식"],
            "peer": ["‘괜찮다’며 참고 넘기기", "휴식 죄책감", "컨디션 나쁜데 약속 강행"],
        },
        "love": {
            "wealth": ["감정 폭주 상태의 장문 메시지", "상대의 상황을 무시한 요구", "돈/선물로만 마음을 확인하려 하기"],
            "power": ["단정/훈계조 말투", "약속을 애매하게 흘리기", "상대를 통제하려는 행동"],
            "output": ["말로만 분위기 띄우고 진지한 얘기를 피하기", "장난/농담이 선을 넘기", "과한 플러팅으로 부담 주기"],
            "resource": ["상대 말에 결론을 빨리 내리기", "숨은 뜻 추측으로 오해 만들기", "확인 없이 불안만 키우기"],
            "peer": ["자존심 싸움/밀당", "비교/평가", "이기려는 대화"],
        },
        "general": {
            "resource": ["생각만 많고 실행을 미루기", "휴식 없이 버티기", "정리 없이 일을 벌리기"],
            "output": ["시작만 하고 마무리 안 하기", "너무 많은 걸 동시에 하려 하기", "말이 과해 약속을 남발하기"],
            "wealth": ["충동적인 확장/지출", "실속 없는 선택", "정리 없이 계약/약속하기"],
            "power": ["감정적으로 결론 내리기", "책임을 과하게 떠안기", "갈등을 정면으로 키우기"],
            "peer": ["비교/경쟁으로 흔들리기", "고집으로 조율을 포기하기", "혼자 다 하려 하기"],
        },
    }

    cat_do = CAT_REL_DO.get(category, CAT_REL_DO["general"])
    cat_dont = CAT_REL_DONT.get(category, CAT_REL_DONT["general"])

    do: List[str] = []
    dont: List[str] = []

    # 1) 카테고리 핵심(십성) 1개
    do += _pick_unique(cat_do.get(top_rel, []), 1, seed + 11)
    dont += _pick_unique(cat_dont.get(top_rel, []), 1, seed + 13)

    # 2) 밸런스 관점 오행 1개(없으면 상위 오행)
    if pos_elem:
        do += _pick_unique(ELEMENT_DO.get(pos_elem, []), 1, seed + 17)
    elif top_elem:
        do += _pick_unique(ELEMENT_DO.get(top_elem, []), 1, seed + 17)

    if neg_elem:
        dont += _pick_unique(ELEMENT_DONT.get(neg_elem, []), 1, seed + 19)
    elif top_elem:
        dont += _pick_unique(ELEMENT_DONT.get(top_elem, []), 1, seed + 19)

    # 3) 보조 십성(2등) 1개로 변동감 추가
    do += _pick_unique(cat_do.get(second_rel, []), 1, seed + 23)
    dont += _pick_unique(cat_dont.get(second_rel, []), 1, seed + 29)

    # 합/충 신호가 잡히면 Do/Don't를 한 줄 더 보정 (날짜별 변동감)
    if interaction_lines:
        if any("충(冲)" in s for s in interaction_lines):
            do.append("일정/대화를 ‘한 템포’ 늦추고, 여유 버퍼를 남기기")
            dont.append("결론을 급하게 내리거나 감정적으로 선을 넘기기")
        if any("합(六合)" in s or "합(合)" in s for s in interaction_lines):
            do.append("연락/협업/조율처럼 ‘사람을 통한 해결’을 시도하기")

    # 부족하면 안전한 기본 템플릿으로 채우기
    fallback_do = [
        "가장 중요한 1가지만 선택해서 집중하기",
        "확장보다 ‘정리/정돈/마감’을 먼저 처리하기",
        "결정은 '근거 1개' 확보 후 내리기",
        "연락/협업은 짧고 명확하게 하기",
    ]
    fallback_dont = [
        "감정적 결론/즉흥적 결정을 내리기",
        "동시에 여러 이슈를 크게 벌리기",
        "밤샘으로 리듬을 무너뜨리기",
        "확인 없이 추측으로 결론 내리기",
    ]

    do = _unique_preserve(do + _pick_unique(fallback_do, 3, seed + 41))[:3]
    dont = _unique_preserve(dont + _pick_unique(fallback_dont, 3, seed + 43))[:3]

    # 점수 구간별 ‘첫 줄’ 톤 보강
    if do and tier == "매우 좋음":
        do[0] = "(확장) " + do[0]
    if dont and tier == "주의":
        dont[0] = "(특히 주의) " + dont[0]

    caution_note = ""
    if category == "health":
        caution_note = "비의료 참고용이에요. 증상이 있다면 전문가와 상담하세요."

    return {
        "summary": summary,
        "why": why[:3],
        "do": do[:3],
        "dont": dont[:3],
        "caution_note": caution_note,
    }


def get_saju_character(day_stem: str) -> dict:
    """일간(日干) 10가지 → 10 캐릭터 고정 매핑 (결정론적)"""
    CHARACTER_MAP = {
        "甲": {"type": "leader", "name": "숲의 리더", "icon_path": "/icons/emoji-replacements/characters/gap_wood.png", "description": "곧은 신념으로 앞장서는 선구자", "element": "목"},
        "乙": {"type": "adapter", "name": "적응의 달인", "icon_path": "/icons/emoji-replacements/characters/eul_wood.png", "description": "어디서든 뿌리내리는 유연한 생존가", "element": "목"},
        "丙": {"type": "sun", "name": "열정의 태양", "icon_path": "/icons/emoji-replacements/characters/byung_fire.png", "description": "주변을 밝히는 에너지 넘치는 존재", "element": "화"},
        "丁": {"type": "candle", "name": "은밀한 촛불", "icon_path": "/icons/emoji-replacements/characters/jung_fire.png", "description": "조용히 빛나는 깊은 통찰력의 소유자", "element": "화"},
        "戊": {"type": "mountain", "name": "흔들림 없는 산", "icon_path": "/icons/emoji-replacements/characters/mu_earth.png", "description": "믿음직한 안정감의 상징", "element": "토"},
        "己": {"type": "garden", "name": "품어주는 대지", "icon_path": "/icons/emoji-replacements/characters/gi_earth.png", "description": "모든 것을 품고 키워내는 포용력", "element": "토"},
        "庚": {"type": "sword", "name": "냉철한 검", "icon_path": "/icons/emoji-replacements/characters/gyung_metal.png", "description": "날카로운 판단력과 결단력의 화신", "element": "금"},
        "辛": {"type": "gem", "name": "빛나는 보석", "icon_path": "/icons/emoji-replacements/characters/shin_metal.png", "description": "섬세한 감각과 아름다움을 추구하는 심미안", "element": "금"},
        "壬": {"type": "ocean", "name": "거침없는 파도", "icon_path": "/icons/emoji-replacements/characters/im_water.png", "description": "자유롭고 거침없는 도전 정신", "element": "수"},
        "癸": {"type": "dew", "name": "스며드는 이슬", "icon_path": "/icons/emoji-replacements/characters/gye_water.png", "description": "조용히 스며들어 변화를 이끄는 지혜", "element": "수"},
    }
    return CHARACTER_MAP.get(day_stem, {"type": "unknown", "name": "미지의 존재", "icon_path": "/icons/emoji-replacements/misc/sparkle.png", "description": "특별한 기운을 가진 존재", "element": ""})


def extract_korean_pillar(pillar_str: str) -> str:
    """한자+괄호 형태 pillar에서 한글 추출.
    
    입력: "乙亥(을해)" → "을해", "을해" → "을해", "" → "", None → ""
    """
    if not pillar_str:
        return ""
    match = re.search(r'\((.+?)\)', pillar_str)
    if match:
        return match.group(1)
    return pillar_str


def convert_pillars_for_analysis(pillars_json: dict) -> dict:
    """PillarsData(한자) → analyze_past_years 입력(한글) 형태 변환.
    
    입력: {"year": "乙亥(을해)", "month": "壬午(임오)", "day": "甲子(갑자)", "hour_A": "庚辰(경진)", ...}
    출력: {"year": "을해", "month": "임오", "day": "갑자", "hour": "경진"}
    """
    return {
        "year": extract_korean_pillar(pillars_json.get("year", "")),
        "month": extract_korean_pillar(pillars_json.get("month", "")),
        "day": extract_korean_pillar(pillars_json.get("day", "")),
        "hour": extract_korean_pillar(pillars_json.get("hour_A") or pillars_json.get("hour", "")),
    }


def analyze_past_years(
    natal_pillars: dict,
    birth_year: int,
    current_year: int,
) -> list:
    """과거 연도별 세운과 원국의 충/합/형/파/해 교차 분석 (결정론적)"""
    results = []
    natal_branches = []
    for key in ["year", "month", "day", "hour"]:
        pillar = natal_pillars.get(key, "")
        if pillar and len(pillar) >= 2:
            natal_branches.append(pillar[1])

    CHUNG_MAP = {
        "자": "오", "오": "자", "축": "미", "미": "축",
        "인": "신", "신": "인", "묘": "유", "유": "묘",
        "진": "술", "술": "진", "사": "해", "해": "사",
    }

    HYUNG_MAP = {
        "인": "사", "사": "신", "신": "인",
        "축": "술", "술": "미", "미": "축",
        "자": "묘", "묘": "자",
    }

    PA_MAP = {
        "자": "유", "유": "자", "축": "진", "진": "축",
        "인": "해", "해": "인", "묘": "오", "오": "묘",
        "사": "신", "신": "사", "미": "술", "술": "미",
    }

    HAE_MAP = {
        "자": "미", "미": "자", "축": "오", "오": "축",
        "인": "사", "사": "인", "묘": "진", "진": "묘",
        "신": "해", "해": "신", "유": "술", "술": "유",
    }

    GANJI_60 = [
        "갑자", "을축", "병인", "정묘", "무진", "기사", "경오", "신미", "임신", "계유",
        "갑술", "을해", "병자", "정축", "무인", "기묘", "경진", "신사", "임오", "계미",
        "갑신", "을유", "병술", "정해", "무자", "기축", "경인", "신묘", "임진", "계사",
        "갑오", "을미", "병신", "정유", "무술", "기해", "경자", "신축", "임인", "계묘",
        "갑진", "을사", "병오", "정미", "무신", "기유", "경술", "신해", "임자", "계축",
        "갑인", "을묘", "병진", "정사", "무오", "기미", "경신", "신유", "임술", "계해",
    ]

    for year in range(birth_year + 1, current_year + 1):
        idx = (year - 4) % 60
        year_ganji = GANJI_60[idx]
        year_branch = year_ganji[1]

        interactions = []
        for nb in natal_branches:
            if CHUNG_MAP.get(nb) == year_branch:
                interactions.append(("충", "강함"))
            if HYUNG_MAP.get(nb) == year_branch:
                interactions.append(("형", "보통"))
            if PA_MAP.get(nb) == year_branch:
                interactions.append(("파", "보통"))
            if HAE_MAP.get(nb) == year_branch:
                interactions.append(("해", "보통"))

        if interactions:
            most_severe = max(interactions, key=lambda x: 0 if x[1] == "보통" else 1)
            results.append(
                {
                    "year": year,
                    "year_ganji": year_ganji,
                    "interaction_type": "/".join(set(i[0] for i in interactions)),
                    "severity": most_severe[1],
                }
            )

    return results
