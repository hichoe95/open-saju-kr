'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toPng } from 'html-to-image';
import { ReadingResponse, BirthInput } from '@/types';
import { getSharedSaju, requestQuickCompatibility, saveReceivedProfile } from '@/lib/api';
import SajuCard from '@/components/SajuCard';
import FortuneShareCard, { CardTheme } from '@/components/FortuneShareCard';
import ReferralCTA from '@/components/ReferralCTA';
import ImageHero from '@/components/result/shared/ImageHero';
import styles from './page.module.css';
import {
    Link2, CheckCircle, Clock, User, Calendar, AlertCircle,
    Download, Share2, ChevronLeft, ChevronRight, Image as ImageIcon, Sparkles,
} from 'lucide-react';
import { getBirthTimeDisplay } from '@/utils/jijiTime';
import { clearProgressInput, getProgressInput, getRecentInput, saveProgressInput, saveRecentInput } from '@/utils/cachedInput';
import { trackShareViewed, trackPageView, getSessionId } from '@/lib/analytics';
import { jijiToTime, timeToJijiKey } from '@/utils/jijiTime';

const THEMES: { value: CardTheme; label: string; iconPath: string }[] = [
    { value: 'gradient', label: '그라데이션', iconPath: '/icons/emoji-replacements/themes/gradient.png' },
    { value: 'minimal', label: '미니멀', iconPath: '/icons/emoji-replacements/themes/minimal.png' },
    { value: 'dark', label: '다크', iconPath: '/icons/emoji-replacements/themes/dark.png' },
    { value: 'traditional', label: '전통', iconPath: '/icons/emoji-replacements/themes/traditional.png' },
    { value: 'cute', label: '큐트', iconPath: '/icons/emoji-replacements/themes/cute.png' },
];

type ViewMode = 'saju' | 'card';

const cachedShareInput = typeof window !== 'undefined'
    ? getProgressInput() ?? getRecentInput()
    : null;

interface SharePageClientProps {
    shareCode: string;
}

