from sajupy import calculate_saju
from datetime import datetime, timedelta, date
import logging

logger = logging.getLogger(__name__)

# 천간/지지 한글 매핑
CHEONGAN_MAP = {
    '甲': '갑', '乙': '을', '丙': '병', '丁': '정', '戊': '무',
    '己': '기', '庚': '경', '辛': '신', '壬': '임', '癸': '계'
}
JIJI_MAP = {
    '子': '자', '丑': '축', '寅': '인', '卯': '묘', '辰': '진', '巳': '사',
    '午': '오', '未': '미', '申': '신', '酉': '유', '戌': '술', '亥': '해'
}

ELEMENT_MAP = {
    '甲': 'wood', '乙': 'wood', '寅': 'wood', '卯': 'wood',
    '丙': 'fire', '丁': 'fire', '巳': 'fire', '午': 'fire',
    '戊': 'earth', '己': 'earth', '辰': 'earth', '戌': 'earth', '丑': 'earth', '未': 'earth',
    '庚': 'metal', '辛': 'metal', '申': 'metal', '酉': 'metal',
    '壬': 'water', '癸': 'water', '亥': 'water', '子': 'water'
}

# 신살 룩업 테이블
# 신살 룩업 테이블 (교차 검증 완료)
TE_GUIN = {
    "甲": ["丑", "未"], "戊": ["丑", "未"], "庚": ["丑", "未"],
    "乙": ["子", "申"], "己": ["子", "申"],
    "丙": ["亥", "酉"], "丁": ["亥", "酉"],
    "辛": ["午", "寅"],
    "壬": ["巳", "卯"], "癸": ["巳", "卯"]
}
TAEGEUK_GUIN = {
    '甲': ['子', '午'], '乙': ['子', '午'],
    '丙': ['卯', '酉'], '丁': ['卯', '酉'],
    '戊': ['辰', '戌', '丑', '未'], '己': ['辰', '戌', '丑', '未'],
    '庚': ['寅', '亥'], '辛': ['寅', '亥'],
    '壬': ['巳', '申'], '癸': ['巳', '申']
}
MUNCHANG_GUIN = {
    '甲': ['巳'], '乙': ['午'], '丙': ['申'], '丁': ['酉'], '戊': ['申'],
    '己': ['酉'], '庚': ['亥'], '辛': ['子'], '壬': ['寅'], '癸': ['卯']
}
HAKDANG_GUIN = {
    '甲': ['亥'], '乙': ['午'], '丙': ['寅'], '丁': ['酉'], '戊': ['寅'],
    '己': ['酉'], '庚': ['巳'], '辛': ['子'], '壬': ['申'], '癸': ['卯']
}
YANGIN_SAL = {
    '甲': ['卯'], '乙': ['辰'], '丙': ['午'], '丁': ['未'], '戊': ['午'], 
    '己': ['未'], '庚': ['酉'], '辛': ['戌'], '壬': ['子'], '癸': ['丑']
}
HONGYEOM_SAL = {
    '甲': ['午', '申'], '丙': ['寅'], '丁': ['未'], '戊': ['辰'],
    '己': ['辰'], '庚': ['戌', '申'], '辛': ['酉'], '壬': ['子'], '癸': ['申']
}
SHINSAL_NAMES = ["겁살","재살","천살","지살","연살","월살","망신살","장성살","반안살","역마살","육해살","화개살"]
TRIAD_START_MAP = {
    "寅":"亥", "午":"亥", "戌":"亥",
    "申":"巳", "子":"巳", "辰":"巳",
    "巳":"寅", "酉":"寅", "丑":"寅",
    "亥":"申", "卯":"申", "未":"申"
}
BAEKHO_SAL = ["甲辰", "乙未", "丙戌", "丁丑", "戊辰", "壬戌", "癸丑"]
GOEGANG_SAL = ["庚辰", "庚戌", "壬辰", "壬戌", "戊戌"]

# 천간/지지 순서 (인덱스 계산용)
CHEONGANS = list("甲乙丙丁戊己庚辛壬癸")
JIJIS = list("子丑寅卯辰巳午未申酉戌亥")

# 합충형파해 정의
HEAVENLY_HAP = {
    ('甲', '己'): '갑기합토 (중정지합) - 분수를 지키고 마음이 넓으며 타인과 잘 어울립니다. 넉넉하고 안정적인 성품을 의미합니다.',
    ('乙', '庚'): '을경합금 (인의지합) - 의리가 있고 강직하며 맺고 끊음이 분명합니다. 원칙을 중시하는 성향입니다.',
    ('丙', '辛'): '병신합수 (위엄지합) - 겉으로는 화려하나 내면은 냉철할 수 있습니다. 위엄이 있고 예의를 갖추려 노력합니다.',
    ('丁', '壬'): '정임합목 (인수지합) - 감수성이 풍부하고 다정다감합니다. 때로는 감정에 치우쳐 음란해질 수 있음을 주의해야 합니다.',
    ('戊', '癸'): '무계합화 (무정지합) - 겉으로는 무뚝뚝해 보이나 속은 다정할 수 있습니다. 총명하지만 다소 냉정한 면모가 있습니다.'
}
HEAVENLY_CHUNG = {
    ('甲', '庚'): '갑경충 - 머리와 사지의 통증, 신경통 주의. 직업이나 주거의 잦은 이동. 쇠가 나무를 치는 형상으로 결단력이 필요할 때 발생합니다.',
    ('乙', '辛'): '을신충 - 정신적인 스트레스, 신경 과민. 주변 사람과의 갈등이나 이별 수. 날카로운 칼이 화초를 베는 형상입니다.',
    ('丙', '壬'): '병임충 - 시력 감퇴나 심장 계통 주의. 재물 손실이나 관재구설. 물과 불의 충돌로 감정 기복이 심할 수 있습니다.',
    ('丁', '癸'): '정계충 -  심혈관 질환 주의. 놀라는 일이나 소심함. 불과 물의 충돌로 내면의 갈등을 암시합니다.'
}

