/**
 * Analytics API Client - 이벤트 추적 함수들
 */

import { API_BASE_URL } from '@/lib/apiBase';
import { captureAttribution, getPersistedAttribution } from '@/lib/attribution';
import { buildClientAuthHeaders } from '@/utils/authToken';

function getAuthHeaders(): Record<string, string> {
    if (typeof window === 'undefined') return {};
    return buildClientAuthHeaders();
}

const authFetch = (url: string, init: RequestInit = {}) => fetch(url, {
    ...init,
    credentials: 'include',
});

function buildAttributedEventData(eventData?: Record<string, unknown>): Record<string, unknown> {
    return {
        ...getPersistedAttribution(),
        ...(eventData ?? {}),
    };
}

function buildAttributedSearchParams(params: URLSearchParams): URLSearchParams {
    const attributedParams = new URLSearchParams(params);

    Object.entries(getPersistedAttribution()).forEach(([key, value]) => {
        if (value) {
            attributedParams.set(key, value);
        }
    });

    return attributedParams;
}

// =============================================================================
// Event Types
// =============================================================================

export type ShareType = 'saju' | 'compatibility';
export type ShareMethod = 'link' | 'kakao' | 'image' | 'clipboard';
export type FeatureName = 
    | 'reading_start' 
    | 'reading_complete' 
    | 'compatibility_start'
    | 'compatibility_complete'
    | 'flow_calendar_view'
    | 'flow_ai_advice'
    | 'decision_qa'
    | 'share_modal_open'
    | 'share_created'
    | 'profile_save'
    | 'check_in';

export type TabName = 
    | 'overview' 
    | 'personality' 
    | 'career' 
    | 'wealth' 
    | 'relationship' 
    | 'health'
    | 'yearly'
    | 'monthly'
    | 'advice'
    | 'advanced'
    | 'decision'
    | 'summary'
    | 'lucky'
    | 'love'
    | 'money'
    | 'study'
    | 'compatibility'
    | 'life'
    | 'daeun';

// =============================================================================
// Track Functions
// =============================================================================

/**
 * 일반 이벤트 추적
 */
export async function trackEvent(
    eventType: string,
    eventData?: Record<string, unknown>,
    sessionId?: string
): Promise<boolean> {
    try {
        const attributedEventData = buildAttributedEventData(eventData);
        const response = await authFetch(`${API_BASE_URL}/api/analytics/track/event`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders(),
            },
            body: JSON.stringify({
                event_type: eventType,
                event_data: attributedEventData,
                session_id: sessionId,
            }),
        });
        return response.ok;
    } catch (error) {
        console.error('[Analytics] trackEvent failed:', error);
        return false;
    }
}

/**
 * 공유 생성 추적 (로그인 필요)
 */
export async function trackShareCreated(
    shareId: string,
    shareType: ShareType,
    cardTheme?: string,
    shareMethod?: ShareMethod
): Promise<boolean> {
    try {
        const attribution = getPersistedAttribution();
        const response = await authFetch(`${API_BASE_URL}/api/analytics/track/share`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders(),
            },
            body: JSON.stringify({
                share_id: shareId,
                share_type: shareType,
                card_theme: cardTheme,
                share_method: shareMethod,
                ...attribution,
            }),
        });
        return response.ok;
    } catch (error) {
        console.error('[Analytics] trackShareCreated failed:', error);
        return false;
    }
}

/**
 * 공유 조회 추적 (인증 불필요 - 수신자가 봄)
 */
export async function trackShareViewed(
    shareId: string,
    sessionId?: string
): Promise<boolean> {
    try {
        const params = buildAttributedSearchParams(new URLSearchParams({ share_id: shareId }));
        if (sessionId) params.append('session_id', sessionId);

        const response = await authFetch(
            `${API_BASE_URL}/api/analytics/track/share-viewed?${params}`,
            { method: 'POST' }
        );
        return response.ok;
    } catch (error) {
        console.error('[Analytics] trackShareViewed failed:', error);
        return false;
    }
}

/**
 * 공유 → 가입 전환 추적
 */
