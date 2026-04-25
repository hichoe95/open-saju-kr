// API 타입 정의

export type Provider = 'openai' | 'google' | 'anthropic';
export type ContextTopic = 'love' | 'career' | 'money' | 'health' | 'study' | 'general';

// 도사 페르소나 유형
export type PersonaType = 'witty' | 'warm' | 'classic' | 'mz';

export type CompatibilityScenario = 'lover' | 'crush' | 'friend' | 'family' | 'business';

// 페르소나 정보 (UI 표시용)
export interface PersonaInfo {
  value: PersonaType;
  label: string;
  description: string;
  emoji: string;
}

export interface ContextInput {
  topic: ContextTopic;
  details: string;
}

export interface BirthInput {
  name?: string;
  birth_solar: string;
  birth_time: string;
  birth_jiji?: string; // 12지지 시간 (子, 丑, 寅 등) - 표시용
  timezone: string;
  birth_place: string;
  birth_lunar?: string;
  calendar_type?: 'solar' | 'lunar';
  gender: 'male' | 'female';
  persona?: PersonaType; // 도사 페르소나 스타일
  context?: ContextInput;
}

export interface ModelSelection {
  provider: Provider;
  model_id: string;
  temperature: number;
  reasoning_effort?: 'none' | 'low' | 'medium' | 'high'; // 추론 강도 (GPT-5.2)
}

export interface ReadingRequest {
  input: BirthInput;
  model: ModelSelection;
  profile_id?: string;
}

export interface CompatibilityRequest {
  user_a: BirthInput;
  user_b: BirthInput;
  model: ModelSelection;
  scenario?: CompatibilityScenario;
}

export interface CompatibilityJobStartRequest extends CompatibilityRequest {
  client_request_id: string;
}

export interface CompatibilityJobStartResponse {
  job_id: string;
  status: 'pending' | 'charged' | 'processing' | 'completed' | 'failed';
  message: string;
  progress: number;
}

export interface CompatibilityJobStatusResponse {
  job_id: string;
  status: 'pending' | 'charged' | 'processing' | 'completed' | 'failed';
  payment_state: 'not_charged' | 'charged' | 'refund_pending' | 'refunded';
  progress: number;
  result?: CompatibilityResponse | null;
  error?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  completed_at?: string | null;
}

export interface CompatibilityResponse {
  summary: string;
  score: number;
  keyword: string;
  personality_fit: string;
  element_balance: string;
  conflict_points: string;
  advice: string;
  full_text?: string;
  meta: MetaData;
}

// 응답 타입
export interface PillarsData {
  year: string;
  month: string;
  day: string;
  hour_A: string;
  hour_B: string;
  hour_note: string;
}

export interface ElementStats {
  water: number;
  wood: number;
  fire: number;
  metal: number;
  earth: number;
}

export interface CharacterData {
    summary: string;
    buffs: string[];
    debuffs: string[];
}

// Summary Tab v2 - Saju Character
export interface SajuCharacter {
    type: string;
    name: string;
    icon_path: string;
    description: string;
    element: string;
}

// Summary Tab v2 - Hidden Personality
export interface HiddenPersonality {
    outer: string;
    inner: string;
}

// Summary Tab v2 - Yearly Prediction
export interface YearlyPrediction {
    event: string;
    energy: string;
}

export interface Section {
  title: string;
  items: string[];
  type: 'positive' | 'negative' | 'tip';
}

export interface LifeStatRadar {
  intellect: number;
  charm: number;
  wealth: number;
  vitality: number;
  mental: number;
}

export interface CardStats {
    stats: ElementStats;
    character: CharacterData;
    tags: string[];
    joseon_job?: string;
    soul_animal?: string;
    aura_color?: string;
    aura_color_name?: string;
    life_stat_radar?: LifeStatRadar;
    title_badge?: string;
}

export type CardData = CardStats;

export interface Timeline {
  past: string;
  present: string;
  future: string;
}

export interface LoveTab {
  summary: string;
  full_text?: string;
  timeline: Timeline;
  dos: string[];
  donts: string[];
  scripts: string[];
  date_flow?: {
    start: string;
    middle: string;
    end: string;
  };
  love_style_badges?: string[];
  ideal_type_portrait?: string;
  flirting_skill?: string;
  best_confession_timing?: string;
  past_life_love?: string;
  // Love Tab v2 fields
  love_energy_score?: number;        // 0-100
  breakup_risk_months?: number[];    // e.g. [3, 7, 11]
  ideal_stem_type?: string;          // "이런 일간이 좋아요"
}

