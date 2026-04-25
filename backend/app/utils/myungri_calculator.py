"""
사주 명리학 계산 로직
- 십신 계산
- 합충형파해 계산
- 공망 계산
- 신살 계산
- 신강/신약 판단
- 12운성 계산
- 지장간 계산
"""

# =============================================================================
# 기본 데이터
# =============================================================================

# 천간
CHEONGAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']
CHEONGAN_KR = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계']

# 지지
JIJI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']
JIJI_KR = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해']

# 오행 (천간)
CHEONGAN_OHENG = {
    '甲': '목', '乙': '목', '丙': '화', '丁': '화', '戊': '토',
    '己': '토', '庚': '금', '辛': '금', '壬': '수', '癸': '수'
}

# 오행 (지지)
JIJI_OHENG = {
    '子': '수', '丑': '토', '寅': '목', '卯': '목', '辰': '토', '巳': '화',
    '午': '화', '未': '토', '申': '금', '酉': '금', '戌': '토', '亥': '수'
}

# 음양 (천간) - 양: True, 음: False
CHEONGAN_YINYANG = {
    '甲': True, '乙': False, '丙': True, '丁': False, '戊': True,
    '己': False, '庚': True, '辛': False, '壬': True, '癸': False
}

# 음양 (지지) - 양: True, 음: False
JIJI_YINYANG = {
    '子': True, '丑': False, '寅': True, '卯': False, '辰': True, '巳': False,
    '午': True, '未': False, '申': True, '酉': False, '戌': True, '亥': False
}

# 오행 상생상극
# 생하는 관계 (목->화->토->금->수->목)
OHENG_GENERATE = {'목': '화', '화': '토', '토': '금', '금': '수', '수': '목'}
# 극하는 관계 (목->토->수->화->금->목)
OHENG_CONTROL = {'목': '토', '토': '수', '수': '화', '화': '금', '금': '목'}

# =============================================================================
# 십신 계산
# =============================================================================

SIPSIN_NAMES = {
    'same_yang': '비견',      # 같은 오행, 같은 음양
    'same_yin': '겁재',       # 같은 오행, 다른 음양
    'generate_yang': '식신',   # 내가 생하는 오행, 같은 음양
    'generate_yin': '상관',    # 내가 생하는 오행, 다른 음양
    'control_yang': '편재',    # 내가 극하는 오행, 같은 음양
    'control_yin': '정재',     # 내가 극하는 오행, 다른 음양
    'controlled_yang': '편관', # 나를 극하는 오행, 같은 음양
    'controlled_yin': '정관',  # 나를 극하는 오행, 다른 음양
    'generated_yang': '편인',  # 나를 생하는 오행, 같은 음양
    'generated_yin': '정인',   # 나를 생하는 오행, 다른 음양
}

def get_sipsin(day_stem: str, target: str) -> str:
    """
    일간 기준 대상 글자의 십신을 계산합니다.
    
    Args:
        day_stem: 일간 (천간 한자)
        target: 대상 글자 (천간 또는 지지 한자)
    
    Returns:
        십신 이름 (비견, 겁재, 식신, ...)
    """
    if not day_stem or not target:
        return ""
    
    # 일간의 오행과 음양
    my_oheng = CHEONGAN_OHENG.get(day_stem)
    my_yinyang = CHEONGAN_YINYANG.get(day_stem)
    
    if my_oheng is None:
        return ""
    
    # 대상의 오행과 음양 (천간 또는 지지)
    target_oheng = CHEONGAN_OHENG.get(target) or JIJI_OHENG.get(target)
    target_yinyang = CHEONGAN_YINYANG.get(target)
    if target_yinyang is None:
        target_yinyang = JIJI_YINYANG.get(target)
    
    if target_oheng is None:
        return ""
    
    same_yinyang = (my_yinyang == target_yinyang)
    
    # 관계 판단
    if my_oheng == target_oheng:
        # 비겁 (같은 오행)
        return '비견' if same_yinyang else '겁재'
    elif OHENG_GENERATE.get(my_oheng) == target_oheng:
        # 식상 (내가 생함)
        return '식신' if same_yinyang else '상관'
    elif OHENG_CONTROL.get(my_oheng) == target_oheng:
        # 재성 (내가 극함)
        return '편재' if same_yinyang else '정재'
    elif OHENG_CONTROL.get(target_oheng) == my_oheng:
        # 관성 (나를 극함)
        return '편관' if same_yinyang else '정관'
    elif OHENG_GENERATE.get(target_oheng) == my_oheng:
        # 인성 (나를 생함)
        return '편인' if same_yinyang else '정인'
    
    return ""


