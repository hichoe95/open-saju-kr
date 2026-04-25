'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Gift, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { trackReferralCTAClicked, trackReferralCTAShown } from '@/lib/analytics';
import { createReferralLink, getReferralStatus, type ReferralStatusResponse } from '@/lib/api';
import { initKakao, shareWithFallback } from '@/lib/kakaoShare';
import { ToastContainer, useToast } from '@/components/Toast';
import styles from './ReferralCTA.module.css';
import { publicSiteUrl } from '@/lib/publicConfig';

interface ReferralCTAProps {
    variant?: 'inline' | 'card';
    surface?: string;
}

const TITLE = '친구를 초대하면 20엽전을 받아요!';
const SUBTITLE = '초대한 친구가 가입을 완료하면 보상을 드려요';
const COPIED_MESSAGE = '링크가 복사되었어요!';
const DEFAULT_SURFACE = 'unknown';
const DEFAULT_SHARE_ORIGIN = publicSiteUrl;

function resolveShareOrigin(): string {
    if (typeof window !== 'undefined' && window.location.origin && window.location.origin !== 'null') {
        return window.location.origin;
    }

    return DEFAULT_SHARE_ORIGIN;
}

export default function ReferralCTA({ variant = 'inline', surface = DEFAULT_SURFACE }: ReferralCTAProps) {
    const { isAuthenticated, isLoading, token } = useAuth();
    const [status, setStatus] = useState<ReferralStatusResponse | null>(null);
    const [isBusy, setIsBusy] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    const { toasts, showToast, removeToast } = useToast();
    const hasTrackedShownRef = useRef(false);

    const statsText = useMemo(() => {
        if (!status) {
            return null;
        }

        return `지금까지 ${status.total_referred}명 초대 · ${status.total_coins_earned}엽전 획득`;
    }, [status]);

    useEffect(() => {
        initKakao();
    }, []);

    useEffect(() => {
        if (!isAuthenticated) {
            setStatus(null);
            return;
        }

        let isMounted = true;

        const loadStatus = async () => {
            try {
                const nextStatus = await getReferralStatus(token ?? undefined);
                if (isMounted) {
                    setStatus(nextStatus);
                }
            } catch {
                if (isMounted) {
                    setStatus(null);
                }
            }
        };

        void loadStatus();

        return () => {
            isMounted = false;
        };
    }, [isAuthenticated, token]);

    useEffect(() => {
        if (!isAuthenticated || hasTrackedShownRef.current) {
            return;
        }

        hasTrackedShownRef.current = true;
        void trackReferralCTAShown(surface);
    }, [isAuthenticated, surface]);

    if (isLoading || !isAuthenticated) {
        return null;
    }

    const handleShare = async () => {
        if (isBusy) {
            return;
        }

        setIsBusy(true);
        setIsCopied(false);
        void trackReferralCTAClicked(surface);

        try {
            const referralLink = await createReferralLink(token ?? undefined);
            const shareUrl = new URL(referralLink.share_url, resolveShareOrigin()).toString();
            const imageUrl = new URL('/apple-icon.png', resolveShareOrigin()).toString();
            const method = await shareWithFallback({
                title: TITLE,
                description: SUBTITLE,
                imageUrl,
                shareUrl,
            });

            if (method === 'clipboard') {
                setIsCopied(true);
                showToast(COPIED_MESSAGE);
            } else if (method === 'failed') {
                await navigator.clipboard.writeText(shareUrl);
                setIsCopied(true);
                showToast(COPIED_MESSAGE);
            }

            try {
                const nextStatus = await getReferralStatus(token ?? undefined);
                setStatus(nextStatus);
            } catch {
                setStatus((prev) => prev ?? {
                    referral_code: referralLink.referral_code,
                    total_referred: 0,
                    total_completed: 0,
                    total_coins_earned: 0,
                });
            }
        } catch (error) {
            showToast(error instanceof Error ? error.message : '리퍼럴 링크 생성 실패', 'error');
        } finally {
            setIsBusy(false);
        }
    };

    return (
        <>
            <section
                className={`${styles.container} ${variant === 'inline' ? styles.inlineVariant : styles.cardVariant}`}
                data-testid="referral-cta"
            >
                <div className={styles.content}>
                    <div className={styles.headerRow}>
                        <div className={styles.iconBadge}>
                            <Gift size={18} />
                        </div>
                        <div className={styles.textBlock}>
                            <h3 className={styles.title}>{TITLE}</h3>
                            <p className={styles.subtitle}>{SUBTITLE}</p>
                        </div>
                    </div>

                    {statsText && (
                        <p className={styles.stats}>
                            <Users size={14} />
                            <span>{statsText}</span>
                        </p>
                    )}
                </div>

                <button
                    type="button"
                    className={styles.button}
                    onClick={handleShare}
                    disabled={isBusy}
                    aria-busy={isBusy}
                >
                    {isCopied ? <Check size={18} /> : <Copy size={18} />}
                    <span>친구 초대하기</span>
                </button>
            </section>

            <ToastContainer toasts={toasts} onRemove={removeToast} />
        </>
    );
}
