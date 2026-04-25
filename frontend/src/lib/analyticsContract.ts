import type {
  FeatureName,
  ShareMethod,
  ShareType,
  TabName,
} from '@/lib/analytics';

export const SHARE_TYPES = ['saju', 'compatibility'] as const;
export const SHARE_METHODS = ['link', 'kakao', 'image', 'clipboard'] as const;
export const FEATURE_NAMES = [
  'reading_start',
  'reading_complete',
  'compatibility_start',
  'compatibility_complete',
  'flow_calendar_view',
  'flow_ai_advice',
  'decision_qa',
  'share_modal_open',
  'share_created',
  'profile_save',
  'check_in',
] as const;
export const TAB_NAMES = [
  'overview',
  'personality',
  'career',
  'wealth',
  'relationship',
  'health',
  'yearly',
  'monthly',
  'advice',
  'advanced',
  'decision',
  'summary',
  'lucky',
  'love',
  'money',
  'study',
  'compatibility',
  'life',
  'daeun',
] as const;

type Assert<T extends true> = T;
type IsExact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

export type AnalyticsContractShareTypeAssertion = Assert<
  IsExact<ShareType, (typeof SHARE_TYPES)[number]>
>;
export type AnalyticsContractShareMethodAssertion = Assert<
  IsExact<ShareMethod, (typeof SHARE_METHODS)[number]>
>;
export type AnalyticsContractFeatureNameAssertion = Assert<
  IsExact<FeatureName, (typeof FEATURE_NAMES)[number]>
>;
export type AnalyticsContractTabNameAssertion = Assert<
  IsExact<TabName, (typeof TAB_NAMES)[number]>
>;

export type AnalyticsContract = {
  shareTypes: typeof SHARE_TYPES;
  shareMethods: typeof SHARE_METHODS;
  featureNames: typeof FEATURE_NAMES;
  tabNames: typeof TAB_NAMES;
};
