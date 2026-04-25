// 온보딩 관련 타입 정의
import { ContextTopic } from './index';

export interface OnboardingFormData {
  // Step 0에서 결정
  usePrefill: boolean;

  // Step 1: 이름
  name: string;

  // Step 2: 성별
  gender: 'male' | 'female' | null;

  // Step 3: 생년월일
  birthYear: string;
  birthMonth: string;
  birthDay: string;
  calendarType: 'solar' | 'lunar';

  // Step 4: 출생 시간
  birthJiji: string; // 12지지 코드 (ja, chuk, in, ...)

  // Step 5: 고민 상세
  topic: ContextTopic;
  details: string;

  // Step 6: 동의
  isAgreed: boolean;

  // OAuth에서 가져온 원본 데이터
  oauthProvider?: 'kakao' | 'naver';
  oauthName?: string;
  oauthBirthYear?: string;
  oauthBirthMonth?: string;
  oauthBirthDay?: string;
  oauthGender?: 'male' | 'female';
}

export const ONBOARDING_STORAGE_KEY = 'signup_onboarding_data';
export const ONBOARDING_ANALYSIS_KEY = 'onboarding_analysis_data';
export const SIGNUP_PROFILE_KEY = 'signup_profile_v1';

// 회원가입에서 저장하는 프로필 데이터 타입
export interface SignupProfileData {
  name: string;
  gender: 'male' | 'female';
  birthYear: string;
  birthMonth: string;
  birthDay: string;
}

export const INITIAL_FORM_DATA: OnboardingFormData = {
  usePrefill: false,
  name: '',
  gender: null,
  birthYear: '1990',
  birthMonth: '01',
  birthDay: '01',
  calendarType: 'solar',
  birthJiji: 'unknown',
  topic: 'general',
  details: '',
  isAgreed: false,
};

// 12지지 시간대
export const JIJI_HOURS = [
  { value: 'unknown', label: '모름 (시간 미상)', time: '12:00', hanja: '' },
  { value: 'ja', label: '자(子)시 23:30~01:29', time: '00:30', hanja: '子' },
  { value: 'chuk', label: '축(丑)시 01:30~03:29', time: '02:30', hanja: '丑' },
  { value: 'in', label: '인(寅)시 03:30~05:29', time: '04:30', hanja: '寅' },
  { value: 'myo', label: '묘(卯)시 05:30~07:29', time: '06:30', hanja: '卯' },
  { value: 'jin', label: '진(辰)시 07:30~09:29', time: '08:30', hanja: '辰' },
  { value: 'sa', label: '사(巳)시 09:30~11:29', time: '10:30', hanja: '巳' },
  { value: 'o', label: '오(午)시 11:30~13:29', time: '12:30', hanja: '午' },
  { value: 'mi', label: '미(未)시 13:30~15:29', time: '14:30', hanja: '未' },
  { value: 'shin', label: '신(申)시 15:30~17:29', time: '16:30', hanja: '申' },
  { value: 'yu', label: '유(酉)시 17:30~19:29', time: '18:30', hanja: '酉' },
  { value: 'sul', label: '술(戌)시 19:30~21:29', time: '20:30', hanja: '戌' },
  { value: 'hae', label: '해(亥)시 21:30~23:29', time: '22:30', hanja: '亥' },
];

// 상담 주제
export const TOPICS = [
  { value: 'general' as ContextTopic, label: '종합', image: '/icons/crystal.png' },
  { value: 'love' as ContextTopic, label: '연애', image: '/icons/love.png' },
  { value: 'career' as ContextTopic, label: '커리어', image: '/icons/career.png' },
  { value: 'money' as ContextTopic, label: '재물', image: '/icons/money.png' },
  { value: 'study' as ContextTopic, label: '학업', image: '/icons/study.png' },
  { value: 'health' as ContextTopic, label: '건강', image: '/icons/health.png' },
];

// 도사 이미지 경로
export const DOSA_IMAGES = {
  welcome: '/icons/onboarding/dosa_welcome.png',
  listening: '/icons/onboarding/dosa_listening.png',
  yinyang: '/icons/onboarding/dosa_yinyang.png',
  calendar: '/icons/onboarding/dosa_calendar.png',
  time: '/icons/onboarding/dosa_time.png',
  thinking: '/icons/onboarding/dosa_thinking.png',
  thumbsup: '/icons/onboarding/dosa_thumbsup.png',
};

// 도사 멘트 (**강조** 마크다운 지원)
export const DOSA_MESSAGES = {
  step0: "허허, 카카오에서 그대의 정보를 가져왔구려! 이 정보로 **미리 채워드릴까요**?",
  step1: "어서 오시게! 이 도사가 그대의 **사주**를 봐드리리다. 먼저 **이름**을 알려주시겠소? 사주에서 이름은 **기운을 담는 그릇**과 같다오.",
  step2: "음... **성별**은 **대운(大運)**의 방향을 정하는 중요한 단서라오. 남성은 **순행**, 여성은 **역행**으로 10년 운이 흘러가거든.",
  step3: "**태어난 날**을 알려주시게! 년월일이 사주의 **네 기둥 중 세 개**를 결정한다오. **년주**는 조상, **월주**는 부모, **일주**는 바로 그대 자신이지!",
  step4: "마지막 기둥인 **시주(時柱)**! 태어난 **시간대**를 알려주시게. 모르셔도 괜찮소, 대략적인 시간대로 골라주시면 되오.",
  step5: "그대의 **고민**을 말해보시게. 도사가 귀 기울이겠소! **구체적으로** 알려주시면 그 부분을 더 깊이 살펴보리다.",
  step6: "허허, 모든 준비가 끝났구려! **그대의 첫 발걸음을 위해, 100엽전을 미리 얹어두었소.** 사주의 문을 여는 데엔 조금만 더 있으면 충분하오. 분석에는 **최대 1분** 정도 걸리니 차 한 잔 하며 기다리시게나.",
};

export type OnboardingStep = 0 | 1 | 2 | 3 | 4 | 5 | 6;
