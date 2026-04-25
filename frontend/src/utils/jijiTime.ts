/**
 * 12지지 시간 변환 유틸리티
 * 시간(HH:MM)을 지지시(子시, 丑시 등)로 변환
 */

// 지지 시간 정보
export const JIJI_INFO = {
  ja: { hanja: '子', korean: '자', label: '자(子)시', range: '23:30~01:29' },
  chuk: { hanja: '丑', korean: '축', label: '축(丑)시', range: '01:30~03:29' },
  in: { hanja: '寅', korean: '인', label: '인(寅)시', range: '03:30~05:29' },
  myo: { hanja: '卯', korean: '묘', label: '묘(卯)시', range: '05:30~07:29' },
  jin: { hanja: '辰', korean: '진', label: '진(辰)시', range: '07:30~09:29' },
  sa: { hanja: '巳', korean: '사', label: '사(巳)시', range: '09:30~11:29' },
  o: { hanja: '午', korean: '오', label: '오(午)시', range: '11:30~13:29' },
  mi: { hanja: '未', korean: '미', label: '미(未)시', range: '13:30~15:29' },
  shin: { hanja: '申', korean: '신', label: '신(申)시', range: '15:30~17:29' },
  yu: { hanja: '酉', korean: '유', label: '유(酉)시', range: '17:30~19:29' },
  sul: { hanja: '戌', korean: '술', label: '술(戌)시', range: '19:30~21:29' },
  hae: { hanja: '亥', korean: '해', label: '해(亥)시', range: '21:30~23:29' },
  unknown: { hanja: '', korean: '미상', label: '시간 미상', range: '' },
} as const;

export type JijiKey = keyof typeof JIJI_INFO;

// 대표 시간 → 지지 키 매핑
const TIME_TO_JIJI: Record<string, JijiKey> = {
  '00:30': 'ja',
  '02:30': 'chuk',
  '04:30': 'in',
  '06:30': 'myo',
  '08:30': 'jin',
  '10:30': 'sa',
  '12:30': 'o',
  '14:30': 'mi',
  '16:30': 'shin',
  '18:30': 'yu',
  '20:30': 'sul',
  '22:30': 'hae',
  '12:00': 'unknown', // 시간 미상의 기본값
};

// 한자 → 지지 키 매핑
const HANJA_TO_JIJI: Record<string, JijiKey> = {
  '子': 'ja',
  '丑': 'chuk',
  '寅': 'in',
  '卯': 'myo',
  '辰': 'jin',
  '巳': 'sa',
  '午': 'o',
  '未': 'mi',
  '申': 'shin',
  '酉': 'yu',
  '戌': 'sul',
  '亥': 'hae',
};

export function hanjaToJijiKey(hanja: string): JijiKey {
  if (!hanja) return 'unknown';
  return HANJA_TO_JIJI[hanja] ?? 'unknown';
}

export function normalizeJijiKey(value: string): JijiKey {
  if (!value) return 'unknown';
  if (JIJI_INFO[value as JijiKey]) return value as JijiKey;
  const fromHanja = HANJA_TO_JIJI[value];
  if (fromHanja) return fromHanja;
  return timeToJijiKey(value);
}

/**
 * 시간(HH:MM) → 지지 키 변환
 * @param time "HH:MM" 형식의 시간
 * @returns 지지 키 (ja, chuk, in 등) 또는 unknown
 */
export function timeToJijiKey(time: string): JijiKey {
  // 정확한 대표 시간인 경우
  if (TIME_TO_JIJI[time]) {
    return TIME_TO_JIJI[time];
  }

  // HH:MM 파싱하여 지지 계산
  const [hourStr, minStr] = time.split(':');
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minStr || '0', 10);
  const totalMinutes = hour * 60 + minute;

  // 30분 기준으로 지지 결정
  if (totalMinutes >= 1410 || totalMinutes < 90) return 'ja';     // 23:30 ~ 01:29
  if (totalMinutes < 210) return 'chuk';  // 01:30 ~ 03:29
  if (totalMinutes < 330) return 'in';    // 03:30 ~ 05:29
  if (totalMinutes < 450) return 'myo';   // 05:30 ~ 07:29
  if (totalMinutes < 570) return 'jin';   // 07:30 ~ 09:29
  if (totalMinutes < 690) return 'sa';    // 09:30 ~ 11:29
  if (totalMinutes < 810) return 'o';     // 11:30 ~ 13:29
  if (totalMinutes < 930) return 'mi';    // 13:30 ~ 15:29
  if (totalMinutes < 1050) return 'shin'; // 15:30 ~ 17:29
  if (totalMinutes < 1170) return 'yu';   // 17:30 ~ 19:29
  if (totalMinutes < 1290) return 'sul';  // 19:30 ~ 21:29
  return 'hae';                           // 21:30 ~ 23:29
}