EARTHLY_YUKHAP = {
    ('子', '丑'): '자축합토 - 겉으로는 극하는 듯 하나 속으로 합을 이룸. 비밀스러운 관계나 내부적인 결속을 의미합니다.',
    ('寅', '亥'): '인해합목 - 물이 나무를 생하는 상생의 합. 협력 관계가 원만하고 미래 지향적인 발전을 도모합니다.',
    ('卯', '戌'): '묘술합화 - 도화와 예술성의 결합. 열정적이고 낭만적인 성향이 강해지며, 예술적 재능을 발휘할 수 있습니다.',
    ('辰', '酉'): '진유합금 - 신의와 의리가 두터운 합. 강한 결속력과 추진력을 의미하며, 리더십을 발휘할 수 있습니다.',
    ('巳', '申'): '사신합수 - 역마의 기운이 강한 합. 활동적이고 변화가 많으며, 물과 불이 만나 조화를 이루거나 변덕을 부릴 수 있습니다.',
    ('午', '未'): '오미합화 - 가장 강력한 방합이자 육합. 공적인 결속력과 사회적 활동성이 왕성함을 의미합니다.'
}
EARTHLY_SAMHAP = {
    '申子辰': '신자진 삼합(수국) - 시작(申)과 과정(子)과 마무리(辰)가 조화를 이루어 거대한 물의 기운을 형성합니다. 유연함, 지혜, 침투력을 상징합니다.',
    '寅午戌': '인오술 삼합(화국) - 시작(寅)과 과정(午)과 마무리(戌)가 조화를 이루어 거대한 불의 기운을 형성합니다. 열정, 확산, 명예를 상징합니다.',
    '巳酉丑': '사유축 삼합(금국) - 시작(巳)과 과정(酉)과 마무리(丑)가 조화를 이루어 거대한 금의 기운을 형성합니다. 결단력, 의리, 강한 규칙을 상징합니다.',
    '亥卯未': '해묘미 삼합(목국) - 시작(亥)과 과정(卯)과 마무리(未)가 조화를 이루어 거대한 나무의 기운을 형성합니다. 성장, 창조, 인자함을 상징합니다.'
}
EARTHLY_BANGHAP = {
    '寅卯辰': '인묘진 방합(목국) - 봄의 기운이 모여 강력한 목 기운을 형성. 형제나 가족 같은 끈끈한 유대감과 추진력을 의미합니다.',
    '巳午未': '사오미 방합(화국) - 여름의 기운이 모여 강력한 화 기운을 형성. 왕성한 활동력과 화려한 발산을 의미합니다.',
    '申酉戌': '신유술 방합(금국) - 가을의 기운이 모여 강력한 금 기운을 형성. 맺고 끊음이 확실하며 의리와 결실을 중시합니다.',
    '亥子丑': '해자축 방합(수국) - 겨울의 기운이 모여 강력한 수 기운을 형성. 지혜롭고 깊이 있는 사고와 휴식을 의미합니다.'
}
EARTHLY_CHUNG = {
    ('子', '午'): '자오충 - 물과 불의 정면 충돌. 이성과 감정의 혼란, 심리적 불안정. 주거지나 직장의 잦은 변동을 의미하지만, 전화위복의 기회가 되기도 합니다.',
    ('丑', '未'): '축미충 - 토와 토의 충돌. 가족이나 친척 간의 불화, 재산 문제 발생 가능성. 끈기와 고집의 대립으로 내부적인 개혁을 암시합니다.',
    ('寅', '申'): '인신충 - 역마살의 충돌. 교통사고나 이동 중 부상 주의. 활동력이 극대화되거나 급격한 환경 변화를 겪을 수 있습니다.',
    ('卯', '酉'): '묘유충 - 왕지끼리의 충돌. 배신이나 약속 파기, 대인관계의 갈등. 주거 불안이나 신체적 상해, 수술 등을 주의해야 합니다.',
    ('辰', '戌'): '진술충 - 토와 토의 충돌. 고독함과 투쟁심, 소송이나 시비 구설. 과거를 청산하고 새롭게 시작하는 강한 개혁의 계기가 됩니다.',
    ('巳', '亥'): '사해충 - 역마살의 충돌. 정신적인 스트레스와 잡념, 감정 기복. 해외 이동이나 잦은 출장 등 삶의 변화가 역동적입니다.'
}
EARTHLY_HYEONG = {
    '寅巳申': '인사신 삼형(지세지형) - 자신의 세력을 믿고 저돌적으로 행동하다 겪는 형액. 권력 기관과 연관되거나, 독선적인 행동을 주의해야 합니다. 조정과 타협이 필요합니다.',
    '丑戌未': '축술미 삼형(무은지형) - 믿는 도끼에 발등 찍히는 배신의 형. 가까운 사람과의 불화나 은혜를 원수로 갚는 상황 주의. 냉정하고 객관적인 태도가 필요합니다.',
    ('子', '卯'): '자묘형(무례지형) - 예의가 없고 무례하여 발생하는 다툼. 성적인 문제나 비뇨기 계통 질환 주의. 타인에 대한 배려가 부족해질 수 있습니다.',
    ('寅', '巳'): '인사형 - 인사신 삼형의 일부. 성급한 출발로 인한 실수, 배신이나 구설수 주의.',
    ('巳', '申'): '사신형 - 육합이자 형. 처음에는 좋았다가 나중에 사이가 틀어지는 관계. 화합 속에 내재된 갈등.',
    ('申', '寅'): '인신형 - 인사신 삼형의 일부. 역마의 충돌과 형. 사고나 부상, 격렬한 변화.',
    ('丑', '戌'): '축술형 - 축술미 삼형의 일부. 고집과 독선으로 인한 마찰. 형제간 갈등이나 재산 다툼.',
    ('戌', '未'): '술미형 - 축술미 삼형의 일부. 문서상의 문제나 신의를 저버리는 행동 주의.',
    ('未', '丑'): '축미형 - 축술미 삼형의 일부. 내부적인 불만과 갈등 폭발.',
    ('辰', '辰'): '진진 자형 - 스스로를 볶아대는 스트레스. 고독감과 우울감, 혹은 지나친 투쟁심.',
    ('午', '午'): '오오 자형 - 성격이 불같이 급하여 발생하는 실수. 스스로 화를 자초하는 격.',
    ('酉', '酉'): '유유 자형 - 날카로운 예민함으로 인한 상처. 신체적 상해나 수술, 혹은 대인관계의 단절.',
    ('亥', '亥'): '해해 자형 - 물이 넘쳐 흐르는 형상. 지나친 욕심이나 음주, 방탕함으로 인한 망신 주의.'
}
EARTHLY_PA = {
    ('子', '酉'): '자유파 - 신의가 깨지고 약속이 파기됨. 내부적인 불화나 배신감.',
    ('丑', '辰'): '축진파 - 형제나 동료 간의 다툼. 재산상의 손실이나 파산 주의.',
    ('寅', '亥'): '인해파 - 합이자 파. 선합후파. 처음엔 좋으나 끝이 좋지 않은 관계. 끈기 부족.',
    ('卯', '午'): '묘오파 - 도화의 파. 이성 문제나 유흥으로 인한 구설수. 신뢰 상실.',
    ('巳', '申'): '사신파 - 합이자 파. 화합하려다 깨지는 형국. 이중적인 태도 주의.',
    ('戌', '未'): '술미파 - 문서상의 실수나 착오. 약속 불이행으로 인한 다툼.'
}
EARTHLY_HAE = {
    ('子', '未'): '자미해(원진) - 육친 간의 불화, 특히 부모님 관련 근심. 겉으로는 무난해 보이나 속으로 곪는 관계.',
    ('丑', '午'): '축오해(원진) - 욱하는 성격으로 인한 다툼. 관재구설이나 폭력적인 성향 주의.',
    ('寅', '巳'): '인사해(삼형) - 인사신 삼형과 유사. 독단적인 행동으로 인한 손해. 배신감.',
    ('卯', '辰'): '묘진해 - 매사 막힘이 많고 지체됨. 남 좋은 일만 시키거나 이용당하는 형국.',
    ('申', '亥'): '신해해 - 물과 물의 만남으로 인한 탁함. 감정적인 소모전, 우울감, 신경 에민.',
    ('酉', '戌'): '유술해 - 닭이 개를 보며 짖는 격. 가까운 사이일수록 질투와 시기가 발생. 배신 주의.'
}
EARTHLY_WONJIN = {
    ('子', '未'): '자미 원진 - 쥐와 양의 원망. 이유 없는 미움과 원망, 애증의 관계. 자식으로 인한 근심.',
    ('丑', '午'): '축오 원진 - 소와 말의 원망. 폭발적인 성격 차이. 집착이나 의처증/의부증 주의.',
    ('寅', '酉'): '인유 원진 - 호랑이와 닭의 원망. 자존심 대결로 인한 상처. 단기간의 열정과 빠른 식음.',
    ('卯', '申'): '묘신 원진 - 토끼와 원숭이의 원망. 잘난 척이나 허세로 인한 갈등. 변덕스러운 마음.',
    ('辰', '亥'): '진해 원진 - 용과 돼지의 원망. 얼굴을 보기 싫어할 정도의 혐오감. 히스테리와 신경질.',
    ('巳', '戌'): '사술 원진 - 뱀과 개의 원망. 고소리만 들어도 싫은 격. 말로 인한 상처와 구설수.'
}
EARTHLY_GUIMUN = {
    ('子', '酉'): '자유 귀문 - 동자귀신/선녀귀신. 공주병/왕자병 기질, 어리광이나 변덕. 예술적 감수성 예민.',
    ('丑', '午'): '축오 귀문 - 객사귀신/폭력귀신. 다혈질, 욱하는 성질, 폭력성 혹은 분노 조절 장애 주의.',
    ('寅', '未'): '인미 귀문 - 노인귀신. 멍하니 있거나 갑자기 어른스러운 척함. 점잖은 척하다가도 엉뚱한 행동.',
    ('卯', '申'): '묘신 귀문 - 장군귀신/도화귀신. 과시욕, 허세, 남을 무시하는 경향. 급격한 감정 변화.',
    ('辰', '亥'): '진해 귀문 - 처녀귀신/애기귀신. 예민하고 까다로움. 결벽증이나 히스테리, 강한 소유욕과 질투.',
    ('巳', '戌'): '사술 귀문 - 도사귀신. 능구렁이 같은 면모, 고집이 세고 자기 주장 강함. 영적인 능력이 뛰어남.'
}

