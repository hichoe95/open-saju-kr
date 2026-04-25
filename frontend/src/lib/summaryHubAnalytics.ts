import { getSessionId, trackEvent } from '@/lib/analytics';
import type {
  ResumeContractEvent,
  ResumeDestinationState,
  SummaryHubDetailTab,
  SummaryHubResumeToken,
} from '@/lib/summaryHubResume';

export const SUMMARY_HUB_CARD_EXPOSED_EVENT = 'summary_hub_card_exposed' as const;
export const SUMMARY_HUB_DETAIL_CTA_CLICKED_EVENT = 'summary_hub_detail_cta_clicked' as const;
export const SUMMARY_HUB_RESUME_OUTCOME_EVENT = 'summary_hub_resume_outcome' as const;

const SUMMARY_HUB_RESUME_OUTCOME_TRACKED_PREFIX = 'summary-hub-resume-outcome:v1' as const;

export type SummaryHubCtaSurface = 'summary_hub_card' | 'summary_tab_cta';
export type SummaryHubResumeOutcome = Exclude<ResumeContractEvent, 'created' | 'refresh'> | 'already_entitled_reopen';

function trackSummaryHubEvent(eventType: string, eventData: Record<string, unknown>): Promise<boolean> {
  const sessionId = getSessionId();
  if (!sessionId) {
    return Promise.resolve(false);
  }

  return trackEvent(eventType, eventData, sessionId);
}

export function trackSummaryHubCardExposed(input: {
  readingId?: string;
  domain: SummaryHubDetailTab;
  priority: number;
  hasDetailEntitlement: boolean;
}): Promise<boolean> {
  return trackSummaryHubEvent(SUMMARY_HUB_CARD_EXPOSED_EVENT, {
    reading_id: input.readingId,
    surface: 'summary_hub',
    domain: input.domain,
    priority: input.priority,
    has_detail_entitlement: input.hasDetailEntitlement,
  });
}

export function trackSummaryHubDetailCtaClicked(input: {
  readingId?: string;
  surface: SummaryHubCtaSurface;
  domain: SummaryHubDetailTab;
  isAuthenticated: boolean;
  hasDetailEntitlement: boolean;
}): Promise<boolean> {
  return trackSummaryHubEvent(SUMMARY_HUB_DETAIL_CTA_CLICKED_EVENT, {
    reading_id: input.readingId,
    cta_origin_surface: input.surface,
    cta_origin_domain: input.domain,
    target_tab: input.domain,
    is_authenticated: input.isAuthenticated,
    has_detail_entitlement: input.hasDetailEntitlement,
  });
}

export function buildSummaryHubResumeOutcomeTrackingKey(token: SummaryHubResumeToken): string {
  return `${SUMMARY_HUB_RESUME_OUTCOME_TRACKED_PREFIX}:${token.readingId}:${token.checkpoint.lastEvent}:${token.checkpoint.updatedAt}`;
}

export function hasTrackedSummaryHubResumeOutcome(trackingKey: string): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.sessionStorage.getItem(trackingKey) === 'true';
}

export function markSummaryHubResumeOutcomeTracked(trackingKey: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(trackingKey, 'true');
}

export function trackSummaryHubResumeOutcome(input: {
  token: SummaryHubResumeToken;
  destination: ResumeDestinationState;
  outcome: SummaryHubResumeOutcome;
}): Promise<boolean> {
  return trackSummaryHubEvent(SUMMARY_HUB_RESUME_OUTCOME_EVENT, {
    reading_id: input.token.readingId,
    resume_outcome: input.outcome,
    cta_origin_surface: input.token.ctaOrigin.surface,
    cta_origin_domain: input.token.ctaOrigin.tab,
    target_tab: input.token.entitlementTarget.domainTab,
    destination_tab: input.destination.activeTab,
    destination_focus: input.destination.focus,
    detail_unlocked: input.destination.detailUnlocked,
    checkpoint_updated_at: input.token.checkpoint.updatedAt,
  });
}
