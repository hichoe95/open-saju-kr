import type { PersonaType } from '@/types';

/**
 * cachedInput.ts
 * 사주 입력값 캐시 유틸리티
 * - localStorage: saju_recent_input (완료된 분석의 입력값, 다음 방문 복원용)
 * - sessionStorage: saju_current_progress (현재 세션 진행 중인 입력값, 새로고침 복원용)
 *
 * 저장 정책: 이름/생년월일/시간대/양음력/성별만. persona/topic/고민텍스트 제외.
 * 우선순위: loaded_input(profile) > current_progress > recent_input > 빈 폼
 */

const RECENT_KEY = 'saju_recent_input';
const PROGRESS_KEY = 'saju_current_progress';

function scopedKey(baseKey: string, namespace?: string): string {
  const safeNamespace = namespace?.trim();
  return safeNamespace ? `${baseKey}:${safeNamespace}` : baseKey;
}

export interface CachedBirthInput {
  name?: string;
  birth_solar?: string;       // YYYY-MM-DD
  birth_time?: string;
  birth_jiji?: string;        // 시지 (한자)
  timezone?: string;
  birth_place?: string;
  calendar_type?: 'solar' | 'lunar';
  gender?: 'male' | 'female';
  persona?: PersonaType;
}

/** 완료된 분석 후 최근 입력값을 localStorage에 저장 */
export function saveRecentInput(input: CachedBirthInput, namespace?: string): void {
  try {
    if (!input.birth_solar) return;
    localStorage.setItem(scopedKey(RECENT_KEY, namespace), JSON.stringify(input));
  } catch {
    // 저장 실패 시 무시
  }
}

/** localStorage에서 최근 입력값을 불러옴 */
export function getRecentInput(namespace?: string): CachedBirthInput | null {
  try {
    const raw = localStorage.getItem(scopedKey(RECENT_KEY, namespace));
    if (!raw) return null;
    return JSON.parse(raw) as CachedBirthInput;
  } catch {
    return null;
  }
}

/** 현재 진행 중인 입력값을 sessionStorage에 저장 */
export function saveProgressInput(input: CachedBirthInput, namespace?: string): void {
  try {
    sessionStorage.setItem(scopedKey(PROGRESS_KEY, namespace), JSON.stringify(input));
  } catch {
    // 저장 실패 시 무시
  }
}

/** sessionStorage에서 진행 중인 입력값을 불러옴 */
export function getProgressInput(namespace?: string): CachedBirthInput | null {
  try {
    const raw = sessionStorage.getItem(scopedKey(PROGRESS_KEY, namespace));
    if (!raw) return null;
    return JSON.parse(raw) as CachedBirthInput;
  } catch {
    return null;
  }
}

/** 세션 완료 후 in-progress cache 정리 */
export function clearProgressInput(namespace?: string): void {
  try {
    sessionStorage.removeItem(scopedKey(PROGRESS_KEY, namespace));
  } catch {
    // 무시
  }
}