def _add_korean_pronunciation(ganji: str) -> str:
    """한자 간지에 한글 발음을 병기합니다. 예: 甲子 -> 甲子(갑자)"""
    if not ganji or len(ganji) != 2:
        return ganji
    
    c = CHEONGAN_MAP.get(ganji[0], ganji[0])
    j = JIJI_MAP.get(ganji[1], ganji[1])
    return f"{ganji}({c}{j})"

def _convert_to_sajupy_time(hour: int, minute: int) -> tuple[int, int]:
    """
    전통 명리학 30분 기준 시간을 sajupy가 올바른 시주를 반환하도록 변환합니다.
    """
    total_minutes = hour * 60 + minute
    
    # 야자시 처리 (23:30 ~ 23:59)
    if total_minutes >= 1410:
        return (0, 0)
    
    if total_minutes < 90: return (0, 0)   # 자시
    if total_minutes < 210: return (2, 0)  # 축시
    if total_minutes < 330: return (4, 0)  # 인시
    if total_minutes < 450: return (6, 0)  # 묘시
    if total_minutes < 570: return (8, 0)  # 진시
    if total_minutes < 690: return (10, 0) # 사시
    if total_minutes < 810: return (12, 0) # 오시
    if total_minutes < 930: return (14, 0) # 미시
    if total_minutes < 1050: return (16, 0)# 신시
    if total_minutes < 1170: return (18, 0)# 유시
    if total_minutes < 1290: return (20, 0)# 술시
    if total_minutes < 1410: return (22, 0)# 해시
    
    return (hour, minute)