export interface MoneyTab {
  summary: string;
  full_text?: string;
  timeline: Timeline;
  risk: string[];
  rules: string[];
  wealth_vessel?: string;
  money_type?: string;
  shopping_ban_list?: string[];
  investment_dna?: string;
  leak_warning?: string;
  // Money Tab v2 fields
  wealth_grade?: string;       // S/A/B/C/D
  lucky_money_days?: number[]; // e.g. [5, 12, 23]
  leak_weekday?: string;       // e.g. "화요일"
}

export interface CareerTab {
  summary: string;
  full_text?: string;
  timeline: Timeline;
  fit: string[];
  avoid: string[];
  next_steps: string[];
  job_change_signal?: string;
  office_villain_risk?: string;
  interview_killer_move?: string;
  salary_nego_timing?: string;
  office_role?: string;
  // Career Tab v2 fields
  dream_jobs?: string[];        // 천직 3개
  promotion_energy?: string;    // 강함/보통/약함
}

export interface StudyTab {
  summary: string;
  full_text?: string;
  timeline: Timeline;
  routine: string[];
  pitfalls: string[];
  study_type?: string;
  focus_golden_time?: string;
  study_bgm?: string;
  slump_escape?: string;
}

export interface HealthTab {
  summary: string;
  full_text?: string;
  timeline: Timeline;
  routine: string[];
  warnings: string[];
  body_type?: string;
  weak_organs?: string[];
  exercise_recommendation?: string;
  stress_relief?: string;
}

export interface YearFlow {
  year: number;
  theme: string;
  risk: string;
  tip: string;
  weather_icon?: string;
  strategy?: string;
}

export interface LifeFlowTab {
  mechanism: string[];
  years: YearFlow[];
  monthly_optional?: Array<{
    range: string;
    ganji: string;
    work: string;
    money: string;
    love: string;
    health: string;
  }>;
}

// 관계 하위 카테고리 분석
export interface RelationshipSubTab {
  summary: string;
  full_text?: string;
  strengths: string[];
  challenges: string[];
  tips: string[];
  scenarios?: string[];
}

export interface CompatibilityTab {
  summary: string;
  timeline?: Timeline;
  chemistry_tags: string[];
  good_matches: string[];
  conflict_triggers: string[];
  communication_scripts: string[];
  date_ideas: string[];
  red_flags: string[];
  full_text?: string;
  friend?: RelationshipSubTab;
  romance?: RelationshipSubTab;
  work?: RelationshipSubTab;
  family?: RelationshipSubTab;
  relationship_label?: string;
  survival_rate?: number;
  chemistry_score?: number;
}

export interface DaeunTimelineItem {
  age: string;
  ganji: string;
  theme: string;
  description: string;
}

export interface DaeunTab {
  summary: string;
  full_text: string;
  current_daeun: string;
  next_daeun_change: string;
  sections: Section[];
  timeline: DaeunTimelineItem[];
  season_title?: string;
  genre?: string;
  progress_percent?: number;
  season_ending_preview?: string;
}

export interface LuckyTab {
  lucky_color: string;
  lucky_number: string;
  lucky_direction: string;
  lucky_item: string;
  power_spot: string;
  today_overview: string;
  today_love: string;
  today_money: string;
  today_work?: string;
  today_health?: string;
  today_advice: string;
  golden_time?: string;
  dead_time?: string;
  food_recommendation?: string;
  mission_of_day?: string;
  power_hour?: string;
  talisman_phrase?: string;
}

export interface TabsData {
  love: LoveTab;
  money: MoneyTab;
  career: CareerTab;
  study: StudyTab;
  health: HealthTab;
  compatibility?: CompatibilityTab;
  life_flow: LifeFlowTab;
  daeun: DaeunTab;  // 신규
  lucky: LuckyTab;  // 업데이트
}

export interface DecisionInput {
  birth_input: BirthInput;
  question: string;
  domain: string;
  saju_context?: string;  // 사주 분석 결과 요약
  model?: ModelSelection; // optional - 백엔드에서 Gemini 사용
}