def calculate_all_sipsin(pillars: dict) -> dict:
    """
    사주 전체의 십신을 계산합니다.
    
    Args:
        pillars: {"year": "甲子", "month": "丙寅", "day": "戊辰", "hour": "壬子"}
    
    Returns:
        {
            "year_stem": {"char": "甲", "sipsin": "편관"},
            "year_branch": {"char": "子", "sipsin": "정재"},
            ...
        }
    """
    day_pillar = pillars.get("day", "")
    if not day_pillar or len(day_pillar) < 2:
        return {}
    
    day_stem = day_pillar[0]  # 일간
    
    result = {}
    
    # 년주
    year = pillars.get("year", "")
    if len(year) >= 2:
        result["year_stem"] = {"char": year[0], "sipsin": get_sipsin(day_stem, year[0])}
        result["year_branch"] = {"char": year[1], "sipsin": get_sipsin(day_stem, year[1])}
    
    # 월주
    month = pillars.get("month", "")
    if len(month) >= 2:
        result["month_stem"] = {"char": month[0], "sipsin": get_sipsin(day_stem, month[0])}
        result["month_branch"] = {"char": month[1], "sipsin": get_sipsin(day_stem, month[1])}
    
    # 일주 (일간은 자기 자신이므로 비견, 일지만 계산)
    day = pillars.get("day", "")
    if len(day) >= 2:
        result["day_stem"] = {"char": day[0], "sipsin": "일간"}  # 자기 자신
        result["day_branch"] = {"char": day[1], "sipsin": get_sipsin(day_stem, day[1])}
    
    # 시주
    hour = pillars.get("hour", "")
    if len(hour) >= 2:
        result["hour_stem"] = {"char": hour[0], "sipsin": get_sipsin(day_stem, hour[0])}
        result["hour_branch"] = {"char": hour[1], "sipsin": get_sipsin(day_stem, hour[1])}
    
    return result


# =============================================================================
# 합충형파해 계산
# =============================================================================

# 지지 육합 (六合) - 합화오행 포함
JIJI_YUKAP = {
    ('子', '丑'): {'name': '자축합', 'hanja': '子丑合', 'oheng': '토'},
    ('寅', '亥'): {'name': '인해합', 'hanja': '寅亥合', 'oheng': '목'},
    ('卯', '戌'): {'name': '묘술합', 'hanja': '卯戌合', 'oheng': '화'},
    ('辰', '酉'): {'name': '진유합', 'hanja': '辰酉合', 'oheng': '금'},
    ('巳', '申'): {'name': '사신합', 'hanja': '巳申合', 'oheng': '수'},
    ('午', '未'): {'name': '오미합', 'hanja': '午未合', 'oheng': '화'},
}

# 지지 육충 (六沖)
JIJI_CHUNG = {
    ('子', '午'): {'name': '자오충', 'hanja': '子午沖', 'desc': '수화충돌, 감정과 이성의 갈등'},
    ('丑', '未'): {'name': '축미충', 'hanja': '丑未沖', 'desc': '토토충, 고집과 신념의 대립'},
    ('寅', '申'): {'name': '인신충', 'hanja': '寅申沖', 'desc': '목금충돌, 도전과 제약의 갈등'},
    ('卯', '酉'): {'name': '묘유충', 'hanja': '卯酉沖', 'desc': '목금충돌, 행동과 결과의 충돌'},
    ('辰', '戌'): {'name': '진술충', 'hanja': '辰戌沖', 'desc': '토토충, 변화와 안정의 대립'},
    ('巳', '亥'): {'name': '사해충', 'hanja': '巳亥沖', 'desc': '화수충돌, 열정과 지혜의 갈등'},
}