export default function SharePageClient({ shareCode }: SharePageClientProps) {
    const router = useRouter();

    const [shareData, setShareData] = useState<{
        share_code: string;
        sharer_name: string | null;
        birth_input: BirthInput;
        reading_data: ReadingResponse;
        created_at: string;
        view_count: number;
    } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [compatError, setCompatError] = useState<string | null>(null);
    const [isSaved, setIsSaved] = useState(false);

    const [formName, setFormName] = useState(cachedShareInput?.name ?? '');
    const [formBirthSolar, setFormBirthSolar] = useState(cachedShareInput?.birth_solar ?? '1990-01-01');
    const [formBirthTime, setFormBirthTime] = useState(cachedShareInput?.birth_jiji ? jijiToTime(cachedShareInput.birth_jiji) : '12:00');
    const [formGender, setFormGender] = useState<'male' | 'female'>(cachedShareInput?.gender ?? 'female');
    const [isCompatLoading, setIsCompatLoading] = useState(false);

    const [viewMode, setViewMode] = useState<ViewMode>('saju');
    const [selectedTheme, setSelectedTheme] = useState<CardTheme>('gradient');
    const [isSavingCard, setIsSavingCard] = useState(false);
    const cardRef = useRef<HTMLDivElement>(null);

    const persistCompatibilityInput = useCallback(() => {
        const isDefaultState = !formName && formBirthSolar === '1990-01-01' && formBirthTime === '12:00' && formGender === 'female';
        if (isDefaultState) {
            return;
        }

        saveProgressInput({
            name: formName || undefined,
            birth_solar: formBirthSolar,
            birth_jiji: timeToJijiKey(formBirthTime),
            calendar_type: 'solar',
            gender: formGender,
        });
    }, [formBirthSolar, formBirthTime, formGender, formName]);

    useEffect(() => {
        persistCompatibilityInput();
    }, [persistCompatibilityInput]);

    useEffect(() => {
        const fetchShare = async () => {
            try {
                const data = await getSharedSaju(shareCode);

                const processedData = {
                    ...data,
                    birth_input: data.birth_input as unknown as BirthInput,
                    reading_data: data.reading_data as unknown as ReadingResponse,
                };

                setShareData(processedData);

                try {
                    await saveReceivedProfile(undefined, data.share_code);
                    setIsSaved(true);
                } catch {
                }

                trackShareViewed(shareCode, getSessionId());
                trackPageView('share_received', { share_code: shareCode });
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

    const handleCompatSubmit = async () => {
        if (!formBirthSolar) {
            alert('생년월일을 입력해주세요.');
            return;
        }

        setIsCompatLoading(true);
        setCompatError(null);

        try {
            saveRecentInput({
                name: formName || undefined,
                birth_solar: formBirthSolar,
                birth_jiji: timeToJijiKey(formBirthTime),
                calendar_type: 'solar',
                gender: formGender,
            });
            clearProgressInput();
            const result = await requestQuickCompatibility({
                share_code: shareCode,
                user_b: {
                    name: formName || undefined,
                    birth_solar: formBirthSolar,
                    birth_time: formBirthTime || '12:00',
                    timezone: 'Asia/Seoul',
                    birth_place: '대한민국',
                    gender: formGender,
                    calendar_type: 'solar',
                },
            });

            sessionStorage.setItem('quickCompatResult', JSON.stringify(result));
            router.push(`/share/${shareCode}/compatibility`);
        } catch (err) {
            setCompatError(err instanceof Error ? err.message : '궁합 분석에 실패했습니다');
        } finally {
            setIsCompatLoading(false);
        }
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
            link.download = `fortune_card_${shareCode}.png`;
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
            const file = new File([blob], 'fortune_card.png', { type: 'image/png' });

            if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: '사주 운세 카드',
                    text: '친구가 보낸 사주 운세카드입니다',
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
                <p>공유된 사주를 불러오는 중...</p>
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

    const { birth_input, reading_data, sharer_name, view_count } = shareData;

    return (
        <div className={styles.container} data-testid="shared-saju-page">
            <div className={styles.banner}>
                {reading_data.saju_image_base64 ? (
                    <ImageHero imageBase64={reading_data.saju_image_base64} />
                ) : (
                    <div className={styles.bannerIcon}>
                        <Link2 size={24} />
                    </div>
                )}
                <div className={styles.bannerContent}>
                    <span className={styles.shareTag}>공유받은 사주</span>
                    <h1 className={styles.sharerName}>
                        <User size={18} />
                        {sharer_name || '익명'}님의 사주
                    </h1>
                    <p className={styles.birthInfo}>
                        <Calendar size={14} />
                        {birth_input.birth_solar} {getBirthTimeDisplay(birth_input)}
                    </p>
                </div>
                {isSaved && (
                    <div className={styles.savedBadge}>
                        <CheckCircle size={14} />
                        저장됨
                    </div>
                )}
            </div>

            <div className={styles.oneLiner}>
                <span className={styles.quoteIcon}>&ldquo;</span>
                {reading_data.one_liner}
                <span className={styles.quoteIcon}>&rdquo;</span>
            </div>

            <div className={styles.compatSection}>
                <h2 className={styles.compatTitle}>
                    <strong>{sharer_name || '친구'}</strong>님과 나의 궁합은?
                </h2>

                <div className={styles.formGroup}>
                    <div className={styles.inputRow}>
                        <label htmlFor="share-compat-name">이름 (선택)</label>
                        <input
                            id="share-compat-name"
                            type="text"
                            className={styles.inputField}
                            placeholder="내 이름"
                            value={formName}
                            onChange={(event) => setFormName(event.target.value)}
                        />
                    </div>

                    <div className={styles.inputRow}>
                        <label htmlFor="share-compat-birth-solar">생년월일</label>
                        <input
                            id="share-compat-birth-solar"
                            type="date"
                            className={styles.inputField}
                            value={formBirthSolar}
                            onChange={(event) => setFormBirthSolar(event.target.value)}
                            required
                        />
                    </div>

                    <div className={styles.inputRow}>
                        <label htmlFor="share-compat-birth-time">태어난 시간 (모르면 12:00)</label>
                        <input
                            id="share-compat-birth-time"
                            type="time"
                            className={styles.inputField}
                            value={formBirthTime}
                            onChange={(event) => setFormBirthTime(event.target.value)}
                        />
                    </div>

                    <div className={styles.inputRow}>
                        <span className={styles.inputLabel}>성별</span>
                        <div className={styles.genderToggle}>
                            <button
                                type="button"
                                className={`${styles.genderBtn} ${formGender === 'male' ? styles.genderBtnActive : ''}`}
                                onClick={() => setFormGender('male')}
                            >
                                남성
                            </button>
                            <button
                                type="button"
                                className={`${styles.genderBtn} ${formGender === 'female' ? styles.genderBtnActive : ''}`}
                                onClick={() => setFormGender('female')}
                            >
                                여성
                            </button>
                        </div>
                    </div>

                    <button
                        type="button"
                        className={styles.submitBtn}
                        onClick={handleCompatSubmit}
                        disabled={isCompatLoading}
                    >
                        <Sparkles size={18} />
                        {isCompatLoading ? '분석 중...' : '궁합 확인하기'}
                    </button>
                    {compatError && (
                        <p className={styles.subtext} style={{ color: 'var(--color-error, #e74c3c)', marginTop: '8px' }}>
                            {compatError}
                        </p>
                    )}
                    <p className={styles.subtext}>지금 바로 내 사주 확인 · 최대 1분</p>
                </div>
            </div>

            <ReferralCTA variant="inline" surface="share_reading" />

            <details className={styles.detailsSection}>
                <summary className={styles.detailsSummary}>
                    <span>{sharer_name || '친구'}님의 사주 더보기</span>
                </summary>
                <div className={styles.detailsContent}>
                    <div className={styles.viewTabs}>
                        <button
                            type="button"
                            className={`${styles.viewTab} ${viewMode === 'saju' ? styles.viewTabActive : ''}`}
                            onClick={() => setViewMode('saju')}
                        >
                            <Sparkles size={16} />
                            사주 팔자
                        </button>
                        <button
                            type="button"
                            className={`${styles.viewTab} ${viewMode === 'card' ? styles.viewTabActive : ''}`}
                            onClick={() => setViewMode('card')}
                        >
                            <ImageIcon size={16} />
                            운세 카드
                        </button>
                    </div>

                    {viewMode === 'saju' && (
                        <div className={styles.cardPreview}>
                            <SajuCard pillars={reading_data.pillars} card={reading_data.card} />
                        </div>
                    )}

                    {viewMode === 'card' && (
                        <div className={styles.fortuneCardSection}>
                            <div className={styles.themeSelector}>
                                <button type="button" className={styles.themeNavBtn} onClick={handleThemePrev}>
                                    <ChevronLeft size={20} />
                                </button>
                                <div className={styles.themeLabel}>
                                    <img
                                        className={styles.themeEmoji}
                                        src={currentTheme.iconPath}
                                        width={20}
                                        height={20}
                                        alt=""
                                        loading="eager"
                                    />
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
                                <FortuneShareCard
                                    ref={cardRef}
                                    data={reading_data}
                                    birthInput={birth_input}
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
                </div>
            </details>

            <div className={styles.viewCount}>
                <Clock size={14} />
                {view_count}명이 봤어요
            </div>
        </div>
    );
}