export interface DecisionResponse {
  recommendation: 'go' | 'wait' | 'no';
  summary: string;
  pros: string[];
  cons: string[];
  risk_checks: string[];
  next_actions: string[];
  advice: string; // 도사의 상세 조언
  disclaimer: string;
}

export interface MetaData {
  provider: string;
  model_id: string;
  prompt_version: string;
  latency_ms: number;
  cache_id?: string;
  reading_id?: string;
}

// 종합 분석 확장 타입
export interface SipsinItem {
  name: string;
  count: number; // float 허용 (0.5 등)
  positions: string[];
}

export interface SipsinAnalysis {
  distribution: SipsinItem[];
  dominant: string;
  weak: string;
  core_trait: string;
  strengths: string[];
  risks: string[];
}

export interface GeokgukYongsin {
  geokguk: string;
  geokguk_basis: string;
  yongsin: string;
  yongsin_basis: string;
  heesin: string;
  gisin: string;
  confidence: string;
}

export interface InteractionItem {
  type: string;
  type_detail?: string;  // 예: "자오충", "인해합"
  pillars: string;
  chars: string;
  meaning: string;
}

export interface InteractionAnalysis {
  items: InteractionItem[];
  gongmang: string[];
  gongmang_meaning: string;
}

export interface SinsalItem {
  name: string;
  icon: string;
  position: string;
  type: string;
  condition_good: string;
  condition_bad: string;
}

export interface SinsalAnalysis {
  items: SinsalItem[];
  summary: string;
}

export interface DaeunItemAdv {
  age_range: string;
  ganji: string;
  theme: string;
  is_current: boolean;
}

export interface DaeunAnalysis {
  direction: string;
  start_age: number;
  start_basis: string;
  items: DaeunItemAdv[];
}

export interface SeunAnalysis {
  year: number;
  ganji: string;
  career: string;
  money: string;
  relationship: string;
  health: string;
}

export interface ChecklistItem {
  do: string[];
  dont: string[];
}

export interface PracticalSummary {
  career: ChecklistItem;
  money: ChecklistItem;
  relationship: ChecklistItem;
  health: ChecklistItem;
}

export interface AdvancedAnalysis {
  wonguk_summary: string;
  // 명확한 데이터 필드 (프론트엔드에서 직접 사용)
  yinyang_ratio?: { yang: number; yin: number };
  strength?: string; // 신강/신약/중화
  day_master?: string; // 일간 오행
  sipsin: SipsinAnalysis;
  geokguk_yongsin: GeokgukYongsin;
  interactions: InteractionAnalysis;
  sinsal: SinsalAnalysis;
  daeun: DaeunAnalysis;
  seun: SeunAnalysis[];
  practical: PracticalSummary;
  time_uncertainty_note: string;
}

export interface ReadingResponse {
  one_liner: string;
  pillars: PillarsData;
  card: CardData;
  // Summary v2 fields (top-level, matches backend ReadingResponse)
  saju_dna?: string;
  hidden_personality?: HiddenPersonality;
  superpower?: string;
  hashtags?: string[];
  famous_same_stem?: string;
  yearly_predictions?: YearlyPrediction[];
  character?: SajuCharacter;
  tabs: TabsData;
  advanced_analysis?: AdvancedAnalysis; // 종합 탭 확장 분석
  rendered_markdown: string;
  saju_image_base64?: string;  // Base64 인코딩된 사주 이미지
  saju_image_prompt?: string;  // 이미지 생성에 사용된 프롬프트
  meta: MetaData;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: Provider;
  description: string;
  is_recommended: boolean;
}

// =============================================================================
// Flow (Year/Month/Day) Types
// =============================================================================

export interface FlowScores {
  general: number; // 0~100
  love: number;
  money: number;
  career: number;
  study: number;
  health: number;
}

export interface FlowWindow {
  start_index: number;
  end_index: number;
  start_label: string;
  end_label: string;
  avg_score: number;
}

export interface FlowHighlights {
  good_windows: FlowWindow[];
  caution_windows: FlowWindow[];
  good_summary: string;
  caution_summary: string;
}

export interface FlowMonthlyRequest {
  birth_input: BirthInput;
  year: number;
  category?: ContextTopic;
}

export interface FlowDailyRequest {
  birth_input: BirthInput;
  year: number;
  month: number;
  category?: ContextTopic;
}

