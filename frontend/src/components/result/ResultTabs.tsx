'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import styles from './ResultTabs.module.css';
import { ReadingResponse, BirthInput } from '@/types';
import { bootstrapResumeReading, getFeatureFlags, getReadingDetail, trackFunnelStep } from '@/lib/api';
import { getSessionId, trackEvent } from '@/lib/analytics';
import ShareModal from '@/components/ShareModal';
import PresentationView from '@/components/PresentationView';
import MultiTurnChat from '@/components/MultiTurnChat';
import BottomTabBar from '@/components/BottomTabBar';
import PaymentConfirmModal from '@/components/PaymentConfirmModal';
import { useAuth } from '@/contexts/AuthContext';
import { usePayment } from '@/contexts/PaymentContext';
import { spendCoins } from '@/lib/paymentApi';
import { useTabEngagement } from '@/hooks/useTabEngagement';
import { TabKey, SECONDARY_TAB_CONFIG } from './types';
import { useTabTracking } from './hooks/useTabTracking';
import SummaryHub from './SummaryHub';
import DetailUnlockPanel from './DetailUnlockPanel';
import ImageHero from './shared/ImageHero';
import SajuImageGenerator from './shared/SajuImageGenerator';
import OneLiner from './shared/OneLiner';
import TabNavigation from './shared/TabNavigation';
import MetaInfo from './shared/MetaInfo';
import TabDescription from './shared/TabDescription';
import SummaryTab from './tabs/SummaryTab';
import LoveTab from './tabs/LoveTab';
import MoneyTab from './tabs/MoneyTab';
import CareerTab from './tabs/CareerTab';
import StudyTab from './tabs/StudyTab';
import HealthTab from './tabs/HealthTab';
import CompatibilityTab from './tabs/CompatibilityTab';
import LuckyTab from './tabs/LuckyTab';
import DaeunTab from './tabs/DaeunTab';
import LifeFlowTab from './tabs/LifeFlowTab';
import { getSummaryHubCards } from './summaryHubCards';
import {
    buildAnonymousSummaryHubResumeReadingId,
    SummaryHubDetailTab,
    ResumeDestinationFocus,
    advanceSummaryHubResumeToken,
    armSummaryHubResumePayment,
    beginSummaryHubResumeFlow,
    loadSummaryHubResumeToken,
    migrateSummaryHubResumeReadingId,
    replaceSummaryHubResumeSnapshotResult,
} from '@/lib/summaryHubResume';
import {
    trackSummaryHubCardExposed,
    trackSummaryHubDetailCtaClicked,
    trackSummaryHubResumeOutcome,
} from '@/lib/summaryHubAnalytics';
import {
    dismissResultToastPrompt,
    markResultToastShown,
    shouldShowResultToastPrompt,
} from '@/utils/compatibilityPromptRules';
import { getProgressInput, getRecentInput, type CachedBirthInput } from '@/utils/cachedInput';
import { jijiToTime } from '@/utils/jijiTime';

interface ResultTabsProps {
    data: ReadingResponse;
    birthInput?: BirthInput | null;
    profileId?: string;
    readingId?: string;
    isReadOnlyShared?: boolean;
    isPaidReading?: boolean;
    paymentTransactionId?: string | null;
    initialActiveTab?: TabKey | null;
    initialResumeTargetTab?: TabKey | null;
    initialResumeFocus?: ResumeDestinationFocus | null;
}

const DETAIL_UNLOCK_FEATURE_KEY = 'reading_reanalyze';
const DETAIL_UNLOCK_DEFAULT_PRICE = 150;

const TAB_TITLES: Record<TabKey, string> = {
    summary: '종합',
    lucky: '오늘의 운세',
    love: '연애운',
    money: '금전운',
    career: '커리어',
    study: '학업운',
    health: '건강운',
    compatibility: '관계',
    life: '인생 흐름',
    daeun: '대운',
};

function isDetailTargetTab(tab: TabKey): tab is SummaryHubDetailTab {
    return ['summary', 'lucky', 'love', 'money', 'career', 'study', 'health', 'compatibility', 'life', 'daeun'].includes(tab);
}

