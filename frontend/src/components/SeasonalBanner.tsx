'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import styles from './SeasonalBanner.module.css';
import { getActiveCampaign } from '@/data/campaignConfig';
import { trackSeasonalBannerShown, trackSeasonalBannerClicked } from '@/lib/analytics';

const DISMISSED_KEY_PREFIX = 'seasonal_banner_dismissed_';

export default function SeasonalBanner() {
    const router = useRouter();
    const campaign = getActiveCampaign();
    const [isDismissed, setIsDismissed] = useState(true);
    const trackedRef = useRef(false);

    useEffect(() => {
        if (campaign) {
            const dismissedKey = `${DISMISSED_KEY_PREFIX}${campaign.id}`;
            const wasDismissed = sessionStorage.getItem(dismissedKey) === 'true';
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setIsDismissed(wasDismissed);
            
            if (!wasDismissed && !trackedRef.current) {
                void trackSeasonalBannerShown(campaign.id);
                trackedRef.current = true;
            }
        }
    }, [campaign]);

    const handleDismiss = useCallback(() => {
        if (campaign) {
            const dismissedKey = `${DISMISSED_KEY_PREFIX}${campaign.id}`;
            sessionStorage.setItem(dismissedKey, 'true');
            setIsDismissed(true);
        }
    }, [campaign]);

    const handleCTAClick = useCallback(() => {
        if (campaign) {
            void trackSeasonalBannerClicked(campaign.id);
            if (campaign.ctaPath !== '/') {
                router.push(campaign.ctaPath);
            } else {
                const formCard = document.querySelector('[data-testid="analysis-form-card"]');
                if (formCard) {
                    formCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        }
    }, [campaign, router]);

    if (!campaign || isDismissed) {
        return null;
    }

    return (
        <div
            className={styles.banner}
            data-testid="seasonal-banner"
            style={{
                '--gradient-from': campaign.gradientFrom,
                '--gradient-to': campaign.gradientTo,
            } as React.CSSProperties}
        >
            <button
                type="button"
                className={styles.dismissButton}
                onClick={handleDismiss}
                aria-label="배너 닫기"
            >
                <X size={18} />
            </button>

            <div className={styles.content}>
                <span className={styles.emoji}>{campaign.emoji}</span>
                <div className={styles.textContainer}>
                    <h3 className={styles.title}>{campaign.title}</h3>
                    <p className={styles.subtitle}>{campaign.subtitle}</p>
                </div>
            </div>

            <button
                type="button"
                className={styles.ctaButton}
                onClick={handleCTAClick}
            >
                {campaign.ctaText}
            </button>
        </div>
    );
}