def _get_korean_time_name(hour: int, minute: int) -> str:
    """시간을 받아 십이지시 명칭 반환 (예: 진시(辰時))"""
    total = hour * 60 + minute
    # 30분 보정 기준 십이지시
    if total >= 1410 or total < 90: return "자시(子時)"
    if total < 210: return "축시(丑時)"
    if total < 330: return "인시(寅時)"
    if total < 450: return "묘시(卯時)"
    if total < 570: return "진시(辰時)"
    if total < 690: return "사시(巳時)"
    if total < 810: return "오시(午時)"
    if total < 930: return "미시(未時)"
    if total < 1050: return "신시(申時)"
    if total < 1170: return "유시(酉時)"
    if total < 1290: return "술시(戌時)"
    if total < 1410: return "해시(亥時)"
    return ""

def _calculate_oheng_counts(result: dict) -> dict:
    """사주 결과에서 오행 개수를 계산"""
    counts = {'wood': 0, 'fire': 0, 'earth': 0, 'metal': 0, 'water': 0}
    pillars = [result.get('year_pillar'), result.get('month_pillar'), result.get('day_pillar'), result.get('hour_pillar')]
    
    for p in pillars:
        if p and len(p) >= 2:
            for char in p[:2]: # 앞의 두 글자(천간, 지지)만 확인
                elem = ELEMENT_MAP.get(char)
                if elem:
                    counts[elem] += 1
    return counts


# 음양 매핑 (양=1, 음=0)
YANG_CHARS = set('甲丙戊庚壬子寅辰午申戌')  # 양 천간 + 양 지지
YIN_CHARS = set('乙丁己辛癸丑卯巳未酉亥')   # 음 천간 + 음 지지

def _calculate_yinyang(result: dict) -> dict:
    """사주에서 음양 비율 계산 (8글자 기준)"""
    yang_count = 0
    yin_count = 0
    pillars = [result.get('year_pillar'), result.get('month_pillar'), result.get('day_pillar'), result.get('hour_pillar')]
    
    for p in pillars:
        if p and len(p) >= 2:
            for char in p[:2]:
                if char in YANG_CHARS:
                    yang_count += 1
                elif char in YIN_CHARS:
                    yin_count += 1
    
    return {"yang": yang_count, "yin": yin_count}


def _determine_strength(result: dict, oheng_counts: dict) -> str:
    """신강/신약/중화 판단 (간단한 억부법 기준)"""
    day_pillar = result.get('day_pillar', '')
    if not day_pillar or len(day_pillar) < 1:
        return "판단불가"
    
    day_stem = day_pillar[0]  # 일간
    day_element = ELEMENT_MAP.get(day_stem, '')
    
    # 일간을 생(生)하는 오행과 비(比)하는 오행의 합계
    # 목생화, 화생토, 토생금, 금생수, 수생목
    GENERATE_MAP = {'wood': 'water', 'fire': 'wood', 'earth': 'fire', 'metal': 'earth', 'water': 'metal'}
    
    # 나를 돕는 세력: 비겁(같은 오행) + 인성(나를 생하는 오행)
    my_element = day_element
    generating_element = GENERATE_MAP.get(my_element, '')
    
    my_force = oheng_counts.get(my_element, 0) + oheng_counts.get(generating_element, 0)
    total = sum(oheng_counts.values())
    
    if total == 0:
        return "판단불가"
    
    ratio = my_force / total
    
    if ratio >= 0.5:
        return "신강"
    elif ratio <= 0.3:
        return "신약"
    else:
        return "중화"


def _get_day_master_element(result: dict) -> str:
    """일간 오행을 한글로 반환"""
    day_pillar = result.get('day_pillar', '')
    if not day_pillar or len(day_pillar) < 1:
        return ""
    
    day_stem = day_pillar[0]
    element = ELEMENT_MAP.get(day_stem, '')
    element_korean = {'wood': '목', 'fire': '화', 'earth': '토', 'metal': '금', 'water': '수'}
    return element_korean.get(element, element)

def _get_12shinsal(day_branch: str, target_branch: str) -> str:
    """일지 기준으로 타 지지의 12신살 계산"""
    if not day_branch or not target_branch: return None
    start_branch = TRIAD_START_MAP.get(day_branch)
    if not start_branch: return None
    
    try:
        start_idx = JIJIS.index(start_branch)
        target_idx = JIJIS.index(target_branch)
        # 지지 순서는 자축인묘... 이므로 차이 계산
        # start_branch가 '겁살'(0번째)이므로 index 차이가 바로 신살 index
        diff = (target_idx - start_idx) % 12
        return SHINSAL_NAMES[diff]
    except ValueError:
        return None

