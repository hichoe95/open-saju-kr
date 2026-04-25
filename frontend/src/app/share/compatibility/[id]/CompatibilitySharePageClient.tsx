'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toPng } from 'html-to-image';
import { CompatibilityResponse, BirthInput, CompatibilityScenario } from '@/types';
import CompatibilityShareCard, { CardTheme } from '@/components/CompatibilityShareCard';
import styles from '../../[id]/page.module.css';
import {
    CheckCircle, Clock, AlertCircle,
    Download, Share2, ChevronLeft, ChevronRight, Image as ImageIcon, Heart,
    Gift, Star, Zap, Sparkles,
} from 'lucide-react';
import { trackShareViewed, trackPageView, getSessionId } from '@/lib/analytics';

const THEMES: { value: CardTheme; label: string; iconPath: string }[] = [
    { value: 'romantic', label: '로맨틱', iconPath: '/icons/emoji-replacements/themes/romantic.png' },
    { value: 'minimal', label: '미니멀', iconPath: '/icons/emoji-replacements/themes/minimal.png' },
    { value: 'dark', label: '다크', iconPath: '/icons/emoji-replacements/themes/dark.png' },
    { value: 'cute', label: '큐트', iconPath: '/icons/emoji-replacements/themes/cute.png' },
];

const SCENARIO_LABELS: Record<CompatibilityScenario, { iconPath: string; label: string }> = {
    lover: { iconPath: '/icons/emoji-replacements/compatibility/lover.png', label: '연인 궁합' },
    crush: { iconPath: '/icons/emoji-replacements/compatibility/crush.png', label: '썸 궁합' },
    friend: { iconPath: '/icons/emoji-replacements/compatibility/friend.png', label: '친구 궁합' },
    family: { iconPath: '/icons/emoji-replacements/compatibility/family.png', label: '가족 궁합' },
    business: { iconPath: '/icons/emoji-replacements/compatibility/business.png', label: '비즈니스 궁합' },
};

type ViewMode = 'result' | 'card';

interface ShareData {
    share_code: string;
    user_a: BirthInput;
    user_b: BirthInput;
    compatibility_data: CompatibilityResponse;
    scenario: CompatibilityScenario;
    created_at: string;
    view_count: number;
}

interface CompatibilitySharePageClientProps {
    shareCode: string;
}

