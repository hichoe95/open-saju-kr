'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, X } from 'lucide-react';
import styles from './PushOptInPrompt.module.css';
import { ToastContainer, useToast } from './Toast';
import { useAuth } from '@/contexts/AuthContext';
import {
    trackPushPromptAccepted,
    trackPushPromptDismissed,
    trackPushPromptShown,
} from '@/lib/analytics';
import { subscribeToPush } from '@/lib/pwa';

interface PushOptInPromptProps {
    trigger: 'daily_fortune' | 'mission_complete';
}

const DISMISS_STORAGE_KEY = 'push_prompt_dismissed_at';
const DISMISS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const SHOW_DELAY_MS = 2000;
const SUCCESS_MESSAGE = '알림을 받을 준비가 되었어요! 🔔';

export default function PushOptInPrompt({ trigger }: PushOptInPromptProps) {
    const { isAuthenticated, token } = useAuth();
    const { toasts, showToast, removeToast } = useToast();
    const [isVisible, setIsVisible] = useState(false);
    const [isSubscribing, setIsSubscribing] = useState(false);

    const isIOSInBrowser = useMemo(() => {
        if (typeof window === 'undefined') return false;

        const isIOSDevice = /iPad|iPhone|iPod/.test(window.navigator.userAgent);
        if (!isIOSDevice) return false;

        const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches
            || ('standalone' in window.navigator
                && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));

        return !isStandaloneMode;
    }, []);

    const wasDismissedRecently = useCallback(() => {
        if (typeof window === 'undefined') return false;

        const dismissedAt = window.localStorage.getItem(DISMISS_STORAGE_KEY);
        if (!dismissedAt) return false;

        const dismissedTime = Number(dismissedAt);
        if (Number.isNaN(dismissedTime)) return false;

        return Date.now() - dismissedTime < DISMISS_WINDOW_MS;
    }, []);

    const rememberDismissal = useCallback(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(DISMISS_STORAGE_KEY, Date.now().toString());
    }, []);

    const handleDismiss = useCallback(() => {
        rememberDismissal();
        setIsVisible(false);
        void trackPushPromptDismissed(trigger);
    }, [rememberDismissal, trigger]);

    const handleAccept = useCallback(async () => {
        if (isSubscribing) return;

        setIsSubscribing(true);
        void trackPushPromptAccepted(trigger);

        try {
            const subscription = await subscribeToPush(token || undefined);

            if (subscription) {
                setIsVisible(false);
                showToast(SUCCESS_MESSAGE, 'success');
                return;
            }

            if (typeof window !== 'undefined' && window.Notification?.permission === 'denied') {
                setIsVisible(false);
            }
        } catch (error) {
            console.error('[PushOptInPrompt] subscribe failed:', error);
        } finally {
            setIsSubscribing(false);
        }
    }, [isSubscribing, showToast, token, trigger]);

    useEffect(() => {
        if (!isAuthenticated || typeof window === 'undefined') return;

        let isCancelled = false;
        let showTimer: number | null = null;

        const checkEligibility = async () => {
            if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
                return;
            }

            if (window.Notification.permission === 'denied' || wasDismissedRecently() || isIOSInBrowser) {
                return;
            }

            try {
                const existingRegistration = await navigator.serviceWorker.getRegistration();
                if (existingRegistration) {
                    const readyRegistration = await navigator.serviceWorker.ready;
                    const existingSubscription = await readyRegistration.pushManager.getSubscription();
                    if (existingSubscription || isCancelled) {
                        return;
                    }
                }

                showTimer = window.setTimeout(() => {
                    if (isCancelled) return;
                    setIsVisible(true);
                    void trackPushPromptShown(trigger);
                }, SHOW_DELAY_MS);
            } catch (error) {
                console.error('[PushOptInPrompt] eligibility check failed:', error);
            }
        };

        void checkEligibility();

        return () => {
            isCancelled = true;
            if (showTimer) {
                window.clearTimeout(showTimer);
            }
        };
    }, [isAuthenticated, isIOSInBrowser, trigger, wasDismissedRecently]);

    if (!isVisible && toasts.length === 0) {
        return null;
    }

    return (
        <>
            <ToastContainer toasts={toasts} onRemove={removeToast} />
            {isVisible && (
                <div className={styles.wrapper} aria-live="polite">
                    <div className={styles.banner}>
                        <div className={styles.iconWrap}>
                            <Bell size={18} />
                        </div>
                        <div className={styles.content}>
                            <p className={styles.title}>오늘의 운세를 매일 받아보세요</p>
                            <p className={styles.body}>매일 아침, 오늘의 운세 알림을 보내드릴게요</p>
                        </div>
                        <div className={styles.actions}>
                            <button
                                type="button"
                                className={styles.acceptButton}
                                onClick={handleAccept}
                                disabled={isSubscribing}
                            >
                                {isSubscribing ? '준비 중...' : '알림 받기'}
                            </button>
                            <button
                                type="button"
                                className={styles.dismissButton}
                                onClick={handleDismiss}
                                aria-label="알림 제안 닫기"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