export async function trackShareConverted(shareId: string): Promise<boolean> {
    try {
        const params = buildAttributedSearchParams(new URLSearchParams({ share_id: shareId }));
        const response = await authFetch(
            `${API_BASE_URL}/api/analytics/track/share-converted?${params}`,
            {
                method: 'POST',
                headers: getAuthHeaders(),
            }
        );
        return response.ok;
    } catch (error) {
        console.error('[Analytics] trackShareConverted failed:', error);
        return false;
    }
}

/**
 * 탭 조회 추적
 */
export async function trackTabViewed(
    readingId: string,
    tabName: TabName
): Promise<boolean> {
    try {
        const attribution = getPersistedAttribution();
        const response = await authFetch(`${API_BASE_URL}/api/analytics/track/tab`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders(),
            },
            body: JSON.stringify({
                reading_id: readingId,
                tab_name: tabName,
                ...attribution,
            }),
        });
        return response.ok;
    } catch (error) {
        console.error('[Analytics] trackTabViewed failed:', error);
        return false;
    }
}

/**
 * 기능 사용 추적
 */
export async function trackFeatureUsed(
    featureName: FeatureName | string,
    metadata?: Record<string, unknown>
): Promise<boolean> {
    try {
        const response = await authFetch(`${API_BASE_URL}/api/analytics/track/feature`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders(),
            },
            body: JSON.stringify({
                feature_name: featureName,
                metadata: buildAttributedEventData(metadata),
            }),
        });
        return response.ok;
    } catch (error) {
        console.error('[Analytics] trackFeatureUsed failed:', error);
        return false;
    }
}

// =============================================================================
// Session ID 관리
// =============================================================================

const SESSION_KEY = 'analytics_session_id';

/**
 * 세션 ID 가져오기 (없으면 생성)
 */
export function getSessionId(): string {
    if (typeof window === 'undefined') return '';

    captureAttribution();
    
    let sessionId = sessionStorage.getItem(SESSION_KEY);
    if (!sessionId) {
        sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        sessionStorage.setItem(SESSION_KEY, sessionId);
    }
    return sessionId;
}

// =============================================================================
// 편의 함수들
// =============================================================================

/**
 * 페이지 뷰 추적
 */
export async function trackPageView(pageName: string, metadata?: Record<string, unknown>): Promise<boolean> {
    return trackEvent('page_view', {
        page: pageName,
        url: typeof window !== 'undefined' ? window.location.href : '',
        referrer: typeof document !== 'undefined' ? document.referrer : '',
        ...metadata,
    }, getSessionId());
}

/**
 * 버튼 클릭 추적
 */
export async function trackButtonClick(buttonName: string, metadata?: Record<string, unknown>): Promise<boolean> {
    return trackEvent('button_click', {
        button: buttonName,
        ...metadata,
    }, getSessionId());
}

export async function trackPushPromptShown(trigger: string): Promise<boolean> {
    return trackEvent('push_prompt_shown', {
        trigger,
        reminder_category: 'daily',
    }, getSessionId());
}

export async function trackPushPromptAccepted(trigger: string): Promise<boolean> {
    return trackEvent('push_prompt_accepted', {
        trigger,
        reminder_category: 'daily',
    }, getSessionId());
}

export async function trackPushPromptDismissed(trigger: string): Promise<boolean> {
    return trackEvent('push_prompt_dismissed', {
        trigger,
        reminder_category: 'daily',
    }, getSessionId());
}

export async function trackReferralCTAShown(surface: string): Promise<boolean> {
    return trackEvent('referral_cta_shown', {
        surface,
    }, getSessionId());
}

export async function trackReferralCTAClicked(surface: string): Promise<boolean> {
    return trackEvent('referral_cta_clicked', {
        surface,
    }, getSessionId());
}

export async function trackSeasonalBannerShown(campaignId: string): Promise<boolean> {
    return trackEvent('seasonal_banner_shown', {
        campaign_id: campaignId,
    }, getSessionId());
}

export async function trackSeasonalBannerClicked(campaignId: string): Promise<boolean> {
    return trackEvent('seasonal_banner_clicked', {
        campaign_id: campaignId,
    }, getSessionId());
}
