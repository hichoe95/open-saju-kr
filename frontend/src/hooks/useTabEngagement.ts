'use client';

import { useCallback, useEffect, useRef } from 'react';
import { API_BASE_URL } from '@/lib/apiBase';
import { trackTabEngagement, type TabEngagementPayload } from '@/lib/api';
import { AUTH_MODE } from '@/utils/authToken';

interface UseTabEngagementOptions {
    readingId?: string;
    enabled?: boolean;
}

const TAB_ENGAGEMENT_ENDPOINT = `${API_BASE_URL}/api/analytics/track/tab-engagement`;
const FLUSH_DEBOUNCE_MS = 2000;
export function useTabEngagement(
    currentTab: string,
    options: UseTabEngagementOptions = {}
) {
    const { readingId, enabled = true } = options;

    const startTimeRef = useRef<number>(0);
    const prevTabRef = useRef<string>(currentTab);
    const isVisibleRef = useRef<boolean>(true);
    const pausedAtRef = useRef<number | null>(null);
    const readingIdRef = useRef<string | undefined>(readingId);
    const enabledRef = useRef<boolean>(enabled);
    const queueRef = useRef<TabEngagementPayload[]>([]);
    const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isFlushingRef = useRef<boolean>(false);
    const hasExitFlushedRef = useRef<boolean>(false);

    const clearFlushTimer = useCallback(() => {
        if (flushTimerRef.current) {
            clearTimeout(flushTimerRef.current);
            flushTimerRef.current = null;
        }
    }, []);

    const flushQueue = useCallback(async function flushPendingQueue(keepalive = false) {
        if (!enabledRef.current || queueRef.current.length === 0) {
            return;
        }

        if (isFlushingRef.current) {
            if (!flushTimerRef.current) {
                flushTimerRef.current = setTimeout(() => {
                    flushTimerRef.current = null;
                    void flushPendingQueue(keepalive);
                }, FLUSH_DEBOUNCE_MS);
            }
            return;
        }

        isFlushingRef.current = true;
        const pendingPayloads = [...queueRef.current];
        queueRef.current = [];

        const failedPayloads: TabEngagementPayload[] = [];
        for (const payload of pendingPayloads) {
            const result = await trackTabEngagement(payload, undefined, { keepalive });
            if (!result.success && result.retriable) {
                failedPayloads.push(payload);
            }
        }

        if (failedPayloads.length > 0) {
            queueRef.current.unshift(...failedPayloads);
        }

        isFlushingRef.current = false;

        if (queueRef.current.length > 0 && !flushTimerRef.current) {
            flushTimerRef.current = setTimeout(() => {
                flushTimerRef.current = null;
                void flushPendingQueue();
            }, FLUSH_DEBOUNCE_MS);
        }
    }, []);

    const scheduleFlush = useCallback(() => {
        if (!enabledRef.current || flushTimerRef.current) {
            return;
        }

        flushTimerRef.current = setTimeout(() => {
            flushTimerRef.current = null;
            void flushQueue();
        }, FLUSH_DEBOUNCE_MS);
    }, [flushQueue]);

    const buildPayload = useCallback(
        (tabName: string, dwellMs: number, sourceTab?: string): TabEngagementPayload | null => {
            if (!enabledRef.current || !tabName || !Number.isFinite(dwellMs) || dwellMs <= 0) {
                return null;
            }

            return {
                tab_name: tabName,
                dwell_ms: Math.round(dwellMs),
                reading_id: readingIdRef.current,
                source_tab: sourceTab,
            };
        },
        []
    );

    const captureCurrentPayload = useCallback(
        (sourceTab?: string): TabEngagementPayload | null => {
            const endTime = !isVisibleRef.current && pausedAtRef.current !== null
                ? pausedAtRef.current
                : Date.now();
            const dwellMs = Math.max(0, endTime - startTimeRef.current);
            return buildPayload(prevTabRef.current, dwellMs, sourceTab);
        },
        [buildPayload]
    );

    const queuePayload = useCallback(
        (payload: TabEngagementPayload | null) => {
            if (!payload || !enabledRef.current) {
                return;
            }

            queueRef.current.push(payload);
            scheduleFlush();
        },
        [scheduleFlush]
    );

    const flushOnPageExit = useCallback(() => {
        if (!enabledRef.current || hasExitFlushedRef.current) {
            return;
        }

        hasExitFlushedRef.current = true;
        clearFlushTimer();

        const pendingPayloads = [...queueRef.current];
        queueRef.current = [];

        const currentPayload = captureCurrentPayload();
        if (currentPayload) {
            pendingPayloads.push(currentPayload);
        }

        pendingPayloads.forEach(payload => {
            const canUseBeacon =
                AUTH_MODE === 'cookie'
                && typeof navigator !== 'undefined'
                && typeof navigator.sendBeacon === 'function';

            if (canUseBeacon) {
                const beaconBody = new Blob([JSON.stringify(payload)], {
                    type: 'application/json',
                });
                const beaconSent = navigator.sendBeacon(TAB_ENGAGEMENT_ENDPOINT, beaconBody);
                if (beaconSent) {
                    return;
                }
            }

            void trackTabEngagement(payload, undefined, { keepalive: true });
        });
    }, [captureCurrentPayload, clearFlushTimer]);

    useEffect(() => {
        enabledRef.current = enabled;

        if (!enabled) {
            clearFlushTimer();
            queueRef.current = [];
            isFlushingRef.current = false;
            pausedAtRef.current = null;
        }
    }, [enabled, clearFlushTimer]);

    useEffect(() => {
        startTimeRef.current = Date.now();
        if (typeof document !== 'undefined') {
            const isVisible = document.visibilityState === 'visible';
            isVisibleRef.current = isVisible;
            pausedAtRef.current = isVisible ? null : Date.now();
        }

        hasExitFlushedRef.current = false;
    }, []);

    useEffect(() => {
        if (!enabledRef.current || currentTab === prevTabRef.current) {
            return;
        }

        queuePayload(captureCurrentPayload(currentTab));

        const now = Date.now();
        prevTabRef.current = currentTab;
        startTimeRef.current = now;
        pausedAtRef.current = isVisibleRef.current ? null : now;
    }, [currentTab, captureCurrentPayload, queuePayload]);

    useEffect(() => {
        if (!enabledRef.current || readingIdRef.current === readingId) {
            readingIdRef.current = readingId;
            return;
        }

        queuePayload(captureCurrentPayload());

        readingIdRef.current = readingId;
        const now = Date.now();
        startTimeRef.current = now;
        pausedAtRef.current = isVisibleRef.current ? null : now;
    }, [readingId, captureCurrentPayload, queuePayload]);

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (!enabledRef.current || typeof document === 'undefined') {
                return;
            }

            const now = Date.now();
            if (document.visibilityState === 'hidden') {
                if (isVisibleRef.current) {
                    isVisibleRef.current = false;
                    pausedAtRef.current = now;
                }
                return;
            }

            if (!isVisibleRef.current) {
                const pausedAt = pausedAtRef.current;
                if (pausedAt !== null) {
                    startTimeRef.current += now - pausedAt;
                }
                pausedAtRef.current = null;
                isVisibleRef.current = true;
            }

            hasExitFlushedRef.current = false;
        };

        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', handleVisibilityChange);
        }

        return () => {
            if (typeof document !== 'undefined') {
                document.removeEventListener('visibilitychange', handleVisibilityChange);
            }
        };
    }, []);

    useEffect(() => {
        const handlePageExit = () => {
            flushOnPageExit();
        };

        const handlePageShow = () => {
            hasExitFlushedRef.current = false;
        };

        if (typeof window !== 'undefined') {
            window.addEventListener('pagehide', handlePageExit);
            window.addEventListener('beforeunload', handlePageExit);
            window.addEventListener('pageshow', handlePageShow);
        }

        return () => {
            if (typeof window !== 'undefined') {
                window.removeEventListener('pagehide', handlePageExit);
                window.removeEventListener('beforeunload', handlePageExit);
                window.removeEventListener('pageshow', handlePageShow);
            }

            if (enabledRef.current) {
                const currentPayload = captureCurrentPayload();
                if (currentPayload) {
                    queueRef.current.push(currentPayload);
                }
                clearFlushTimer();
                void flushQueue(true);
            }
        };
    }, [captureCurrentPayload, clearFlushTimer, flushOnPageExit, flushQueue]);
}