def _calculate_sinsals(day_stem: str, day_branch: str, pillars: dict) -> list:
    """주어진 사주 기둥들에 대해 신살 목록 계산 (중복 제거 포함)"""
    items = []
    seen = set() # (name, position) 튜플로 중복 방지

    def _add(name, pos, type_, icon, good, bad):
        if (name, pos) not in seen:
            seen.add((name, pos))
            items.append({
                "name": name, "position": pos, "type": type_, "icon": icon,
                "condition_good": good, "condition_bad": bad
            })

    # 신살별 기본 설명
    SINSAL_DESCRIPTIONS = {
        "겁살": {"good": "도전 정신이 강해짐", "bad": "충동적 결정 위험"},
        "재살": {"good": "재물 획득 기회", "bad": "손재수 주의"},
        "천살": {"good": "귀인의 도움", "bad": "자만심 경계"},
        "지살": {"good": "안정적 기반 형성", "bad": "고집이 세어짐"},
        "연살": {"good": "인기, 매력 상승", "bad": "구설수 조심"},
        "월살": {"good": "감정 교류 원활", "bad": "우울함 주의"},
        "망신살": {"good": "변화와 혁신", "bad": "체면 손상 주의"},
        "장성살": {"good": "명예, 승진 운", "bad": "교만함 경계"},
        "반안살": {"good": "안정과 편안함", "bad": "나태함 주의"},
        "역마살": {"good": "이동, 변화에 좋음", "bad": "불안정함"},
        "육해살": {"good": "육친 관계 돈독", "bad": "가족 갈등 주의"},
        "화개살": {"good": "학문, 예술 재능", "bad": "고독해질 수 있음"},
        "천을귀인": {"good": "위기 시 도움 받음", "bad": "과신하면 독이 됨"},
        "태극귀인": {"good": "지혜와 통찰력", "bad": "지나친 이상주의"},
        "문창귀인": {"good": "학업, 시험 유리", "bad": "실천력 부족 주의"},
        "학당귀인": {"good": "배움에 좋은 운", "bad": "현실 감각 놓칠 수 있음"},
        "양인살": {"good": "추진력과 결단력", "bad": "공격성 조절 필요"},
        "홍염살": {"good": "매력, 이성운 상승", "bad": "감정에 휘둘릴 수 있음"},
        "백호살": {"good": "비상한 재능과 집중력", "bad": "혈광지사, 사고 주의"},
        "괴강살": {"good": "강력한 리더십과 총명함", "bad": "독선적이거나 파란만장함"},
    }
    
    # 각 기둥별 12신살 및 귀인 체크
    pos_korean = {"year": "년주", "month": "월주", "day": "일주", "hour": "시주"}
    
    # 연지 확인 (전통 12신살 기준)
    year_pillar = pillars.get('year')
    year_branch = year_pillar[1] if year_pillar and len(year_pillar) >= 2 else None
    
    for pos, pillar in pillars.items():
        if not pillar or len(pillar) < 2: continue
        
        # 괄호 제거 (순수 한자만 추출: 甲子)
        pure_pillar = pillar.split('(')[0]
        if len(pure_pillar) < 2: continue

        branch = pure_pillar[1] # 지지
        pos_name = pos_korean.get(pos, pos)
        
        # 1-1. 12신살 (연지 기준 - 전통)
        if year_branch:
            shinsal_year = _get_12shinsal(year_branch, branch)
            if shinsal_year:
                desc = SINSAL_DESCRIPTIONS.get(shinsal_year, {"good": "", "bad": ""})
                _add(shinsal_year, pos_name, "12신살(연지)", "crystal", desc["good"], desc["bad"])
                
        # 1-2. 12신살 (일지 기준 - 현대)
        # 일지는 자기 자신이므로 12신살 적용 시 지살이 됨. 일주의 12신살(일지기준)은 보통 생략하나, 사용자 요청대로 포함.
        # 단, 연지 기준과 이름이 같으면 헷갈리므로 type으로 구분.
        if day_branch:
            shinsal_day = _get_12shinsal(day_branch, branch)
            if shinsal_day:
                desc = SINSAL_DESCRIPTIONS.get(shinsal_day, {"good": "", "bad": ""})
                # 도화/역마 등 주요 신살은 type을 분리하여 색상 강조
                sinsal_type = "12신살_일반"
                if shinsal_day in ["연살", "월살", "망신살"]: # 도화 계열
                     sinsal_type = "12신살_도화"
                elif shinsal_day in ["지살", "역마살"]: # 역마 계열
                     sinsal_type = "12신살_역마"
                
                _add(shinsal_day, pos_name, sinsal_type, "crystal", desc["good"], desc["bad"])
            
        # 2. 귀인 및 살 (지지가 일간 기준 매핑에 포함되는지)
        if branch in TE_GUIN.get(day_stem, []):
            desc = SINSAL_DESCRIPTIONS.get("천을귀인", {"good": "", "bad": ""})
            _add("천을귀인", pos_name, "귀인", "star", desc["good"], desc["bad"])
        
        if branch in TAEGEUK_GUIN.get(day_stem, []):
            desc = SINSAL_DESCRIPTIONS.get("태극귀인", {"good": "", "bad": ""})
            _add("태극귀인", pos_name, "귀인", "sparkle", desc["good"], desc["bad"])
            
        if branch in MUNCHANG_GUIN.get(day_stem, []):
            desc = SINSAL_DESCRIPTIONS.get("문창귀인", {"good": "", "bad": ""})
            _add("문창귀인", pos_name, "귀인", "book", desc["good"], desc["bad"])
            
        if branch in HAKDANG_GUIN.get(day_stem, []):
            desc = SINSAL_DESCRIPTIONS.get("학당귀인", {"good": "", "bad": ""})
            _add("학당귀인", pos_name, "귀인", "graduate", desc["good"], desc["bad"])
            
        if branch in YANGIN_SAL.get(day_stem, []):
            desc = SINSAL_DESCRIPTIONS.get("양인살", {"good": "", "bad": ""})
            _add("양인살", pos_name, "살", "sword", desc["good"], desc["bad"])
        
        # 홍염살
        if branch in HONGYEOM_SAL.get(day_stem, []):
            desc = SINSAL_DESCRIPTIONS.get("홍염살", {"good": "", "bad": ""})
            # 홍염살은 일주에 있을 때가 진짜임
            is_real = (pos == 'day')
            name = "홍염살" if is_real else "홍염살(약함)"
            _add(name, pos_name, "도화", "flower", desc["good"], desc["bad"])

        # 백호살 (간지 자체 체크)
        if pure_pillar in BAEKHO_SAL:
            desc = SINSAL_DESCRIPTIONS.get("백호살", {"good": "", "bad": ""})
            _add("백호살", pos_name, "살", "tiger", desc["good"], desc["bad"])

        # 괴강살 (간지 자체 체크)
        if pure_pillar in GOEGANG_SAL:
            desc = SINSAL_DESCRIPTIONS.get("괴강살", {"good": "", "bad": ""})
            _add("괴강살", pos_name, "살", "dragon", desc["good"], desc["bad"])
            
    return items

