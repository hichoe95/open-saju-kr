"""
텍스트 후처리 유틸리티
- 한자에 한글 발음 병기
- 마크다운 정규화
"""

# TODO LLM-2: LLM output should be sanitized for HTML/script injection before storage.
# TODO LLM-2: Frontend should also escape when rendering user-facing LLM content.
import re

# 천간/지지 매핑
HANJA_TO_HANGUL = {
    # 천간
    '甲': '갑', '乙': '을', '丙': '병', '丁': '정', '戊': '무',
    '己': '기', '庚': '경', '辛': '신', '壬': '임', '癸': '계',
    # 지지
    '子': '자', '丑': '축', '寅': '인', '卯': '묘', '辰': '진', '巳': '사',
    '午': '오', '未': '미', '申': '신', '酉': '유', '戌': '술', '亥': '해',
    # 오행
    '木': '목', '火': '화', '土': '토', '金': '금', '水': '수',
    # 십성
    '官': '관', '殺': '살', '印': '인', '梟': '효', '比': '비', '劫': '겁',
    '食': '식', '傷': '상', '財': '재', '正': '정', '偏': '편',
    # 신살
    '驛': '역', '馬': '마', '桃': '도', '花': '화', '華': '화', '蓋': '개',
    '羊': '양', '刃': '인', '將': '장', '星': '성', '貴': '귀', '人': '인',
    '文': '문', '昌': '창', '天': '천', '德': '덕', '月': '월', '日': '일',
    '祿': '록', '神': '신', '空': '공', '亡': '망', '劫': '겁', '災': '재',
    # 기타 자주 쓰이는 한자
    '年': '년', '時': '시', '柱': '주', '運': '운', '大': '대', '歲': '세',
    '合': '합', '沖': '충', '刑': '형', '破': '파', '害': '해', '生': '생',
    '克': '극', '旺': '왕', '相': '상', '休': '휴', '囚': '수', '死': '사',
    # 숫자
    '一': '일', '二': '이', '三': '삼', '四': '사', '五': '오',
    '六': '육', '七': '칠', '八': '팔', '九': '구', '十': '십',
    # 음양·격국·기타 명리 용어
    '陽': '양', '陰': '음', '格': '격', '局': '국', '從': '종',
    '氣': '기', '命': '명', '吉': '길', '凶': '흉', '福': '복',
    '方': '방', '位': '위', '力': '력', '勢': '세', '根': '근',
    # 12운성 관련
    '長': '장', '沐': '목', '冠': '관', '帝': '제', '衰': '쇠',
    '墓': '묘', '絕': '절', '胎': '태', '養': '양', '建': '건', '祿': '록',
    '病': '병', '旺': '왕',
    # 기타 빈출 한자
    '中': '중', '上': '상', '下': '하', '內': '내', '外': '외',
    '强': '강', '弱': '약', '用': '용', '忌': '기', '喜': '희'
}

# 이미 한글 발음이 붙은 패턴 (예: 甲子(갑자)) 감지용
ALREADY_ANNOTATED_PATTERN = re.compile(r'[\u4e00-\u9fff]+\([가-힣]+\)')

# 한글(한자) 패턴 (예: 상관(傷官)) - 이미 앞에 한글이 있으므로 건너뜀
HANGUL_HANJA_PATTERN = re.compile(r'[가-힣]+\([\u4e00-\u9fff]+\)')

# 연속된 한자 패턴 (1~4자) - 앞뒤로 괄호가 없는 경우만
HANJA_SEQUENCE_PATTERN = re.compile(r'(?<!\()(?<![가-힣])([\u4e00-\u9fff]{1,4})(?!\([가-힣])(?!\))')


def _convert_hanja_sequence(match: re.Match) -> str:
    """연속된 한자를 한글 발음이 붙은 형태로 변환"""
    hanja_seq = match.group(1)
    hangul_seq = ''.join(HANJA_TO_HANGUL.get(char, char) for char in hanja_seq)
    
    # 만약 모든 글자가 변환되었으면 (한글로 온전히 변환됨)
    if all(char in HANJA_TO_HANGUL for char in hanja_seq):
        return f"{hanja_seq}({hangul_seq})"
    else:
        # 일부만 변환 가능하면 그냥 원본 반환 (알 수 없는 한자 포함)
        return hanja_seq


# 괄호 패턴 (내용 보호용)
PARENTHESES_PATTERN = re.compile(r'\([^)]+\)')