# 지지 형 (刑)
JIJI_HYUNG = {
    # 삼형살 (三刑)
    'insasin': {'chars': ('寅', '巳', '申'), 'name': '인사신 삼형', 'hanja': '寅巳申 三刑', 'desc': '무은지형, 세력을 믿고 독선적이 될 수 있음'},
    'chuksulmi': {'chars': ('丑', '戌', '未'), 'name': '축술미 삼형', 'hanja': '丑戌未 三刑', 'desc': '지세지형, 고집이 강해 불화 가능성'},
    # 상형 (相刑)
    'jamyo': {'chars': ('子', '卯'), 'name': '자묘형', 'hanja': '子卯刑', 'desc': '무례지형, 예의 없이 행동할 수 있음'},
    # 자형 (自刑)
    'jinjin': {'chars': ('辰', '辰'), 'name': '진진 자형', 'hanja': '辰辰 自刑', 'desc': '스스로 스트레스를 만드는 경향'},
    'ohoh': {'chars': ('午', '午'), 'name': '오오 자형', 'hanja': '午午 自刑', 'desc': '스스로 스트레스를 만드는 경향'},
    'yuyu': {'chars': ('酉', '酉'), 'name': '유유 자형', 'hanja': '酉酉 自刑', 'desc': '스스로 스트레스를 만드는 경향'},
    'haehae': {'chars': ('亥', '亥'), 'name': '해해 자형', 'hanja': '亥亥 自刑', 'desc': '스스로 스트레스를 만드는 경향'},
}

# 지지 파 (破)
JIJI_PA = {
    ('子', '酉'): {'name': '자유파', 'hanja': '子酉破'},
    ('丑', '辰'): {'name': '축진파', 'hanja': '丑辰破'},
    ('寅', '亥'): {'name': '인해파', 'hanja': '寅亥破'},  # 합이면서 파
    ('卯', '午'): {'name': '묘오파', 'hanja': '卯午破'},
    ('巳', '申'): {'name': '사신파', 'hanja': '巳申破'},  # 합이면서 파
    ('未', '戌'): {'name': '미술파', 'hanja': '未戌破'},
}

# 지지 해 (害) = 육해
JIJI_HAE = {
    ('子', '未'): {'name': '자미해', 'hanja': '子未害', 'desc': '육합 방해 (자축합 ↔ 축미충)'},
    ('丑', '午'): {'name': '축오해', 'hanja': '丑午害', 'desc': '육합 방해 (오미합 ↔ 축미충)'},
    ('寅', '巳'): {'name': '인사해', 'hanja': '寅巳害', 'desc': '육합 방해 (인해합 ↔ 사해충)'},
    ('卯', '辰'): {'name': '묘진해', 'hanja': '卯辰害', 'desc': '육합 방해 (묘술합 ↔ 진술충)'},
    ('申', '亥'): {'name': '신해해', 'hanja': '申亥害', 'desc': '육합 방해 (사신합 ↔ 사해충)'},
    ('酉', '戌'): {'name': '유술해', 'hanja': '酉戌害', 'desc': '육합 방해 (진유합 ↔ 진술충)'},
}

# 지지 한글 발음
JIJI_KR_MAP = {
    '子': '자', '丑': '축', '寅': '인', '卯': '묘', '辰': '진', '巳': '사',
    '午': '오', '未': '미', '申': '신', '酉': '유', '戌': '술', '亥': '해'
}

def _get_jiji_kr(char: str) -> str:
    """지지 한자에 한글 발음 추가"""
    kr = JIJI_KR_MAP.get(char, '')
    return f"{char}({kr})" if kr else char