function getTabSummary(data: ReadingResponse, tab: TabKey): string {
    switch (tab) {
        case 'summary':
            return data.one_liner || '';
        case 'lucky':
            return data.tabs.lucky?.today_overview || '';
        case 'love':
            return data.tabs.love?.summary || '';
        case 'money':
            return data.tabs.money?.summary || '';
        case 'career':
            return data.tabs.career?.summary || '';
        case 'study':
            return data.tabs.study?.summary || '';
        case 'health':
            return data.tabs.health?.summary || '';
        case 'compatibility':
            return data.tabs.compatibility?.summary || '';
        case 'life':
            return data.tabs.life_flow?.mechanism?.[0] || '';
        case 'daeun':
            return data.tabs.daeun?.summary || '';
        default:
            return '';
    }
}

function restoreBirthInputFromCache(cached: CachedBirthInput | null): BirthInput | null {
    if (!cached?.birth_solar || !cached.gender) {
        return null;
    }

    return {
        name: cached.name,
        birth_solar: cached.birth_solar,
        birth_time: cached.birth_time || jijiToTime(cached.birth_jiji || ''),
        birth_jiji: cached.birth_jiji,
        timezone: cached.timezone || 'Asia/Seoul',
        birth_place: cached.birth_place || '대한민국',
        calendar_type: cached.calendar_type || 'solar',
        gender: cached.gender,
        persona: cached.persona || 'classic',
    };
}