/**
 * 시간(HH:MM) → 지지시 한자 표시 변환
 * @param time "HH:MM" 형식의 시간
 * @returns "子시", "丑시" 등의 형식
 */
export function timeToJijiDisplay(time: string): string {
  const key = timeToJijiKey(time);
  const info = JIJI_INFO[key];

  if (key === 'unknown') {
    return '시간 미상';
  }

  return `${info.hanja}시`;
}

/**
 * 시간(HH:MM) → 지지시 전체 표시 변환 (한자 + 한글)
 * @param time "HH:MM" 형식의 시간
 * @returns "자(子)시", "축(丑)시" 등의 형식
 */
export function timeToJijiFullDisplay(time: string): string {
  const key = timeToJijiKey(time);
  const info = JIJI_INFO[key];

  if (key === 'unknown') {
    return '시간 미상';
  }

  return info.label;
}

/**
 * 지지 키 → 지지 한자 변환
 * @param jijiKey 지지 키 (ja, chuk, in 등)
 * @returns 지지 한자 (子, 丑, 寅 등)
 */
export function jijiKeyToHanja(jijiKey: string): string {
  const info = JIJI_INFO[jijiKey as JijiKey];
  return info?.hanja || '';
}

/**
 * 지지 한자 → 지지시 표시 변환
 * @param hanja 지지 한자 (子, 丑 등)
 * @returns "子시", "丑시" 등의 형식
 */
export function hanjaToJijiDisplay(hanja: string): string {
  if (!hanja) return '시간 미상';

  const key = HANJA_TO_JIJI[hanja];
  if (!key) return hanja;

  const info = JIJI_INFO[key];
  return info.label;
}

// 시간(hour) → 지지 키 매핑 (기존 데이터 호환용)
const HOUR_TO_JIJI: Record<string, JijiKey> = {
  '00': 'ja', '0': 'ja',
  '02': 'chuk', '2': 'chuk',
  '04': 'in', '4': 'in',
  '06': 'myo', '6': 'myo',
  '08': 'jin', '8': 'jin',
  '10': 'sa',
  '12': 'o',
  '14': 'mi',
  '16': 'shin',
  '18': 'yu',
  '20': 'sul',
  '22': 'hae',
};

/**
 * 지지 키 또는 한자 또는 시간 → 지지시 전체 표시
 * @param jijiOrHanjaOrHour 지지 키(ja, chuk), 한자(子, 丑), 또는 시간(00, 02)
 * @returns "자(子)시" 등의 형식
 */
export function toJijiFullDisplay(jijiOrHanjaOrHour: string): string {
  if (!jijiOrHanjaOrHour) return '시간 미상';

  // 지지 키인 경우 (ja, chuk, in 등)
  if (JIJI_INFO[jijiOrHanjaOrHour as JijiKey]) {
    const info = JIJI_INFO[jijiOrHanjaOrHour as JijiKey];
    return info.label;
  }

  // 한자인 경우 (子, 丑 등)
  const keyFromHanja = HANJA_TO_JIJI[jijiOrHanjaOrHour];
  if (keyFromHanja) {
    const info = JIJI_INFO[keyFromHanja];
    return info.label;
  }

  // 시간(hour)인 경우 (00, 02, 04 등) - 기존 데이터 호환
  const keyFromHour = HOUR_TO_JIJI[jijiOrHanjaOrHour];
  if (keyFromHour) {
    const info = JIJI_INFO[keyFromHour];
    return info.label;
  }

  return jijiOrHanjaOrHour;
}

/**
 * BirthInput에서 시간 표시 가져오기
 * birth_jiji가 있으면 사용, 없으면 birth_time에서 변환
 */
export function getBirthTimeDisplay(birthInput: { birth_time?: string; birth_jiji?: string }): string {
  // birth_jiji가 있으면 우선 사용
  if (birthInput.birth_jiji) {
    return toJijiFullDisplay(birthInput.birth_jiji);
  }

  // birth_time에서 변환
  if (birthInput.birth_time) {
    return timeToJijiFullDisplay(birthInput.birth_time);
  }

  return '시간 미상';
}

// 지지 한자 → 대표 시간 매핑
const JIJI_TO_TIME: Record<string, string> = {
  '子': '00:30',
  '丑': '02:30',
  '寅': '04:30',
  '卯': '06:30',
  '辰': '08:30',
  '巳': '10:30',
  '午': '12:30',
  '未': '14:30',
  '申': '16:30',
  '酉': '18:30',
  '戌': '20:30',
  '亥': '22:30',
};

/**
 * 지지 한자 → 대표 시간 변환
 * @param hanja 지지 한자 (子, 丑 등)
 * @returns "HH:MM" 형식의 시간 또는 기본값 "12:00"
 */
export function jijiToTime(hanja: string): string {
  if (!hanja) return '12:00';
  return JIJI_TO_TIME[hanja] || '12:00';
}