def add_hangul_to_hanja(text: str) -> str:
    """
    텍스트 내의 한자에 한글 발음을 병기합니다.
    이미 발음이 붙어있는 한자나 괄호 안에 있는 한자는 건너뜁니다.
    
    예시: "甲子일주" -> "甲子(갑자)일주"
    """
    if not text:
        return text
    
    # Step 1: 보호해야 할 패턴들을 임시 토큰으로 치환
    placeholders = {}
    placeholder_idx = 0
    
    def save_placeholder(match):
        nonlocal placeholder_idx
        key = f"__PROTECTED_{placeholder_idx}__"
        placeholders[key] = match.group(0)
        placeholder_idx += 1
        return key
    
    # 1. 이미 한글 발음이 붙은 패턴 보호 (甲子(갑자))
    temp_text = ALREADY_ANNOTATED_PATTERN.sub(save_placeholder, text)
    
    # 2. 한글(한자) 패턴 보호 (상관(傷官))
    temp_text = HANGUL_HANJA_PATTERN.sub(save_placeholder, temp_text)
    
    # 3. 괄호 안에 있는 내용 보호 ( (正官, 正官) 등 )
    #    -> 위 1, 2번에서 처리되지 않은 나머지 괄호들을 보호함
    temp_text = PARENTHESES_PATTERN.sub(save_placeholder, temp_text)
    
    # Step 2: 아직 발음이 안 붙은(그리고 괄호 밖의) 한자 시퀀스에 발음 추가
    temp_text = HANJA_SEQUENCE_PATTERN.sub(_convert_hanja_sequence, temp_text)
    
    # Step 3: 플레이스홀더 복원 (역순으로 - 중첩된 경우 바깥쪽부터 해제해야 함)
    for key, value in reversed(list(placeholders.items())):
        temp_text = temp_text.replace(key, value)
    
    return temp_text


def normalize_newlines(text: str) -> str:
    """
    이스케이프된 줄바꿈 문자를 실제 줄바꿈으로 변환합니다.
    JSON에서 \\n이 문자열 리터럴로 저장된 경우를 처리합니다.
    """
    if not text:
        return text
    
    # \\n (escape된 newline)을 실제 \n으로 변환
    result = text.replace('\\n', '\n')
    
    # \\t (escape된 tab)을 실제 공백으로 변환
    result = result.replace('\\t', '  ')
    
    return result


# 영어 기술 용어 -> 한글 치환 매핑
ENGLISH_TO_KOREAN = {
    # Bazi 엔진 키워드
    "ten_gods_by_pillar": "십신 배치",
    "ten_gods": "십신",
    "five_elements": "오행",
    "favorable_elements": "용신 오행",
    "major_luck": "대운",
    "annual_luck": "세운",
    "monthly_luck": "월운",
    "spirits_and_stars": "신살",
    "chart_quality": "사주 품질",
    "four_pillars": "사주팔자",
    "gan_ten_god": "천간 십신",
    "zhi_ten_god": "지지 십신",
    "distribution": "분포",
    "dominant_gods": "주요 십신",
    "wood": "목",
    "fire": "화",
    "earth": "토",
    "metal": "금",
    "water": "수",
    # 십신 영어 표기
    "Rob Wealth": "겁재",
    "Friend": "비견",
    "Eating God": "식신",
    "Hurting Officer": "상관",
    "Direct Wealth": "정재",
    "Indirect Wealth": "편재",
    "Direct Officer": "정관",
    "Seven Killings": "편관",
    "Direct Resource": "정인",
    "Indirect Resource": "편인",
    "Parallel": "비견",
    "Companion": "비견",
    # 십이운성 영어 표기
    "Growth": "장생",
    "Bath": "목욕",
    "Crown": "관대",
    "Prosperity": "건록",
    "Peak": "제왕",
    "Decline": "쇠",
    "Sickness": "병",
    "Death": "사",
    "Grave": "묘",
    "Extinction": "절",
    "Conception": "태",
    "Nurturing": "양",
    # 신살 영어 표기
    "Nobleman": "귀인",
    "Travel Horse": "역마",
    "Peach Blossom": "도화",
    "Flower Canopy": "화개",
    "Sheep Blade": "양인",
    # 기타
    "Day Master": "일간",
    "Year Pillar": "년주",
    "Month Pillar": "월주",
    "Day Pillar": "일주",
    "Hour Pillar": "시주",
    "Strong": "신강",
    "Weak": "신약",
    "Balanced": "중화",
    "Favorable God": "용신",
    "Joyful God": "희신",
    "Unfavorable God": "기신",
}


