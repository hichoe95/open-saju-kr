import { BirthInput, ReadingResponse } from '@/types';
import { SavedProfile, getCachedReadingByProfile, ReceivedProfile } from '@/lib/api';
import { jijiToTime } from '@/utils/jijiTime';

/**
 * 궁합 비교에 사용되는 통합 후보 타입
 * 2가지 소스(DB 저장 프로필, 공유받은 사주)를 하나의 타입으로 통합
 */
export interface ComparisonCandidate {
  id: string;
  name: string;
  source: 'shared' | 'saved';
  input: BirthInput;
  data: ReadingResponse;
}

/**
 * SavedProfile → BirthInput 변환
 * mypage/page.tsx:172-182의 검증된 패턴을 추출
 */
export function profileToBirthInput(profile: SavedProfile): BirthInput {
  return {
    name: profile.label,
    birth_solar: profile.birth_date,
    birth_time: jijiToTime(profile.hour_branch),
    birth_jiji: profile.hour_branch,
    calendar_type: (profile.calendar_type as 'solar' | 'lunar') || 'solar',
    gender: (profile.gender as 'male' | 'female') || 'male',
    timezone: 'Asia/Seoul',
    birth_place: '',
    persona: profile.persona as BirthInput['persona'],
  };
}


/**
 * DB SavedProfile + ReadingResponse → ComparisonCandidate 변환
 */
export function savedToCandidate(profile: SavedProfile, data: ReadingResponse): ComparisonCandidate {
  return {
    id: profile.id,
    name: profile.label,
    source: 'saved',
    input: profileToBirthInput(profile),
    data,
  };
}


/**
 * DB 프로필의 분석 결과를 로드하여 ComparisonCandidate로 반환
 */
export async function loadSavedProfileForComparison(
  profile: SavedProfile,
  token?: string
): Promise<ComparisonCandidate | null> {
  const cachedResult = await getCachedReadingByProfile(profile.id, token);
  if (cachedResult) {
    return savedToCandidate(profile, cachedResult);
  }
  return null;
}

/**
 * DB 프로필에 대해 분석 결과가 존재하는지 빠르게 확인
 */
export async function hasComparisonData(
  profile: SavedProfile,
  token?: string
): Promise<boolean> {
  const cached = await getCachedReadingByProfile(profile.id, token);
  return cached !== null;
}


export function receivedToCandidate(profile: ReceivedProfile): ComparisonCandidate | null {
  if (!profile.analysis_data) {
    return null;
  }

  return {
    id: `received:${profile.id}`,
    name: profile.sharer_name || '알 수 없음',
    source: 'shared',
    input: {
      name: profile.sharer_name || '',
      birth_solar: profile.birth_date,
      birth_time: jijiToTime(profile.hour_branch),
      birth_jiji: profile.hour_branch,
      calendar_type: (profile.calendar_type as 'solar' | 'lunar') || 'solar',
      gender: (profile.gender as 'male' | 'female') || 'male',
      timezone: 'Asia/Seoul',
      birth_place: '',
      persona: profile.persona as BirthInput['persona'],
    },
    data: profile.analysis_data,
  };
}