export default function CompatibilitySharePageClient({ shareCode }: CompatibilitySharePageClientProps) {
    const router = useRouter();

    const [shareData, setShareData] = useState<ShareData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [viewMode, setViewMode] = useState<ViewMode>('result');
    const [selectedTheme, setSelectedTheme] = useState<CardTheme>('romantic');
    const [isSavingCard, setIsSavingCard] = useState(false);
    const cardRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchShare = async () => {
            try {
                const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8003';
                const response = await fetch(`${apiBaseUrl}/api/share/compatibility/${shareCode}`);

                if (response.status === 404) {
                    throw new Error('궁합 공유 링크를 찾을 수 없습니다');
                }
                if (response.status === 410) {
                    throw new Error('궁합 공유 링크가 만료되었습니다');
                }
                if (!response.ok) {
                    throw new Error('궁합 공유 데이터 조회에 실패했습니다');
                }

                const data = (await response.json()) as ShareData;
                setShareData(data);

                trackShareViewed(shareCode, getSessionId());
                trackPageView('compatibility_share_received', { share_code: shareCode });
            } catch (err) {
                setError(err instanceof Error ? err.message : '알 수 없는 오류');
            } finally {
                setIsLoading(false);
            }
        };

        if (shareCode) {
            fetchShare();
        }
    }, [shareCode]);

    const handleStartAnalysis = () => {
        router.push('/');
    };

    const handleThemePrev = () => {
        const idx = THEMES.findIndex((theme) => theme.value === selectedTheme);
        const newIdx = idx > 0 ? idx - 1 : THEMES.length - 1;
        setSelectedTheme(THEMES[newIdx].value);
    };

    const handleThemeNext = () => {
        const idx = THEMES.findIndex((theme) => theme.value === selectedTheme);
        const newIdx = idx < THEMES.length - 1 ? idx + 1 : 0;
        setSelectedTheme(THEMES[newIdx].value);
    };

    const handleSaveCard = async () => {
        if (!cardRef.current || isSavingCard) {
            return;
        }

        setIsSavingCard(true);

        try {
            await new Promise((resolve) => setTimeout(resolve, 100));
            const dataUrl = await toPng(cardRef.current, {
                cacheBust: true,
                pixelRatio: 2,
                backgroundColor: '#ffffff',
            });

            const link = document.createElement('a');
            link.download = `compatibility_card_${shareCode}.png`;
            link.href = dataUrl;
            link.click();
        } catch (err) {
            console.error('카드 저장 오류:', err);
            alert('이미지 저장에 실패했습니다');
        } finally {
            setIsSavingCard(false);
        }
    };

    const handleShareCard = async () => {
        if (!cardRef.current) {
            return;
        }

        try {
            const dataUrl = await toPng(cardRef.current, {
                cacheBust: true,
                pixelRatio: 2,
                backgroundColor: '#ffffff',
            });

            const response = await fetch(dataUrl);
            const blob = await response.blob();
            const file = new File([blob], 'compatibility_card.png', { type: 'image/png' });

            if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: '궁합 결과',
                    text: '친구가 보낸 궁합 결과입니다',
                });
            } else {
                handleSaveCard();
            }
        } catch (err) {
            if ((err as Error).name !== 'AbortError') {
                console.error('공유 오류:', err);
                handleSaveCard();
            }
        }
    };

    const currentTheme = THEMES.find((theme) => theme.value === selectedTheme)!;

    if (isLoading) {
        return (
            <div className={styles.loadingContainer}>
                <div className={styles.loadingSpinner} />
                <p>궁합 결과를 불러오는 중...</p>
            </div>
        );
    }

    if (error || !shareData) {
        return (
            <div className={styles.errorContainer}>
                <div className={styles.errorIcon}>
                    <AlertCircle size={48} />
                </div>
                <h1>{error || '데이터를 찾을 수 없습니다'}</h1>
                <p>링크가 만료되었거나 잘못된 링크입니다.</p>
                <button type="button" className={styles.primaryButton} onClick={handleStartAnalysis}>
                    내 사주 보러가기
                </button>
            </div>
        );
    }

    const { user_a, user_b, compatibility_data, scenario, view_count } = shareData;
    const scenarioInfo = SCENARIO_LABELS[scenario] || SCENARIO_LABELS.lover;

    return (
        <div className={styles.container}>
            <div className={styles.banner} style={{ background: 'linear-gradient(135deg, #ff6b9d 0%, #c44569 100%)' }}>
                <div className={styles.bannerIcon}>
                    <Heart size={24} />
                </div>
                <div className={styles.bannerContent}>
                    <span className={styles.shareTag}>
                        <img
                            src={scenarioInfo.iconPath}
                            alt=""
                            width={16}
                            height={16}
                            loading="eager"
                        />
                        {scenarioInfo.label}
                    </span>
                    <h1 className={styles.sharerName} style={{ fontSize: '1.25rem' }}>
                        {user_a.name || 'A'}님
                        {' '}
                        <img
                            src={scenarioInfo.iconPath}
                            alt=""
                            width={18}
                            height={18}
                            loading="eager"
                            style={{ display: 'inline-block', verticalAlign: '-3px' }}
                        />
                        {' '}
                        {user_b.name || 'B'}님
                    </h1>
                    <p className={styles.birthInfo}>
                        궁합 점수: {compatibility_data.score}점
                    </p>
                </div>
                <div className={styles.savedBadge}>
                    <CheckCircle size={14} />
                    {view_count}명 조회
                </div>
            </div>

            <div className={styles.oneLiner}>
                <span className={styles.quoteIcon}>&ldquo;</span>
                {compatibility_data.summary}
                <span className={styles.quoteIcon}>&rdquo;</span>
            </div>

            <div className={styles.viewTabs}>
                <button
                    type="button"
                    className={`${styles.viewTab} ${viewMode === 'result' ? styles.viewTabActive : ''}`}
                    onClick={() => setViewMode('result')}
                >
                    <Sparkles size={16} />
                    궁합 결과
                </button>
                <button
                    type="button"
                    className={`${styles.viewTab} ${viewMode === 'card' ? styles.viewTabActive : ''}`}
                    onClick={() => setViewMode('card')}
                >
                    <ImageIcon size={16} />
                    궁합 카드
                </button>
            </div>

            {viewMode === 'result' && (
                <div className={styles.cardPreview}>
                    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '48px', fontWeight: 800, color: '#6366F1' }}>
                                {compatibility_data.score}
                                <span style={{ fontSize: '20px', fontWeight: 500 }}>점</span>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '12px', flexWrap: 'wrap' }}>
                                {compatibility_data.keyword.split(/\s+/).slice(0, 4).map((keyword) => (
                                    <span key={keyword} style={{
                                        background: '#EEF2FF',
                                        color: '#6366F1',
                                        padding: '4px 10px',
                                        borderRadius: '12px',
                                        fontSize: '13px',
                                        fontWeight: 500,
                                    }}>
                                        {keyword}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <div style={{ background: '#f9fafb', borderRadius: '12px', padding: '16px' }}>
                            <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: '#6366F1' }}>조언</h4>
                            <p style={{ margin: 0, fontSize: '14px', color: '#4b5563', lineHeight: 1.6 }}>
                                {compatibility_data.advice}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {viewMode === 'card' && (
                <div className={styles.fortuneCardSection}>
                    <div className={styles.themeSelector}>
                        <button type="button" className={styles.themeNavBtn} onClick={handleThemePrev}>
                            <ChevronLeft size={20} />
                        </button>
                        <div className={styles.themeLabel}>
                            <span className={styles.themeEmoji}>
                                <img
                                    src={currentTheme.iconPath}
                                    alt=""
                                    width={18}
                                    height={18}
                                    loading="eager"
                                />
                            </span>
                            <span>{currentTheme.label}</span>
                        </div>
                        <button type="button" className={styles.themeNavBtn} onClick={handleThemeNext}>
                            <ChevronRight size={20} />
                        </button>
                    </div>

                    <div className={styles.themeDots}>
                        {THEMES.map((theme) => (
                            <button
                                type="button"
                                key={theme.value}
                                className={`${styles.themeDot} ${selectedTheme === theme.value ? styles.themeDotActive : ''}`}
                                onClick={() => setSelectedTheme(theme.value)}
                            />
                        ))}
                    </div>

                    <div className={styles.fortuneCardWrapper}>
                        <CompatibilityShareCard
                            ref={cardRef}
                            data={compatibility_data}
                            userA={user_a}
                            userB={user_b}
                            scenario={scenario}
                            theme={selectedTheme}
                        />
                    </div>

                    <div className={styles.cardActions}>
                        <button
                            type="button"
                            className={styles.downloadButton}
                            onClick={handleSaveCard}
                            disabled={isSavingCard}
                            data-testid="share-download-button"
                        >
                            <Download size={18} />
                            {isSavingCard ? '저장 중...' : '이미지 저장'}
                        </button>
                        <button
                            type="button"
                            className={styles.shareButton}
                            onClick={handleShareCard}
                            data-testid="share-kakao-button"
                        >
                            <Share2 size={18} />
                            공유하기
                        </button>
                    </div>
                </div>
            )}

            <div className={styles.ctaSection}>
                <div className={styles.freeBadge}>
                    <Gift size={16} />
                    지금 바로 내 사주 확인
                </div>

                <h2 className={styles.ctaTitle}>
                    나도 사주 보고<br />
                    <strong>내 궁합</strong> 확인하기
                </h2>

                <div className={styles.benefitsList}>
                    <div className={styles.benefitItem}>
                        <Star size={16} />
                        <span>AI가 분석하는 정밀 사주풀이</span>
                    </div>
                    <div className={styles.benefitItem}>
                        <Heart size={16} />
                        <span>연인/친구/가족/비즈니스 궁합 분석</span>
                    </div>
                    <div className={styles.benefitItem}>
                        <Zap size={16} />
                        <span>오늘의 운세 & 기운 캘린더</span>
                    </div>
                </div>

                <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={handleStartAnalysis}
                >
                    <Sparkles size={18} />
                    지금 바로 내 사주 분석받기
                </button>

                <p className={styles.ctaSubtext}>
                    가입하면 바로 시작 · 최대 1분
                </p>
            </div>

            <div className={styles.viewCount}>
                <Clock size={14} />
                {view_count}명이 봤어요
            </div>
        </div>
    );
}