def find_interactions(pillars: dict) -> list:
    """
    사주에서 합충형파해 관계를 찾습니다.
    
    Returns:
        [{"type": "충", "type_detail": "자오충", "pillars": "년지-일지", "chars": "子(자)-午(오)", "meaning": "..."}]
    """
    branches = []
    positions = []
    
    # 지지만 추출
    for key, label in [("year", "년"), ("month", "월"), ("day", "일"), ("hour", "시")]:
        pillar = pillars.get(key, "")
        if '(' in pillar:
            pillar = pillar.split('(')[0]
        if len(pillar) >= 2:
            branches.append(pillar[1])
            positions.append(label)
    
    result = []
    checked = set()  # 중복 방지
    
    # 모든 지지 쌍에 대해 검사
    for i in range(len(branches)):
        for j in range(i + 1, len(branches)):
            b1, b2 = branches[i], branches[j]
            pair = tuple(sorted([b1, b2]))
            pos_pair = f"{positions[i]}지-{positions[j]}지"
            char_pair = f"{_get_jiji_kr(b1)}-{_get_jiji_kr(b2)}"
            
            # 합 검사
            for pair_key, info in JIJI_YUKAP.items():
                if b1 in pair_key and b2 in pair_key:
                    key = ('합', pair)
                    if key not in checked:
                        checked.add(key)
                        result.append({
                            "type": "합",
                            "type_detail": info['name'],
                            "pillars": pos_pair,
                            "chars": char_pair,
                            "meaning": f"{info['hanja']} - {info['oheng']}로 합화, 결합과 조화"
                        })
            
            # 충 검사
            for pair_key, info in JIJI_CHUNG.items():
                if b1 in pair_key and b2 in pair_key:
                    key = ('충', pair)
                    if key not in checked:
                        checked.add(key)
                        result.append({
                            "type": "충",
                            "type_detail": info['name'],
                            "pillars": pos_pair,
                            "chars": char_pair,
                            "meaning": f"{info['hanja']} - {info['desc']}"
                        })
            
            # 파 검사
            for pair_key, info in JIJI_PA.items():
                if b1 in pair_key and b2 in pair_key:
                    key = ('파', pair)
                    if key not in checked:
                        checked.add(key)
                        result.append({
                            "type": "파",
                            "type_detail": info['name'],
                            "pillars": pos_pair,
                            "chars": char_pair,
                            "meaning": f"{info['hanja']} - 깨짐과 분리, 일의 지연"
                        })
            
            # 해 검사
            for pair_key, info in JIJI_HAE.items():
                if b1 in pair_key and b2 in pair_key:
                    key = ('해', pair)
                    if key not in checked:
                        checked.add(key)
                        result.append({
                            "type": "해",
                            "type_detail": info['name'],
                            "pillars": pos_pair,
                            "chars": char_pair,
                            "meaning": f"{info['hanja']} - {info['desc']}"
                        })
    
    # 형 검사 (삼형, 상형)
    for key, info in JIJI_HYUNG.items():
        chars = info['chars']
        if len(chars) == 3:
            # 삼형살 - 3개 모두 있어야 완전한 삼형
            present = [c for c in chars if c in branches]
            if len(present) >= 2:
                indices = [branches.index(c) for c in present]
                pos_list = [positions[i] for i in indices]
                char_list = [_get_jiji_kr(c) for c in present]
                check_key = ('형', tuple(sorted(present)))
                if check_key not in checked:
                    checked.add(check_key)
                    result.append({
                        "type": "형",
                        "type_detail": info['name'] if len(present) == 3 else f"{info['name']} (반삼형)",
                        "pillars": "-".join([f"{p}지" for p in pos_list]),
                        "chars": "-".join(char_list),
                        "meaning": f"{info['hanja']} - {info['desc']}"
                    })
        elif len(chars) == 2:
            # 상형 또는 자형
            b1, b2 = chars
            if b1 == b2:
                # 자형 - 같은 글자가 2개 이상
                count = branches.count(b1)
                if count >= 2:
                    indices = [i for i, b in enumerate(branches) if b == b1]
                    pos_list = [positions[i] for i in indices]
                    check_key = ('형', (b1, b1))
                    if check_key not in checked:
                        checked.add(check_key)
                        result.append({
                            "type": "형",
                            "type_detail": info['name'],
                            "pillars": "-".join([f"{p}지" for p in pos_list]),
                            "chars": "-".join([_get_jiji_kr(b1)] * count),
                            "meaning": f"{info['hanja']} - {info['desc']}"
                        })
            else:
                # 상형
                if b1 in branches and b2 in branches:
                    i1 = branches.index(b1)
                    i2 = branches.index(b2)
                    check_key = ('형', tuple(sorted([b1, b2])))
                    if check_key not in checked:
                        checked.add(check_key)
                        result.append({
                            "type": "형",
                            "type_detail": info['name'],
                            "pillars": f"{positions[i1]}지-{positions[i2]}지",
                            "chars": f"{_get_jiji_kr(b1)}-{_get_jiji_kr(b2)}",
                            "meaning": f"{info['hanja']} - {info['desc']}"
                        })
    
    return result


# =============================================================================
# 공망 계산
# =============================================================================