def _calculate_gongmang(day_pillar: str) -> list:
    """일주 기준으로 공망(空亡) 지지 2개 계산"""
    if not day_pillar or len(day_pillar) < 2: return []
    
    stem = day_pillar[0]
    branch = day_pillar[1]
    
    try:
        stem_idx = CHEONGANS.index(stem)
        branch_idx = JIJIS.index(branch)
        
        # 순중(旬中) 계산: 지지 인덱스 - 천간 인덱스
        diff = (branch_idx - stem_idx) % 12
        if diff < 0: diff += 12
        
        # 공망: 순중의 바로 앞 2글자 (즉, diff + 10, diff + 11)
        # 예: 갑자(0,0) -> 0 -> 술(10), 해(11)
        # 예: 갑술(0,10) -> 10 -> 신(8), 유(9)
        # 인덱스 계산: (diff + 10) % 12, (diff + 11) % 12
        
        gm1_idx = (diff + 10) % 12
        gm2_idx = (diff + 11) % 12
        
        return [JIJIS[gm1_idx], JIJIS[gm2_idx]]
    except ValueError:
        return []

def _check_tuple_interaction(char1: str, char2: str, map_dict: dict) -> str:
    """두 글자 간의 상호작용 체크 (순서 무관)"""
    if (char1, char2) in map_dict: return map_dict[(char1, char2)]
    if (char2, char1) in map_dict: return map_dict[(char2, char1)]
    return None

def _calculate_interactions(year: str, month: str, day: str, hour: str) -> dict:
    """사주팔자 내 합충형파해 및 공망 계산"""
    items = []
    
    pillars = {'year': year, 'month': month, 'day': day, 'hour': hour}
    pillar_names = {'year': '년주', 'month': '월주', 'day': '일주', 'hour': '시주'}
    
    # 1. 공망 계산
    gongmang = _calculate_gongmang(day)
    
    # 기둥 쌍 정의 (순서: 년-월, 년-일, 년-시, 월-일, 월-시, 일-시)
    pairs = [
        ('year', 'month'), ('year', 'day'), ('year', 'hour'),
        ('month', 'day'), ('month', 'hour'),
        ('day', 'hour')
    ]
    
    for p1_key, p2_key in pairs:
        p1 = pillars[p1_key]
        p2 = pillars[p2_key]
        if not p1 or not p2 or len(p1) < 2 or len(p2) < 2: continue
        
        p1_stem, p1_branch = p1[0], p1[1]
        p2_stem, p2_branch = p2[0], p2[1]
        pair_name = f"{pillar_names[p1_key]}-{pillar_names[p2_key]}"
        
        # 천간 합/충
        res = _check_tuple_interaction(p1_stem, p2_stem, HEAVENLY_HAP)
        if res:
            items.append({"type": "천간합", "pillars": pair_name, "chars": f"{p1_stem}{p2_stem}", "meaning": res})
        res = _check_tuple_interaction(p1_stem, p2_stem, HEAVENLY_CHUNG)
        if res:
            items.append({"type": "천간충", "pillars": pair_name, "chars": f"{p1_stem}{p2_stem}", "meaning": res})
            
        # 지지 육합/충/파/해/형/원진/귀문
        res = _check_tuple_interaction(p1_branch, p2_branch, EARTHLY_YUKHAP)
        if res:
            items.append({"type": "지지육합", "pillars": pair_name, "chars": f"{p1_branch}{p2_branch}", "meaning": res})
        res = _check_tuple_interaction(p1_branch, p2_branch, EARTHLY_CHUNG)
        if res:
            items.append({"type": "지지충", "pillars": pair_name, "chars": f"{p1_branch}{p2_branch}", "meaning": res})
        res = _check_tuple_interaction(p1_branch, p2_branch, EARTHLY_PA)
        if res:
            items.append({"type": "지지파", "pillars": pair_name, "chars": f"{p1_branch}{p2_branch}", "meaning": res})
        res = _check_tuple_interaction(p1_branch, p2_branch, EARTHLY_HAE)
        if res:
            items.append({"type": "지지해", "pillars": pair_name, "chars": f"{p1_branch}{p2_branch}", "meaning": res})
        res = _check_tuple_interaction(p1_branch, p2_branch, EARTHLY_HYEONG)  # 2글자 형
        if res:
            items.append({"type": "지지형", "pillars": pair_name, "chars": f"{p1_branch}{p2_branch}", "meaning": res})
            
        # 원진살
        res = _check_tuple_interaction(p1_branch, p2_branch, EARTHLY_WONJIN)
        if res:
            items.append({"type": "원진살", "pillars": pair_name, "chars": f"{p1_branch}{p2_branch}", "meaning": res})
            
        # 귀문관살
        res = _check_tuple_interaction(p1_branch, p2_branch, EARTHLY_GUIMUN)
        if res:
            items.append({"type": "귀문관살", "pillars": pair_name, "chars": f"{p1_branch}{p2_branch}", "meaning": res})
            
    # 지지 삼합/방합/삼형 (3글자 이상 혹은 2글자 반합)
    branches = [
        (year[1], 'year') if year else (None, None),
        (month[1], 'month') if month else (None, None),
        (day[1], 'day') if day else (None, None),
        (hour[1], 'hour') if hour else (None, None)
    ]
    valid_branches = [(b, k) for b, k in branches if b]
    branch_chars = "".join([b[0] for b in valid_branches])
    
    # 삼합 (반합 포함)
    WANGJI = ['子', '午', '卯', '酉'] # 왕지
    
    for key, val in EARTHLY_SAMHAP.items():
        count = 0
        found_chars = []
        for char in key:
            if char in branch_chars:
                count += 1
                found_chars.append(char)
        
        final_meaning = val
        interaction_type = "지지삼합"
        
        if count == 3:
            items.append({"type": interaction_type, "pillars": "전체", "chars": key, "meaning": final_meaning + "(완전합)"})
        elif count == 2:
            # 반합 체크: 왕지가 포함되어 있는지 확인
            has_wangji = any(c in WANGJI for c in found_chars)
            if has_wangji:
                final_meaning += "(반합)"
            else:
                final_meaning += "(가합)"
            items.append({"type": "지지반합", "pillars": "전체", "chars": "".join(found_chars), "meaning": final_meaning})
            
    # 방합 체크 (방합은 2글자는 보통 인정 안함, 3글자만)
    for key, val in EARTHLY_BANGHAP.items():
        count = 0
        for char in key:
            if char in branch_chars: count += 1
        if count == 3:
            items.append({"type": "지지방합", "pillars": "전체", "chars": key, "meaning": val})
            
    # 삼형살 (3글자 다 모여야 성립하는 삼형)
    for key in ['寅巳申', '丑戌未']:
        count = 0
        for char in key:
            if char in branch_chars: count += 1
        if count == 3:
            items.append({"type": "지지삼형", "pillars": "전체", "chars": key, "meaning": EARTHLY_HYEONG[key]})
    
    return {
        "items": items,
        "gongmang": gongmang
    }

