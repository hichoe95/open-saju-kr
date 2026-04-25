import { useEffect, useRef } from 'react';
import { useAnalytics } from '@/hooks/useAnalytics';
import { TabKey } from '../types';

export function useTabTracking(readingId: string | undefined, activeTab: TabKey) {
    const { trackTab } = useAnalytics();
    const trackedTabsRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!readingId) return;
        const tabKey = `${readingId}_${activeTab}`;
        if (trackedTabsRef.current.has(tabKey)) return;
        trackedTabsRef.current.add(tabKey);
        trackTab(readingId, activeTab);
    }, [activeTab, readingId, trackTab]);
}