# 60갑자에서 일주 기준 공망 (空亡)
# 공망은 갑자 ~ 계유 (10개 천간이 한 바퀴 도는 동안 12지지 중 2개가 빠짐)
GONGMANG_TABLE = {
    # 갑자순 (甲子 ~ 癸酉): 戌亥 공망
    '甲子': ['戌', '亥'], '乙丑': ['戌', '亥'], '丙寅': ['戌', '亥'], '丁卯': ['戌', '亥'], '戊辰': ['戌', '亥'],
    '己巳': ['戌', '亥'], '庚午': ['戌', '亥'], '辛未': ['戌', '亥'], '壬申': ['戌', '亥'], '癸酉': ['戌', '亥'],
    # 갑술순 (甲戌 ~ 癸未): 申酉 공망
    '甲戌': ['申', '酉'], '乙亥': ['申', '酉'], '丙子': ['申', '酉'], '丁丑': ['申', '酉'], '戊寅': ['申', '酉'],
    '己卯': ['申', '酉'], '庚辰': ['申', '酉'], '辛巳': ['申', '酉'], '壬午': ['申', '酉'], '癸未': ['申', '酉'],
    # 갑신순 (甲申 ~ 癸巳): 午未 공망
    '甲申': ['午', '未'], '乙酉': ['午', '未'], '丙戌': ['午', '未'], '丁亥': ['午', '未'], '戊子': ['午', '未'],
    '己丑': ['午', '未'], '庚寅': ['午', '未'], '辛卯': ['午', '未'], '壬辰': ['午', '未'], '癸巳': ['午', '未'],
    # 갑오순 (甲午 ~ 癸卯): 辰巳 공망
    '甲午': ['辰', '巳'], '乙未': ['辰', '巳'], '丙申': ['辰', '巳'], '丁酉': ['辰', '巳'], '戊戌': ['辰', '巳'],
    '己亥': ['辰', '巳'], '庚子': ['辰', '巳'], '辛丑': ['辰', '巳'], '壬寅': ['辰', '巳'], '癸卯': ['辰', '巳'],
    # 갑진순 (甲辰 ~ 癸丑): 寅卯 공망
    '甲辰': ['寅', '卯'], '乙巳': ['寅', '卯'], '丙午': ['寅', '卯'], '丁未': ['寅', '卯'], '戊申': ['寅', '卯'],
    '己酉': ['寅', '卯'], '庚戌': ['寅', '卯'], '辛亥': ['寅', '卯'], '壬子': ['寅', '卯'], '癸丑': ['寅', '卯'],
    # 갑인순 (甲寅 ~ 癸亥): 子丑 공망
    '甲寅': ['子', '丑'], '乙卯': ['子', '丑'], '丙辰': ['子', '丑'], '丁巳': ['子', '丑'], '戊午': ['子', '丑'],
    '己未': ['子', '丑'], '庚申': ['子', '丑'], '辛酉': ['子', '丑'], '壬戌': ['子', '丑'], '癸亥': ['子', '丑'],
}


def calculate_gongmang(day_pillar: str) -> list:
    """일주 기준 공망을 계산합니다."""
    # 괄호 안 한글 발음 제거
    if '(' in day_pillar:
        day_pillar = day_pillar.split('(')[0]
    return GONGMANG_TABLE.get(day_pillar, [])


# =============================================================================
# 신살 계산
# =============================================================================

# 천을귀인 (天乙貴人) - 일간 기준
CHUNEUL_GWIIN = {
    '甲': ['丑', '未'], '乙': ['子', '申'], '丙': ['亥', '酉'], '丁': ['亥', '酉'],
    '戊': ['丑', '未'], '己': ['子', '申'], '庚': ['丑', '未'], '辛': ['寅', '午'],
    '壬': ['卯', '巳'], '癸': ['卯', '巳']
}

# 도화살 (桃花殺) - 년지/일지 기준
DOHWA = {
    '寅': '卯', '午': '卯', '戌': '卯',  # 인오술은 묘에서 도화
    '申': '酉', '子': '酉', '辰': '酉',  # 신자진은 유에서 도화
    '巳': '午', '酉': '午', '丑': '午',  # 사유축은 오에서 도화
    '亥': '子', '卯': '子', '未': '子',  # 해묘미는 자에서 도화
}

# 역마살 (驛馬殺) - 년지/일지 기준
YEOKMA = {
    '寅': '申', '午': '申', '戌': '申',  # 인오술은 신에서 역마
    '申': '寅', '子': '寅', '辰': '寅',  # 신자진은 인에서 역마
    '巳': '亥', '酉': '亥', '丑': '亥',  # 사유축은 해에서 역마
    '亥': '巳', '卯': '巳', '未': '巳',  # 해묘미는 사에서 역마
}

# 화개살 (華蓋殺) - 년지/일지 기준
HWAGAE = {
    '寅': '戌', '午': '戌', '戌': '戌',  # 인오술은 술에서 화개
    '申': '辰', '子': '辰', '辰': '辰',  # 신자진은 진에서 화개
    '巳': '丑', '酉': '丑', '丑': '丑',  # 사유축은 축에서 화개
    '亥': '未', '卯': '未', '未': '未',  # 해묘미는 미에서 화개
}