def _get_daeun_ganji_list(month_pillar: str, is_forward: bool) -> list:
    """월주를 기준으로 대운 간지 리스트 생성 (10개)"""
    if not month_pillar or len(month_pillar) != 2:
        return []
        
    start_stem_idx = CHEONGANS.index(month_pillar[0])
    start_branch_idx = JIJIS.index(month_pillar[1])
    
    daeun_list = []
    
    for i in range(1, 11): # 10대운까지
        offset = i if is_forward else -i
        
        stem_idx = (start_stem_idx + offset) % 10
        branch_idx = (start_branch_idx + offset) % 12
        
        stem = CHEONGANS[stem_idx]
        branch = JIJIS[branch_idx]
        
        ganji = stem + branch
        daeun_list.append(_add_korean_pronunciation(ganji))
        
    return daeun_list

def _get_solar_terms(year):
    """
    해당 연도의 절기(절입일) 근사치 날짜 리스트 반환 (양력 기준)
    대운 계산을 위해 주요 절기(입춘, 경칩, 청명 등) 날짜를 반환
    편의상 매년 고정 날짜를 사용하되, 윤년 등은 고려하지 않음 (1일 오차 허용)
    """
    # 24절기 중 월의 기준이 되는 절기(절입일)만 사용 (12개)
    # 소한, 입춘, 경칩, 청명, 입하, 망종, 소서, 입추, 백로, 한로, 입동, 대설
    terms = [
        date(year, 1, 6),  # 소한
        date(year, 2, 4),  # 입춘
        date(year, 3, 6),  # 경칩
        date(year, 4, 5),  # 청명
        date(year, 5, 6),  # 입하
        date(year, 6, 6),  # 망종
        date(year, 7, 7),  # 소서
        date(year, 8, 8),  # 입추
        date(year, 9, 8),  # 백로
        date(year, 10, 8), # 한로
        date(year, 11, 7), # 입동
        date(year, 12, 7)  # 대설
    ]
    return terms

def _calculate_daeun_number_by_terms(birth_date: date, is_forward: bool) -> int:
    """
    절기 기준으로 대운수 계산 (3일 = 1년)
    """
    year = birth_date.year
    terms_this_year = _get_solar_terms(year)
    terms_prev_year = _get_solar_terms(year - 1)
    terms_next_year = _get_solar_terms(year + 1)
    
    # 앞뒤 3년치 절기 리스트 통합 및 정렬
    all_terms = sorted(terms_prev_year + terms_this_year + terms_next_year)
    
    target_diff = 0
    
    if is_forward:
        # 순행: 생일 다음 절기까지의 날짜 수
        for term in all_terms:
            if term > birth_date:
                target_diff = (term - birth_date).days
                break
    else:
        # 역행: 생일 이전 절기까지의 날짜 수
        for term in reversed(all_terms):
            if term < birth_date:
                target_diff = (birth_date - term).days
                break
                
    # 3일 = 1년, 나머지는 버리거나 반올림 (여기서는 일반적인 반올림 적용)
    # 1일 = 4개월 (0.33년)
    daeun_num = round(target_diff / 3)
    
    # 대운수는 최소 1, 최대 10
    if daeun_num < 1: daeun_num = 1
    if daeun_num > 10: daeun_num = 10
    
    return daeun_num

