/**
 * useAnalytics Hook - React 컴포넌트에서 쉽게 사용하기 위한 Hook
 */
'use client';

import { useCallback, useRef, useEffect } from 'react';
import {
    trackEvent,
    trackShareCreated,
    trackShareViewed,
    trackShareConverted,
    trackTabViewed,
    trackFeatureUsed,
    trackPageView,
    trackButtonClick,
    getSessionId,
    type ShareType,
    type ShareMethod,
    type FeatureName,
    type TabName,
} from '@/lib/analytics';

interface UseAnalyticsOptions {
    /** 자동 페이지뷰 추적 (기본: true) */
    autoTrackPageView?: boolean;
    /** 페이지 이름 (autoTrackPageView 시 사용) */
    pageName?: string;
}

interface UseAnalyticsReturn {
    /** 세션 ID 조회 함수 */
    getSessionId: () => string;
    /** 일반 이벤트 추적 */
    trackEvent: (eventType: string, eventData?: Record<string, unknown>) => Promise<boolean>;
    /** 공유 생성 추적 */
    trackShare: (shareId: string, shareType: ShareType, cardTheme?: string, shareMethod?: ShareMethod) => Promise<boolean>;
    /** 공유 조회 추적 */
    trackShareView: (shareId: string) => Promise<boolean>;
    /** 공유 전환 추적 */
    trackShareConvert: (shareId: string) => Promise<boolean>;
    /** 탭 조회 추적 */
    trackTab: (readingId: string, tabName: TabName) => Promise<boolean>;
    /** 기능 사용 추적 */
    trackFeature: (featureName: FeatureName | string, metadata?: Record<string, unknown>) => Promise<boolean>;
    /** 버튼 클릭 추적 */
    trackClick: (buttonName: string, metadata?: Record<string, unknown>) => Promise<boolean>;
}

export function useAnalytics(options: UseAnalyticsOptions = {}): UseAnalyticsReturn {
    const { autoTrackPageView = false, pageName } = options;
    const sessionId = useRef<string>('');
    const hasTrackedPageView = useRef(false);

    // 클라이언트 사이드에서만 세션 ID 초기화
    useEffect(() => {
        sessionId.current = getSessionId();
    }, []);

    // 자동 페이지뷰 추적
    useEffect(() => {
        if (autoTrackPageView && pageName && !hasTrackedPageView.current) {
            hasTrackedPageView.current = true;
            trackPageView(pageName);
        }
    }, [autoTrackPageView, pageName]);

    const wrappedTrackEvent = useCallback(
        (eventType: string, eventData?: Record<string, unknown>) => {
            return trackEvent(eventType, eventData, sessionId.current);
        },
        []
    );

    const wrappedTrackShare = useCallback(
        (shareId: string, shareType: ShareType, cardTheme?: string, shareMethod?: ShareMethod) => {
            return trackShareCreated(shareId, shareType, cardTheme, shareMethod);
        },
        []
    );

    const wrappedTrackShareView = useCallback(
        (shareId: string) => {
            return trackShareViewed(shareId, sessionId.current);
        },
        []
    );

    const wrappedTrackShareConvert = useCallback(
        (shareId: string) => {
            return trackShareConverted(shareId);
        },
        []
    );

    const wrappedTrackTab = useCallback(
        (readingId: string, tabName: TabName) => {
            return trackTabViewed(readingId, tabName);
        },
        []
    );

    const wrappedTrackFeature = useCallback(
        (featureName: FeatureName | string, metadata?: Record<string, unknown>) => {
            return trackFeatureUsed(featureName, metadata);
        },
        []
    );

    const wrappedTrackClick = useCallback(
        (buttonName: string, metadata?: Record<string, unknown>) => {
            return trackButtonClick(buttonName, metadata);
        },
        []
    );

    const getSessionIdFn = useCallback(() => sessionId.current, []);

    return {
        getSessionId: getSessionIdFn,
        trackEvent: wrappedTrackEvent,
        trackShare: wrappedTrackShare,
        trackShareView: wrappedTrackShareView,
        trackShareConvert: wrappedTrackShareConvert,
        trackTab: wrappedTrackTab,
        trackFeature: wrappedTrackFeature,
        trackClick: wrappedTrackClick,
    };
}

export default useAnalytics;

// Re-export types for convenience
export type { ShareType, ShareMethod, FeatureName, TabName };