# 양인살 (羊刃殺) - 일간 기준
YANGIN = {
    '甲': '卯', '乙': '辰', '丙': '午', '丁': '未', '戊': '午',
    '己': '未', '庚': '酉', '辛': '戌', '壬': '子', '癸': '丑'
}


def calculate_sinsal(pillars: dict) -> list:
    """
    사주에서 신살을 계산합니다.
    
    Returns:
        [{"name": "천을귀인", "icon": "star", "position": "년주", "type": "귀인", ...}]
    """
    result = []
    
    day_pillar = pillars.get("day", "")
    if len(day_pillar) < 2:
        return result
    
    # 괄호 제거
    if '(' in day_pillar:
        day_pillar = day_pillar.split('(')[0]
    
    day_stem = day_pillar[0]  # 일간
    day_branch = day_pillar[1]  # 일지
    
    year_pillar = pillars.get("year", "")
    if '(' in year_pillar:
        year_pillar = year_pillar.split('(')[0]
    year_branch = year_pillar[1] if len(year_pillar) >= 2 else ""
    
    # 모든 지지
    branches = {}
    for key, label in [("year", "년주"), ("month", "월주"), ("day", "일주"), ("hour", "시주")]:
        p = pillars.get(key, "")
        if '(' in p:
            p = p.split('(')[0]
        if len(p) >= 2:
            branches[label] = p[1]
    
    # 1. 천을귀인 검사
    gwiin_positions = CHUNEUL_GWIIN.get(day_stem, [])
    for pos, branch in branches.items():
        if branch in gwiin_positions:
            result.append({
                "name": "천을귀인",
                "icon": "star",
                "position": pos,
                "type": "귀인",
                "condition_good": "어려울 때 귀인의 도움을 받기 쉬움",
                "condition_bad": "너무 의존하면 자립심이 약해질 수 있음"
            })
    
    # 2. 도화살 검사 (년지/일지 기준)
    for base_label, base_branch in [("년지", year_branch), ("일지", day_branch)]:
        if not base_branch:
            continue
        dohwa_target = DOHWA.get(base_branch, "")
        for pos, branch in branches.items():
            if branch == dohwa_target:
                result.append({
                    "name": "도화살",
                    "icon": "flower",
                    "position": pos,
                    "type": "도화",
                    "condition_good": "매력과 인기, 예술적 감각 발휘",
                    "condition_bad": "이성 문제나 유혹에 취약할 수 있음"
                })
                break  # 중복 방지
    
    # 3. 역마살 검사 (년지/일지 기준)
    for base_label, base_branch in [("년지", year_branch), ("일지", day_branch)]:
        if not base_branch:
            continue
        yeokma_target = YEOKMA.get(base_branch, "")
        for pos, branch in branches.items():
            if branch == yeokma_target:
                result.append({
                    "name": "역마살",
                    "icon": "run",
                    "position": pos,
                    "type": "역마",
                    "condition_good": "활동적 에너지, 이동/변화에 유리",
                    "condition_bad": "불안정하거나 한 곳에 정착하기 어려움"
                })
                break
    
    # 4. 화개살 검사
    for base_label, base_branch in [("년지", year_branch), ("일지", day_branch)]:
        if not base_branch:
            continue
        hwagae_target = HWAGAE.get(base_branch, "")
        for pos, branch in branches.items():
            if branch == hwagae_target:
                result.append({
                    "name": "화개살",
                    "icon": "drama",
                    "position": pos,
                    "type": "살",
                    "condition_good": "예술적 재능, 철학적 깊이",
                    "condition_bad": "고독감, 세상과의 괴리감"
                })
                break
    
    # 5. 양인살 검사
    yangin_target = YANGIN.get(day_stem, "")
    for pos, branch in branches.items():
        if branch == yangin_target:
            result.append({
                "name": "양인살",
                "icon": "sword",
                "position": pos,
                "type": "살",
                "condition_good": "강한 추진력과 리더십",
                "condition_bad": "공격적이거나 독단적일 수 있음"
            })
    
    return result


# =============================================================================
# 오행 분포 및 신강/신약 판단
# =============================================================================