export default function ResultTabs({
    data,
    birthInput,
    profileId,
    readingId,
    isReadOnlyShared = false,
    isPaidReading = false,
    initialActiveTab = null,
    initialResumeTargetTab = null,
    initialResumeFocus = null,
}: ResultTabsProps) {
    const router = useRouter();
    const { isAuthenticated, token, user } = useAuth();
    const { wallet, prices, refreshWallet } = usePayment();

    const [activeTab, setActiveTab] = useState<TabKey | null>(initialActiveTab);
    const [resultData, setResultData] = useState(data);
    const [hasDetailEntitlement, setHasDetailEntitlement] = useState(isPaidReading);
    const [isAiChatOpen, setIsAiChatOpen] = useState(false);
    const [isPresentationOpen, setIsPresentationOpen] = useState(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [shareModalInitialTab, setShareModalInitialTab] = useState<'card' | 'code'>('card');
    const [showCompatibilityToast, setShowCompatibilityToast] = useState(false);
    const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({});
    const [sessionImageBase64, setSessionImageBase64] = useState<string | null>(null);
    const [detailRequestError, setDetailRequestError] = useState<string | null>(null);
    const [detailTargetTab, setDetailTargetTab] = useState<SummaryHubDetailTab | null>(null);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [isRequestingDetail, setIsRequestingDetail] = useState(false);

    const imageStorageKey = `saju_image_${profileId || readingId || 'default'}`;
    const toastTimerRef = useRef<number | null>(null);
    const autoOpenedResumeRef = useRef(false);
    const summaryHubExposureKeyRef = useRef<string | null>(null);

    const showSummaryHub = !isReadOnlyShared && activeTab === null;
    const displayedTab: TabKey = isReadOnlyShared ? 'summary' : (activeTab || 'summary');
    const detailUnlockPrice = prices?.[DETAIL_UNLOCK_FEATURE_KEY] ?? DETAIL_UNLOCK_DEFAULT_PRICE;
    const teaserSummary = getTabSummary(resultData, displayedTab);
    const summaryHubCards = getSummaryHubCards(resultData);
    const durableResumeReadingId = readingId
        || resultData.meta?.reading_id
        || (resultData.meta?.cache_id
            ? buildAnonymousSummaryHubResumeReadingId(resultData.meta.cache_id)
            : null);
    const cacheNamespace = user?.user_id;
    const restoredBirthInput = useMemo(() => {
        if (birthInput || typeof window === 'undefined') {
            return null;
        }

        return restoreBirthInputFromCache(
            getProgressInput(cacheNamespace)
                ?? getRecentInput(cacheNamespace)
                ?? getProgressInput()
                ?? getRecentInput()
        );
    }, [birthInput, cacheNamespace]);
    const resumeBirthInput = birthInput || restoredBirthInput;

    useTabTracking(readingId, displayedTab);
    useTabEngagement(displayedTab, { readingId });

    const persistResumeIntent = useCallback((
        targetTab: SummaryHubDetailTab,
        surface: 'summary_hub_card' | 'summary_tab_cta',
        overrideReadingId?: string,
    ) => {
        const resumeReadingId = overrideReadingId || durableResumeReadingId;

        if (!resumeReadingId || !resumeBirthInput) {
            return false;
        }

        beginSummaryHubResumeFlow({
            readingId: resumeReadingId,
            targetTab,
            featureKey: DETAIL_UNLOCK_FEATURE_KEY,
            ctaOriginSurface: surface,
            birthInput: resumeBirthInput,
            result: resultData,
            profileId,
        });
        return true;
    }, [durableResumeReadingId, profileId, resultData, resumeBirthInput]);

    const ensureResolvedReadingIdentity = useCallback(async (): Promise<string | null> => {
        const existingReadingId = readingId || resultData.meta?.reading_id;
        if (existingReadingId) {
            return existingReadingId;
        }

        if (!isAuthenticated || !resumeBirthInput || !resultData.meta?.cache_id) {
            return null;
        }

        const bootstrap = await bootstrapResumeReading(
            resultData.meta.cache_id,
            resumeBirthInput,
            token || undefined,
            profileId,
        );

        const nextResult: ReadingResponse = {
            ...resultData,
            meta: {
                ...resultData.meta,
                reading_id: bootstrap.reading_id,
            },
        };

        setResultData(nextResult);

        if (durableResumeReadingId && durableResumeReadingId !== bootstrap.reading_id) {
            migrateSummaryHubResumeReadingId(
                durableResumeReadingId,
                bootstrap.reading_id,
                nextResult,
            );
        }

        return bootstrap.reading_id;
    }, [durableResumeReadingId, isAuthenticated, profileId, readingId, resultData, resumeBirthInput, token]);

    const handleTabChange = useCallback(
        (tab: TabKey) => {
            if (isReadOnlyShared && tab !== 'summary') {
                return;
            }

            setDetailRequestError(null);
            setActiveTab(tab);

            const sessionId = getSessionId();
            if (!sessionId) {
                return;
            }

            void trackFunnelStep(sessionId, 'tab_clicked', {
                tab_name: tab,
                reading_id: readingId,
            });

            window.scrollTo({ top: 0, behavior: 'smooth' });
        },
        [isReadOnlyShared, readingId]
    );

    const handleSummaryCardClick = useCallback(
        (tab: TabKey) => {
            setDetailRequestError(null);
            setActiveTab(tab);

            const sessionId = getSessionId();
            if (sessionId) {
                void trackEvent('summary_hub_card_clicked', { tab, reading_id: readingId }, sessionId);
            }
        },
        [readingId]
    );

    const requestDetailAccess = useCallback(async (
        targetTab: TabKey,
        surface: 'summary_hub_card' | 'summary_tab_cta'
    ) => {
        if (!isDetailTargetTab(targetTab)) {
            return;
        }

        void trackSummaryHubDetailCtaClicked({
            readingId: durableResumeReadingId || undefined,
            surface,
            domain: targetTab,
            isAuthenticated,
            hasDetailEntitlement,
        });

        setDetailRequestError(null);
        setDetailTargetTab(targetTab);

        if (!persistResumeIntent(targetTab, surface)) {
            setDetailRequestError('현재 결과 컨텍스트를 확인하지 못했습니다. 다시 분석 후 시도해주세요.');
            return;
        }

        if (!isAuthenticated) {
            router.push('/login');
            return;
        }

        setIsRequestingDetail(true);
        try {
            const resolvedReadingId = await ensureResolvedReadingIdentity();
            if (!resolvedReadingId) {
                setDetailRequestError('리딩 컨텍스트를 복구하지 못했습니다. 다시 분석 후 시도해주세요.');
                return;
            }

            const detailResult = await getReadingDetail(resolvedReadingId, token || undefined);
            setResultData(detailResult);
            setHasDetailEntitlement(true);
            setActiveTab(targetTab);
            replaceSummaryHubResumeSnapshotResult(resolvedReadingId, detailResult);
            advanceSummaryHubResumeToken(resolvedReadingId, 'payment_success');
            const resumeToken = loadSummaryHubResumeToken(resolvedReadingId);
            if (resumeToken) {
                void trackSummaryHubResumeOutcome({
                    token: resumeToken,
                    destination: {
                        pathname: '/',
                        screen: 'summary_hub',
                        readingId: resolvedReadingId,
                        activeTab: targetTab,
                        focus: 'paid_detail',
                        detailUnlocked: true,
                    },
                    outcome: 'already_entitled_reopen',
                });
            }
            return;
        } catch (error) {
            const status =
                typeof error === 'object' && error !== null && 'status' in error
                    ? (error as { status?: unknown }).status
                    : undefined;

            if (status === 403) {
                setIsPaymentModalOpen(true);
            } else {
                setDetailRequestError(
                    error instanceof Error ? error.message : '상세 사주를 여는 중 오류가 발생했습니다.'
                );
            }
        } finally {
            setIsRequestingDetail(false);
        }
    }, [durableResumeReadingId, ensureResolvedReadingIdentity, hasDetailEntitlement, isAuthenticated, persistResumeIntent, router, token]);

    const closePaymentModal = useCallback(() => {
        setIsPaymentModalOpen(false);
    }, []);

    const handleChargeForDetail = useCallback(() => {
        const proceed = async () => {
            if (!detailTargetTab) {
                return;
            }

            const resolvedReadingId = await ensureResolvedReadingIdentity();
            if (!resolvedReadingId) {
                setDetailRequestError('리딩 컨텍스트를 복구하지 못했습니다. 다시 분석 후 시도해주세요.');
                return;
            }

            persistResumeIntent(detailTargetTab, 'summary_tab_cta', resolvedReadingId);
            armSummaryHubResumePayment(resolvedReadingId);
            setIsPaymentModalOpen(false);
            router.push('/charge');
        };

        void proceed();
    }, [detailTargetTab, ensureResolvedReadingIdentity, persistResumeIntent, router]);

    const handleUnlockWithCoins = useCallback(async () => {
        if (!detailTargetTab) {
            return;
        }

        setDetailRequestError(null);
        setIsRequestingDetail(true);

        try {
            const resolvedReadingId = await ensureResolvedReadingIdentity();
            if (!resolvedReadingId) {
                setDetailRequestError('리딩 컨텍스트를 복구하지 못했습니다. 다시 분석 후 시도해주세요.');
                return;
            }

            await spendCoins(
                DETAIL_UNLOCK_FEATURE_KEY,
                resolvedReadingId,
                `summary-hub-detail:${resolvedReadingId}`
            );

            let detailResult: ReadingResponse;
            try {
                detailResult = await getReadingDetail(resolvedReadingId, token || undefined);
            } catch (fetchError) {
                // 결제 성공 후 상세 조회 실패
                void refreshWallet();
                setIsPaymentModalOpen(false);
                setDetailRequestError(
                    fetchError instanceof Error
                        ? `${fetchError.message} 결제는 완료되었으니 다시 결제할 필요는 없습니다. 새로고침 후 다시 시도해주세요.`
                        : '결제는 완료되었지만 상세 사주를 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.'
                );
                return;
            }

            setResultData(detailResult);
            setHasDetailEntitlement(true);
            setActiveTab(detailTargetTab);
            setIsPaymentModalOpen(false);
            replaceSummaryHubResumeSnapshotResult(resolvedReadingId, detailResult);
            advanceSummaryHubResumeToken(resolvedReadingId, 'payment_success');
            await refreshWallet();
        } catch (error) {
            // spendCoins 실패 등 결제 전 오류
            setDetailRequestError(
                error instanceof Error ? error.message : '상세 사주를 여는 중 오류가 발생했습니다.'
            );
        } finally {
            setIsRequestingDetail(false);
        }
    }, [detailTargetTab, ensureResolvedReadingIdentity, refreshWallet, token]);

    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, []);

    useEffect(() => {
        setActiveTab(initialActiveTab);
    }, [initialActiveTab]);

    useEffect(() => {
        if (initialResumeTargetTab && isDetailTargetTab(initialResumeTargetTab)) {
            setDetailTargetTab(initialResumeTargetTab);
            return;
        }
        setDetailTargetTab(null);
    }, [initialResumeTargetTab]);

    useEffect(() => {
        if (initialResumeFocus === null) {
            autoOpenedResumeRef.current = false;
            return;
        }
        autoOpenedResumeRef.current = false;
    }, [initialResumeFocus]);

    useEffect(() => {
        setResultData(data);
    }, [data]);

    useEffect(() => {
        setHasDetailEntitlement(isPaidReading);
    }, [isPaidReading]);

    useEffect(() => {
        if (!showSummaryHub) {
            return;
        }

        const exposureKey = `${readingId || resultData.meta?.reading_id || 'unknown'}:${summaryHubCards.map((card) => card.key).join(',')}`;
        if (summaryHubExposureKeyRef.current === exposureKey) {
            return;
        }

        summaryHubExposureKeyRef.current = exposureKey;
        summaryHubCards.forEach((card) => {
            void trackSummaryHubCardExposed({
                readingId: readingId || resultData.meta?.reading_id,
                domain: card.key,
                priority: card.priority,
                hasDetailEntitlement,
            });
        });
    }, [hasDetailEntitlement, readingId, resultData.meta, showSummaryHub, summaryHubCards]);

    useEffect(() => {
        if (
            initialResumeFocus === 'payment_gate'
            && initialResumeTargetTab
            && isAuthenticated
            && !hasDetailEntitlement
            && !autoOpenedResumeRef.current
            && isDetailTargetTab(initialResumeTargetTab)
        ) {
            autoOpenedResumeRef.current = true;
            setDetailTargetTab(initialResumeTargetTab);
            setIsPaymentModalOpen(true);
        }
    }, [hasDetailEntitlement, initialResumeFocus, initialResumeTargetTab, isAuthenticated]);

    useEffect(() => {
        let isMounted = true;

        const loadFeatureFlags = async () => {
            const flags = await getFeatureFlags();
            if (isMounted) {
                setFeatureFlags(flags);
            }
        };

        loadFeatureFlags();

        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        const stored = sessionStorage.getItem(imageStorageKey);
        const timer = setTimeout(() => {
            setSessionImageBase64(stored);
        }, 0);
        return () => clearTimeout(timer);
    }, [imageStorageKey]);

    useEffect(() => {
        if (isShareModalOpen) {
            if (toastTimerRef.current) {
                window.clearTimeout(toastTimerRef.current);
                toastTimerRef.current = null;
            }
            return;
        }

        if (!shouldShowResultToastPrompt()) return;

        toastTimerRef.current = window.setTimeout(() => {
            setShowCompatibilityToast(true);
            markResultToastShown();
            void trackEvent('compat_prompt_shown', { surface: 'result_toast' }, getSessionId());
        }, 2000);

        return () => {
            if (toastTimerRef.current) {
                window.clearTimeout(toastTimerRef.current);
                toastTimerRef.current = null;
            }
        };
    }, [isShareModalOpen]);

    const visibleSecondaryTabs = SECONDARY_TAB_CONFIG.filter(tab => {
        if (tab.key === 'compatibility' && !resultData.tabs.compatibility) return false;
        return true;
    });

    const handleImageSave = () => {
        const imageData = resultData.saju_image_base64 || sessionImageBase64;
        if (!imageData) return;
        const src = imageData.startsWith('data:')
            ? imageData
            : `data:image/png;base64,${imageData}`;
        const link = document.createElement('a');
        link.href = src;
        link.download = 'saju-image.png';
        link.click();
    };

    const handleImageShare = async () => {
        const imageData = resultData.saju_image_base64 || sessionImageBase64;
        if (!imageData) return;
        try {
            const src = imageData.startsWith('data:')
                ? imageData
                : `data:image/png;base64,${imageData}`;
            if (navigator.share) {
                const res = await fetch(src);
                const blob = await res.blob();
                const file = new File([blob], 'saju-image.png', { type: 'image/png' });
                await navigator.share({ files: [file], title: '나의 사주 이미지' });
            } else {
                handleImageSave();
            }
        } catch {
            handleImageSave();
        }
    };

    const handleCompatibilityPromptClick = useCallback((surface: 'result_inline' | 'result_toast') => {
        if (toastTimerRef.current) {
            window.clearTimeout(toastTimerRef.current);
            toastTimerRef.current = null;
        }
        void trackEvent('compat_prompt_clicked', { surface, reading_id: readingId }, getSessionId());
        setShowCompatibilityToast(false);
        setShareModalInitialTab(profileId ? 'code' : 'card');
        setIsShareModalOpen(true);
    }, [profileId, readingId]);

    const handleCompatibilityToastDismiss = useCallback(() => {
        dismissResultToastPrompt();
        setShowCompatibilityToast(false);
        void trackEvent('compat_prompt_dismissed', { surface: 'result_toast', reading_id: readingId }, getSessionId());
    }, [readingId]);

    return (
        <div className={styles.container} data-testid="result-tabs">
            <PaymentConfirmModal
                isOpen={isPaymentModalOpen && !!detailTargetTab}
                onClose={closePaymentModal}
                onConfirm={() => { void handleUnlockWithCoins(); }}
                onCharge={handleChargeForDetail}
                price={detailUnlockPrice}
                balance={wallet?.balance ?? null}
                featureName={detailTargetTab ? `이 리딩 전체 상세 해설 (${TAB_TITLES[detailTargetTab]} 탭으로 복귀)` : '이 리딩 전체 상세 해설'}
                isLoading={isRequestingDetail}
                title="리딩 전체 상세 해설 열기"
                description="한 번 열면 이 리딩의 모든 탭 상세 해설을 볼 수 있고, 결제 직후에는 방금 요청한 탭으로 바로 돌아갑니다."
                confirmLabel="전체 해설 열기"
                chargeLabel="충전 후 전체 해설 열기"
                errorMessage={detailRequestError ?? undefined}
            />

            {(resultData.saju_image_base64 || sessionImageBase64) ? (
                <ImageHero
                    imageBase64={resultData.saju_image_base64 || sessionImageBase64}
                    onSave={isReadOnlyShared ? undefined : handleImageSave}
                    onShare={isReadOnlyShared ? undefined : handleImageShare}
                    onRegenerate={!isReadOnlyShared && !resultData.saju_image_base64 && sessionImageBase64 ? () => {
                        sessionStorage.removeItem(imageStorageKey);
                        setSessionImageBase64(null);
                    } : undefined}
                />
            ) : !isReadOnlyShared ? (
                <SajuImageGenerator
                    data={resultData}
                    birthInput={birthInput || undefined}
                    profileId={profileId}
                    readingId={readingId}
                    onImageGenerated={(img) => setSessionImageBase64(img)}
                />
            ) : null}

            {!showSummaryHub && <OneLiner text={resultData.one_liner || ''} />}
            {showCompatibilityToast && !isShareModalOpen && !isReadOnlyShared && (
                <div className={styles.compatibilityToast} data-testid="compatibility-prompt-toast" aria-live="polite">
                    <div className={styles.compatibilityToastBody}>
                        <p className={styles.compatibilityToastTitle}>벗에게 사주를 보내면, 궁합도 바로 이어서 볼 수 있소</p>
                    </div>
                    <div className={styles.compatibilityToastActions}>
                        <button
                            type="button"
                            className={styles.compatibilityToastPrimary}
                            onClick={() => handleCompatibilityPromptClick('result_toast')}
                        >
                            지금 보내기
                        </button>
                        <button
                            type="button"
                            className={styles.compatibilityToastDismiss}
                            onClick={handleCompatibilityToastDismiss}
                        >
                            닫기
                        </button>
                    </div>
                </div>
            )}

            {isPresentationOpen && (
                <PresentationView
                    data={resultData}
                    onClose={() => setIsPresentationOpen(false)}
                    birthInput={birthInput}
                />
            )}

            <ShareModal
                isOpen={isShareModalOpen}
                onClose={() => setIsShareModalOpen(false)}
                data={resultData}
                birthInput={birthInput}
                profileId={profileId}
                initialTab={shareModalInitialTab}
            />

            {birthInput && !isReadOnlyShared && (
                <MultiTurnChat
                    isOpen={isAiChatOpen}
                    onClose={() => setIsAiChatOpen(false)}
                    birthInput={birthInput}
                    sajuData={resultData}
                />
            )}

            {showSummaryHub ? (
                <SummaryHub
                    data={resultData}
                    onTabChange={handleSummaryCardClick}
                    onRequestDetail={(tab) => {
                        void requestDetailAccess(tab, 'summary_hub_card');
                    }}
                    featureCharacterCardEnabled={featureFlags.feature_character_card_enabled}
                />
            ) : (
                <div className={styles.tabContent} data-testid="result-tab-panel">
                    <TabDescription tabKey={displayedTab} />

                    {detailRequestError && !isPaymentModalOpen && (
                        <div className={styles.detailRequestError} data-testid="detail-request-error">
                            {detailRequestError}
                        </div>
                    )}

                    {displayedTab === 'summary' && (
                        <SummaryTab
                            data={resultData}
                            featureSummaryV2Enabled={featureFlags.feature_summary_v2_enabled}
                            featureCharacterCardEnabled={featureFlags.feature_character_card_enabled}
                        />
                    )}

                    {displayedTab !== 'summary' && !hasDetailEntitlement && (
                        <DetailUnlockPanel
                            title={TAB_TITLES[displayedTab]}
                            summary={teaserSummary}
                            tabKey={displayedTab}
                            price={detailUnlockPrice}
                            isAuthenticated={isAuthenticated}
                            isLoading={isRequestingDetail && detailTargetTab === displayedTab}
                            onRequestDetail={() => {
                                void requestDetailAccess(displayedTab, 'summary_tab_cta');
                            }}
                        />
                    )}

                    {displayedTab === 'love' && hasDetailEntitlement && (
                        <LoveTab
                            data={resultData}
                            featureLoveV2Enabled={featureFlags.feature_love_v2_enabled}
                        />
                    )}

                    {displayedTab === 'money' && hasDetailEntitlement && (
                        <MoneyTab
                            data={resultData}
                            featureMoneyV2Enabled={featureFlags.feature_money_v2_enabled}
                        />
                    )}

                    {displayedTab === 'career' && hasDetailEntitlement && (
                        <CareerTab
                            data={resultData}
                            featureCareerV2Enabled={featureFlags.feature_career_v2_enabled}
                        />
                    )}

                    {displayedTab === 'study' && hasDetailEntitlement && <StudyTab data={resultData} />}

                    {displayedTab === 'health' && hasDetailEntitlement && <HealthTab data={resultData} />}

                    {displayedTab === 'compatibility' && hasDetailEntitlement && (
                        <CompatibilityTab data={resultData} />
                    )}

                    {displayedTab === 'lucky' && hasDetailEntitlement && (
                        <LuckyTab
                            data={resultData}
                            profileId={profileId}
                            birthDate={birthInput?.birth_solar}
                            featureDailyGuideEnabled={featureFlags.feature_daily_guide_enabled}
                            featureFlowCalendarEnabled={featureFlags.feature_flow_calendar_enabled}
                        />
                    )}

                    {displayedTab === 'daeun' && hasDetailEntitlement && <DaeunTab data={resultData} profileId={profileId} />}

                    {displayedTab === 'life' && hasDetailEntitlement && (
                        <LifeFlowTab data={resultData} birthInput={birthInput} profileId={profileId} />
                    )}
                </div>
            )}

            {!isReadOnlyShared && !showSummaryHub && (
                <TabNavigation
                    activeTab={activeTab || 'summary'}
                    onTabChange={handleTabChange}
                    visibleTabs={visibleSecondaryTabs}
                />
            )}

            <MetaInfo meta={resultData.meta} />

            {!isReadOnlyShared && (
                <>
                    <BottomTabBar
                        activeTab={activeTab || 'summary'}
                        onTabChange={handleTabChange}
                        onDosaClick={() => setIsAiChatOpen(true)}
                    />

                    <div style={{ height: '60px' }} />
                </>
            )}
        </div>
    );
}