def calculate_daeun_info(year_pillar: str, month_pillar: str, gender: str, birth_date: date = None) -> dict:
    """
    대운 계산
    """
    if not year_pillar or not gender:
        return {}
    
    year_stem = year_pillar[0]
    
    # 양간: 甲, 丙, 戊, 庚, 壬
    is_yang_year = year_stem in ['甲', '丙', '戊', '庚', '壬']
    is_male = gender == 'male'
    
    # 남자는 양년에 순행, 음년에 역행
    # 여자는 양년에 역행, 음년에 순행
    if is_male:
        is_forward = is_yang_year
    else:
        is_forward = not is_yang_year
        
    # 대운 간지 흐름
    daeun_list = _get_daeun_ganji_list(month_pillar, is_forward)
    
    # 대운수 계산 (절기 기준)
    if birth_date:
        daeun_num = _calculate_daeun_number_by_terms(birth_date, is_forward)
    else:
        daeun_num = 4 # 기본값
    
    # 구조화된 타임라인 생성
    timeline = []
    current_age_ganji = None
    
    # 현재 만 나이 계산 (대략적)
    current_age = 0
    if birth_date:
        today = date.today()
        current_age = today.year - birth_date.year + 1 # 한국식 나이 혹은 만 나이? 사주는 보통 한국식이나 만세력 나이. 여기선 단순 연도 차+1로 근사.
        
    for i, ganji in enumerate(daeun_list):
        start_age = daeun_num + (i * 10)
        end_age = start_age + 9
        timeline.append({
            "age_start": start_age,
            "age_end": end_age,
            "ganji": ganji
        })
        
        # 현재 나이가 이 구간에 포함되면 현재 대운으로 표시
        if current_age >= start_age and current_age <= end_age:
            current_age_ganji = ganji

    return {
        "direction": "순행" if is_forward else "역행",
        "number": daeun_num,
        "ganji_list": daeun_list,
        "timeline": timeline,
        "current_daeun_ganji": current_age_ganji
    }

def get_today_ganji():
    """오늘 날짜의 간지(일진)을 계산"""
    today = datetime.now()
    res = calculate_saju(today.year, today.month, today.day, today.hour, today.minute)
    return _add_korean_pronunciation(res['day_pillar'])

def get_calculated_pillars(year: int, month: int, day: int, hour: int, minute: int, gender: str = 'male'):
    """
    sajupy 라이브러리를 사용하여 사주팔자 + 대운 정보 계산
    """
    try:
        # 생년월일 date 객체 생성
        birth_date = date(year, month, day)

        # 30분 기준 시간 변환
        converted_hour, converted_minute = _convert_to_sajupy_time(hour, minute)
        
        # 야자시 처리
        calc_year, calc_month, calc_day = year, month, day
        if hour == 23 and minute >= 30:
            next_day = date(year, month, day) + timedelta(days=1)
            calc_year, calc_month, calc_day = next_day.year, next_day.month, next_day.day
        
        # 사주 계산
        result = calculate_saju(calc_year, calc_month, calc_day, converted_hour, converted_minute)
        
        
        year_pillar = result["year_pillar"]
        month_pillar = result["month_pillar"]
        day_pillar = result["day_pillar"]
        hour_pillar = result["hour_pillar"]
        
        # 신살 계산
        sinsal_items = []
        if day_pillar and len(day_pillar) >= 2:
            sinsal_items = _calculate_sinsals(day_pillar[0], day_pillar[1], {
                'year': year_pillar,
                'month': month_pillar,
                'day': day_pillar,
                'hour': hour_pillar
            })
            
        # 합충형파해 및 공망 계산
        interactions = _calculate_interactions(year_pillar, month_pillar, day_pillar, hour_pillar)
        
        # 대운 계산 (birth_date 전달)
        daeun_info = calculate_daeun_info(year_pillar, month_pillar, gender, birth_date)
        
        # 오행 계산
        oheng_counts = _calculate_oheng_counts(result)
        
        # 음양 계산
        yinyang_ratio = _calculate_yinyang(result)
        
        # 신강/신약 판단
        strength = _determine_strength(result, oheng_counts)
        
        # 일간 오행
        day_master = _get_day_master_element(result)
        
        return {
            "year": _add_korean_pronunciation(result["year_pillar"]),
            "month": _add_korean_pronunciation(result["month_pillar"]),
            "day": _add_korean_pronunciation(result["day_pillar"]),
            "hour": _add_korean_pronunciation(result["hour_pillar"]),
            "korean_time": _get_korean_time_name(hour, minute),
            "daeun": daeun_info,
            "today_ganji": get_today_ganji(),
            "oheng_counts": oheng_counts,
            "sinsal_items": sinsal_items,
            "yinyang_ratio": yinyang_ratio,
            "strength": strength,
            "day_master": day_master,
            "interactions": interactions
        }
    except Exception as e:
        logger.exception(f"Saju calculation failed: {e}")
        return None


def get_yearly_monthly_ganji(target_year: int):
    """
    특정 연도의 월별 간지 계산
    """
    monthly_ganji = []
    try:
        for month in range(1, 13):
            # 매월 15일 기준
            res = calculate_saju(target_year, month, 15, 12, 0)
            monthly_ganji.append({
                "month": month,
                "ganji": _add_korean_pronunciation(res['month_pillar'])
            })
        return monthly_ganji
    except Exception as e:
        logger.exception(f"Monthly ganji calculation failed: {e}")
        return []