def calculate_oheng_distribution(pillars: dict) -> dict:
    """오행 분포를 계산합니다."""
    count = {'목': 0, '화': 0, '토': 0, '금': 0, '수': 0}
    
    for key in ["year", "month", "day", "hour"]:
        pillar = pillars.get(key, "")
        if '(' in pillar:
            pillar = pillar.split('(')[0]
        if len(pillar) >= 2:
            stem = pillar[0]
            branch = pillar[1]
            if stem in CHEONGAN_OHENG:
                count[CHEONGAN_OHENG[stem]] += 1
            if branch in JIJI_OHENG:
                count[JIJI_OHENG[branch]] += 1
    
    return count


def calculate_yinyang_balance(pillars: dict) -> dict:
    """음양 균형을 계산합니다."""
    yang = 0
    yin = 0
    
    for key in ["year", "month", "day", "hour"]:
        pillar = pillars.get(key, "")
        if '(' in pillar:
            pillar = pillar.split('(')[0]
        if len(pillar) >= 2:
            stem = pillar[0]
            branch = pillar[1]
            if CHEONGAN_YINYANG.get(stem):
                yang += 1
            else:
                yin += 1
            if JIJI_YINYANG.get(branch):
                yang += 1
            else:
                yin += 1
    
    return {"양": yang, "음": yin}


def determine_strength(pillars: dict, month_oheng: str = None) -> str:
    """
    신강/신약을 판단합니다.
    단순 규칙: 일간의 오행과 같거나 생해주는 오행이 많으면 신강
    """
    day_pillar = pillars.get("day", "")
    if '(' in day_pillar:
        day_pillar = day_pillar.split('(')[0]
    if len(day_pillar) < 1:
        return "판단불가"
    
    day_stem = day_pillar[0]
    my_oheng = CHEONGAN_OHENG.get(day_stem, "")
    
    # 나를 생하는 오행
    generating_me = [k for k, v in OHENG_GENERATE.items() if v == my_oheng]
    
    oheng_dist = calculate_oheng_distribution(pillars)
    
    # 비겁 (같은 오행) + 인성 (나를 생하는 오행) 점수
    support = oheng_dist.get(my_oheng, 0)
    for g in generating_me:
        support += oheng_dist.get(g, 0)
    
    # 나머지 오행 점수
    total = sum(oheng_dist.values())
    nonsupport = total - support
    
    if support > nonsupport:
        return "신강"
    elif support < nonsupport:
        return "신약"
    else:
        return "중화"


# =============================================================================
# 12운성 (十二運星) 계산
# =============================================================================

TWELVE_STAGES = ['장생', '목욕', '관대', '건록', '제왕', '쇠', '병', '사', '묘', '절', '태', '양']

# 각 천간이 장생(長生)하는 지지 위치
TWELVE_STAGES_START = {
    '甲': '亥', '乙': '午', '丙': '寅', '丁': '酉', '戊': '寅',
    '己': '酉', '庚': '巳', '辛': '子', '壬': '申', '癸': '卯'
}


def get_twelve_stage(stem: str, branch: str) -> str:
    """
    천간과 지지의 12운성을 산출합니다.
    양간은 순행, 음간은 역행.
    """
    if stem not in CHEONGAN or branch not in JIJI:
        return ''
    start_idx = JIJI.index(TWELVE_STAGES_START[stem])
    branch_idx = JIJI.index(branch)
    is_yang = CHEONGAN_YINYANG[stem]
    if is_yang:
        stage_idx = (branch_idx - start_idx) % 12
    else:
        stage_idx = (start_idx - branch_idx) % 12
    return TWELVE_STAGES[stage_idx]


def calculate_twelve_stages(pillars: dict) -> dict:
    """
    일간 기준으로 각 기둥 지지의 12운성을 산출합니다.
    
    Returns:
        {'year': {'branch': '子', 'stage': '목욕'}, ...}
    """
    day_raw = pillars.get('day', '')
    if '(' in day_raw:
        day_raw = day_raw.split('(')[0]
    day_stem = day_raw[0] if day_raw else ''
    if not day_stem:
        return {}
    
    result = {}
    for key in ['year', 'month', 'day', 'hour']:
        p = pillars.get(key, '')
        if '(' in p:
            p = p.split('(')[0]
        branch = p[1] if len(p) >= 2 else ''
        if branch:
            result[key] = {
                'branch': branch,
                'stage': get_twelve_stage(day_stem, branch),
            }
    return result


# =============================================================================
# 지장간 (支藏干) 계산
# =============================================================================