export interface FlowDetailRequest {
  birth_input: BirthInput;
  date: string; // YYYY-MM-DD
  category?: ContextTopic;
}

export interface FlowAiAdviceRequest {
  birth_input: BirthInput;
  date: string; // YYYY-MM-DD
  category?: ContextTopic;
  profile_id?: string;
}

export interface FlowMonthlyPoint {
  month: number;
  label: string;
  ganji: string;
  elements: ElementStats;
  scores: FlowScores;
  badge: string;
  note: string;
}

export interface FlowMonthlyResponse {
  year: number;
  category: ContextTopic;
  points: FlowMonthlyPoint[];
  highlights: FlowHighlights;
}

export interface FlowDailyPoint {
  date: string;
  day: number;
  ganji: string;
  elements: ElementStats;
  scores: FlowScores;
  badge: string;
}

export interface FlowDailyResponse {
  year: number;
  month: number;
  category: ContextTopic;
  points: FlowDailyPoint[];
  highlights: FlowHighlights;
}

export interface FlowDetailResponse {
  date: string;
  category: ContextTopic;
  year_ganji: string;
  month_ganji: string;
  day_ganji: string;
  seed_pillar: string;
  elements: ElementStats;
  scores: FlowScores;
  summary: string;
  why: string[];
  do: string[];
  dont: string[];
  caution_note: string;
}

export interface FlowAiAdviceResponse {
  date: string;
  category: ContextTopic;
  headline: string;
  summary: string;
  good_points: string[];
  bad_points: string[];
  do: string[];
  dont: string[];
  detailed: string;
  disclaimer: string;
}

// =============================================================================
// Streak & Daily Mission Types
// =============================================================================

export interface StreakStatus {
  current_streak: number;
  longest_streak: number;
  total_check_ins: number;
  last_check_in_date: string | null;
  checked_in_today: boolean;
  streak_bonus: number;
  // Enhanced streak fields
  badge_tier?: 'bronze' | 'silver' | 'gold' | 'diamond' | null;
  title?: string | null;
  next_milestone?: number | null;
  next_milestone_reward?: number | null;
  next_milestone_badge?: string | null;
}

export interface CheckInResponse {
  success: boolean;
  message: string;
  coins_earned: number;
  streak: StreakStatus;
}

// =============================================================================
// Past Timeline Types
// =============================================================================

export type InteractionType = '충' | '형' | '파' | '해';

export interface PastTimelineItem {
  year: number;
  year_ganji: string;
  interaction_type: InteractionType;
  type_detail: string;
  severity: '강함' | '보통' | '약함';
  description: string;
}

export interface PastTimelineResponse {
  profile_id: string;
  conflicts: PastTimelineItem[];
  total_count: number;
  earliest_year: number | null;
  latest_year: number | null;
}

export interface PastTimelineRequest {
  profile_id: string;
}

// =============================================================================
// VS Battle Types
// =============================================================================

export interface VsBattleJoinRequest {
  battle_code: string;
  birth_year: number;
  birth_month: number;
  birth_day: number;
  birth_hour: number;
  gender: 'male' | 'female';
  calendar_type: 'solar' | 'lunar';
}

export interface VsBattleParticipant {
  name: string;
  score: number;
  badge_tier?: string;
  is_winner: boolean;
}

export interface VsBattleResult {
  battle_code: string;
  host: VsBattleParticipant;
  challenger: VsBattleParticipant;
  score_diff: number;
  message: string;
  created_at: string;
}

export interface VsBattleJoinResponse {
  success: boolean;
  result: VsBattleResult;
  already_used?: boolean;
}

export interface DailyMission {
  id: string;
  mission_key: string;
  title: string;
  description: string | null;
  icon: string | null;
  reward_coins: number;
  action_type: string;
  action_count: number;
  is_completed: boolean;
  progress: number;
}

export interface MissionListResponse {
  missions: DailyMission[];
  total_reward: number;
  completed_count: number;
}

export interface MissionCompleteResponse {
  success: boolean;
  message: string;
  coins_earned: number;
  new_balance: number;
}

// =============================================================================
// Matching Service Types
// =============================================================================