def replace_english_terms(text: str) -> str:
    """
    텍스트에서 영어 기술 용어를 한글로 치환합니다.
    """
    if not text:
        return text
    
    result = text
    for eng, kor in ENGLISH_TO_KOREAN.items():
        # 영어 단어를 한글로 치환 (대소문자 구분 없이)
        result = re.sub(rf'\b{eng}\b', kor, result, flags=re.IGNORECASE)
    
    return result



# 한자(한자) 패턴 (예: 甲(甲) -> 甲(갑))
SAME_HANJA_PAREN_PATTERN = re.compile(r'([\u4e00-\u9fff])\(\1\)')

def fix_single_hanja_parens(text: str) -> str:
    """
    한자(한자) 형태로 중복된 경우, 매핑 테이블을 이용해 한자(한글)로 변환합니다.
    예: 甲(甲) -> 甲(갑)
    """
    if not text:
        return text
        
    def _repl(match):
        hanja = match.group(1)
        hangul = HANJA_TO_HANGUL.get(hanja)
        if hangul:
            return f"{hanja}({hangul})"
        return match.group(0)
    
    return SAME_HANJA_PAREN_PATTERN.sub(_repl, text)


# 중복 한자 패턴 (예: 정관(正官, 正官) -> 정관(正官))
DUPLICATE_HANJA_PATTERN = re.compile(r'([가-힣]+)\(([^,)]+),\s*\2\)')

# 중복 괄호 패턴 (예: 정관(正官)(정관) -> 정관(正官))
DUPLICATE_PAREN_PATTERN = re.compile(r'([가-힣]+)\(([^\)]+)\)\(\1\)')

# 한글(한자)(한글) 패턴 (예: 비견(比肩)(비견) -> 비견(비견)) - 수정: 비견(比肩)
HANGUL_HANJA_HANGUL_PATTERN = re.compile(r'([가-힣]+)\(([\u4e00-\u9fff]+)\)\(\1\)')

# 이상한 반복 패턴 (예: 乙亥(을해)(乙亥) -> 乙亥(을해))
WEIRD_HANJA_REPETITION_PATTERN = re.compile(r'([\u4e00-\u9fff]+)\(([가-힣]+)\)\(\1\)')


def remove_duplicate_hanja(text: str) -> str:
    """
    중복된 한자 표기를 정리합니다.
    예: 정관(正官, 正官) -> 정관(正官)
    예: 비견(比肩)(비견) -> 비견(比肩)
    예: 乙亥(을해)(乙亥) -> 乙亥(을해)
    """
    if not text:
        return text
    
    # 패턴 1: 한글(한자, 한자) -> 한글(한자)
    result = DUPLICATE_HANJA_PATTERN.sub(r'\1(\2)', text)
    
    # 패턴 2: 한글(한자)(한글) -> 한글(한자)
    result = HANGUL_HANJA_HANGUL_PATTERN.sub(r'\1(\2)', result)
    
    # 패턴 3: 한자(한글)(한자) -> 한자(한글)
    result = WEIRD_HANJA_REPETITION_PATTERN.sub(r'\1(\2)', result)
    
    # 패턴 4: 한글(내용)(한글) -> 한글(내용)
    result = DUPLICATE_PAREN_PATTERN.sub(r'\1(\2)', result)
    
    return result


def postprocess_reading_response(data: dict) -> dict:
    """
    사주 분석 응답 전체에 대해 후처리를 수행합니다.
    - 모든 텍스트 필드에서 한자에 한글 발음 병기
    - 중복 한자 패턴 정리
    - 줄바꿈 문자 정규화
    - 영문 기술 용어를 한글로 치환
    """
    if not data:
        return data
    
    # 재귀적으로 모든 문자열 필드 처리
    def process_value(value):
        if isinstance(value, str):
            result = normalize_newlines(value)  # 줄바꿈 정규화 먼저
            result = add_hangul_to_hanja(result)
            result = remove_duplicate_hanja(result)
            result = fix_single_hanja_parens(result) # 한자(한자) 수정
            result = replace_english_terms(result)  # 영어 -> 한글 치환
            return result
        elif isinstance(value, dict):
            return {k: process_value(v) for k, v in value.items()}
        elif isinstance(value, list):
            return [process_value(item) for item in value]
        else:
            return value
    
    return process_value(data)