# 지지 안에 숨은 천간 (여기→중기→정기 순서, 마지막이 정기/본기)
JIJANGGAN = {
    '子': ['癸'],
    '丑': ['癸', '辛', '己'],
    '寅': ['戊', '丙', '甲'],
    '卯': ['乙'],
    '辰': ['乙', '癸', '戊'],
    '巳': ['戊', '庚', '丙'],
    '午': ['丙', '己', '丁'],
    '未': ['丁', '乙', '己'],
    '申': ['己', '壬', '庚'],
    '酉': ['辛'],
    '戌': ['辛', '丁', '戊'],
    '亥': ['戊', '甲', '壬'],
}


def calculate_jijanggan(pillars: dict) -> dict:
    """
    각 기둥 지지의 지장간을 산출합니다.
    
    Returns:
        {'year': {'branch': '子', 'jijanggan': ['癸'], 'jeongggi': '癸'}, ...}
    """
    result = {}
    for key in ['year', 'month', 'day', 'hour']:
        p = pillars.get(key, '')
        if '(' in p:
            p = p.split('(')[0]
        branch = p[1] if len(p) >= 2 else ''
        if branch and branch in JIJANGGAN:
            hidden = JIJANGGAN[branch]
            result[key] = {
                'branch': branch,
                'jijanggan': hidden,
                'jeonggi': hidden[-1],  # 정기(본기)는 마지막 원소
            }
    return result


# =============================================================================
# 통합 계산 함수
# =============================================================================

def calculate_advanced_analysis(pillars_raw: dict, gender: str = 'male') -> dict:
    """
    사주팔자를 기반으로 확정적인 분석 데이터를 계산합니다.
    
    Args:
        pillars_raw: {"year": "甲子(갑자)", "month": "丙寅(병인)", ...}
        gender: 'male' or 'female'
    
    Returns:
        확정 계산된 분석 데이터
    """
    # 괄호 제거한 순수 한자 간지
    pillars = {}
    for key in ["year", "month", "day", "hour"]:
        p = pillars_raw.get(key, "")
        if '(' in p:
            p = p.split('(')[0]
        pillars[key] = p
    
    # 1. 십신 계산
    sipsin_data = calculate_all_sipsin(pillars)
    
    # 십신 분포 집계
    sipsin_count = {}
    for pos, data in sipsin_data.items():
        sipsin = data.get('sipsin', '')
        if sipsin and sipsin != '일간':
            sipsin_count[sipsin] = sipsin_count.get(sipsin, 0) + 1
    
    # 십신군 분류
    sipsin_groups = {
        '비겁': sipsin_count.get('비견', 0) + sipsin_count.get('겁재', 0),
        '식상': sipsin_count.get('식신', 0) + sipsin_count.get('상관', 0),
        '재성': sipsin_count.get('편재', 0) + sipsin_count.get('정재', 0),
        '관성': sipsin_count.get('편관', 0) + sipsin_count.get('정관', 0),
        '인성': sipsin_count.get('편인', 0) + sipsin_count.get('정인', 0),
    }
    
    dominant_group = max(sipsin_groups, key=sipsin_groups.get) if sipsin_groups else ""
    weak_group = min(sipsin_groups, key=sipsin_groups.get) if sipsin_groups else ""
    
    # 2. 합충형파해
    interactions = find_interactions(pillars_raw)
    
    # 3. 공망
    day_pillar_raw = pillars_raw.get("day", "")
    gongmang = calculate_gongmang(day_pillar_raw)
    
    # 4. 신살
    sinsal = calculate_sinsal(pillars_raw)
    
    # 5. 오행 분포
    oheng_dist = calculate_oheng_distribution(pillars_raw)
    
    # 6. 음양 균형
    yinyang = calculate_yinyang_balance(pillars_raw)
    
    # 7. 신강/신약
    strength = determine_strength(pillars_raw)
    
    # 8. 12운성
    twelve_stages = calculate_twelve_stages(pillars_raw)
    
    # 9. 지장간
    jijanggan = calculate_jijanggan(pillars_raw)
    
    return {
        "sipsin": {
            "details": sipsin_data,
            "count": sipsin_count,
            "groups": sipsin_groups,
            "dominant": dominant_group,
            "weak": weak_group,
        },
        "interactions": {
            "items": interactions,
            "gongmang": gongmang,
        },
        "sinsal": {
            "items": sinsal,
        },
        "oheng": oheng_dist,
        "yinyang": yinyang,
        "strength": strength,
        "twelve_stages": twelve_stages,
        "jijanggan": jijanggan,
    }