export interface MatchingProfile {
  id: string;
  user_id: string;
  saju_profile_id: string;
  display_name: string;
  bio?: string;
  birth_year: number;
  gender: string;
  preference_type: 'similar' | 'complementary' | 'balanced';
  age_range_min: number;
  age_range_max: number;
  preferred_genders: string[]; // JSON array in DB
  saju_visibility: 'hidden' | 'basic' | 'detailed';
  is_active: boolean;
  yongsin?: string;
  day_master?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateMatchingProfileRequest {
  saju_profile_id: string;
  display_name: string;
  bio?: string;
  preference_type: 'similar' | 'complementary' | 'balanced';
  age_range_min: number;
  age_range_max: number;
  preferred_genders: string[];
  saju_visibility: 'hidden' | 'basic' | 'detailed';
}

export interface UpdateMatchingProfileRequest {
  display_name?: string;
  bio?: string;
  preference_type?: 'similar' | 'complementary' | 'balanced';
  age_range_min?: number;
  age_range_max?: number;
  preferred_genders?: string[];
  saju_visibility?: 'hidden' | 'basic' | 'detailed';
  is_active?: boolean;
}


// --- Quick Compatibility (Viral Share Flow) ---

export interface QuickCompatibilityRequest {
  share_code: string;
  user_b: BirthInput;
}

export interface UserBSummary {
  one_liner: string;
  character_name: string;
  character_icon_path: string;
  element: string;
  pillars_summary: string;
}

export interface QuickCompatibilityData {
  score: number;
  summary: string;
  keyword: string;
  advice: string;
}

export interface QuickCompatibilityResponse {
  user_b_summary: UserBSummary;
  compatibility: QuickCompatibilityData;
}

// =============================================================================
// Image Generation Types
// =============================================================================

export type ImageStyleKey = 'ink_wash' | 'anime' | 'watercolor' | 'fantasy' | 'modern' | 'pixel_art';

export interface ImageStyleOption {
  key: ImageStyleKey;
  label: string;
  iconPath: string;
  description: string;
}

export const IMAGE_STYLES: ImageStyleOption[] = [
  { key: 'ink_wash', label: '수묵화', iconPath: '/icons/emoji-replacements/styles/ink_wash.png', description: '전통 동양화 느낌' },
  { key: 'anime', label: '애니메', iconPath: '/icons/emoji-replacements/styles/anime.png', description: '애니메이션 스타일' },
  { key: 'watercolor', label: '수채화', iconPath: '/icons/emoji-replacements/styles/watercolor.png', description: '부드러운 수채 느낌' },
  { key: 'fantasy', label: '판타지', iconPath: '/icons/emoji-replacements/styles/fantasy.png', description: '판타지 아트 스타일' },
  { key: 'modern', label: '현대적', iconPath: '/icons/emoji-replacements/styles/modern.png', description: '모던 디지털 아트' },
  { key: 'pixel_art', label: '픽셀아트', iconPath: '/icons/emoji-replacements/styles/pixel_art.png', description: '레트로 픽셀 감성' },
];

export interface GenerateImageRequest {
  one_liner: string;
  character_summary: string;
  tags: string[];
  gender: string;
  style: ImageStyleKey;
}

export interface GenerateImageResponse {
  success: boolean;
  image_base64: string | null;
  image_prompt: string | null;
  transaction_id: string | null;
  balance: number;
}
export interface ChatSessionCreateRequest {
  birth_input: BirthInput;
  domain: string;
  persona?: string;
  saju_context?: Record<string, unknown>;
  max_turns?: number;
}

export interface ChatSessionCreateResponse {
  session_id: string;
  remaining_turns: number;
}

export interface ChatSessionResponse {
  id: string;
  user_id: string;
  birth_key: string;
  domain: string;
  persona: string;
  status: 'active' | 'completed';
  max_turns: number;
  current_turn: number;
  remaining_turns: number;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageResponse {
  id: string;
  session_id: string;
  turn: number;
  role: 'user' | 'assistant' | 'system';
  content: DecisionResponse | string;
  response_format: 'decision' | 'freeform' | 'system';
  tokens_used: number;
  cost_coins: number;
  created_at: string;
}

export interface ChatHistoryResponse {
  session: ChatSessionResponse;
  messages: ChatMessageResponse[];
}

export interface ChatMessageCreate {
  role?: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatSendResponse {
  message: ChatMessageResponse;
  session: ChatSessionResponse;
  coins_spent: number;
}
