'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './FlowExplorer.module.css';
import {
    BirthInput,
    ContextTopic,
    FlowDailyResponse,
    FlowDetailResponse,
    FlowMonthlyResponse,
    FlowAiAdviceResponse,
    FlowScores,
} from '@/types';
import { getFlowAiAdvice, getFlowDaily, getFlowDetail, getFlowMonthly, getSavedFlowAdvice } from '@/lib/api';
import GlossaryHighlight from './GlossaryHighlight';
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, AlertTriangle, Sparkles, Coins, AlertCircle } from 'lucide-react';
import { usePayment } from '@/contexts/PaymentContext';
import { useAuth } from '@/contexts/AuthContext';

interface FlowExplorerProps {
    birthInput: BirthInput;
    profileId?: string;
}

const CATEGORY_OPTIONS: { key: ContextTopic; label: string }[] = [
    { key: 'general', label: '종합' },
    { key: 'love', label: '연애' },
    { key: 'money', label: '금전' },
    { key: 'career', label: '커리어' },
    { key: 'study', label: '학업' },
    { key: 'health', label: '건강' },
];

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function scoreClass(score: number) {
    if (score >= 60) return styles.badgeGood;
    if (score <= 39) return styles.badgeCaution;
    return styles.badgeNeutral;
}

function scoreBg(score: number) {
    // 히트맵 스타일 - 점수에 따라 색상 강도 변화
    if (score >= 80) return 'rgba(16, 185, 129, 0.5)';  // 진한 초록
    if (score >= 70) return 'rgba(16, 185, 129, 0.35)'; // 초록
    if (score >= 60) return 'rgba(16, 185, 129, 0.2)';  // 연한 초록
    if (score >= 50) return 'rgba(156, 163, 175, 0.15)'; // 회색
    if (score >= 40) return 'rgba(239, 68, 68, 0.15)';   // 연한 빨강
    if (score >= 30) return 'rgba(239, 68, 68, 0.25)';   // 빨강
    return 'rgba(239, 68, 68, 0.4)';                     // 진한 빨강
}

function scoreTextColor(score: number) {
    if (score >= 60) return '#065F46'; // 초록 텍스트
    if (score <= 39) return '#991B1B'; // 빨강 텍스트
    return 'var(--text-secondary)';    // 기본 텍스트
}

export default function FlowExplorer({ birthInput, profileId }: FlowExplorerProps) {
    const router = useRouter();
    const { token } = useAuth();
    const nowYear = useMemo(() => new Date().getFullYear(), []);
    const nowMonth = useMemo(() => new Date().getMonth() + 1, []);

    const { canUseFeature, refreshWallet } = usePayment();
    const { canUse, price } = canUseFeature('flow_ai_advice');
    const [paymentError, setPaymentError] = useState<string | null>(null);

    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 600);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const cardGap = 16;
    const cardWidth = isMobile ? 190 : 264; // 모바일: 190px, 데스크탑: 264px
    const stride = cardWidth + cardGap;

    const [category, setCategory] = useState<ContextTopic>('general');
    const [year, setYear] = useState<number>(nowYear);
    const [selectedMonth, setSelectedMonth] = useState<number>(nowMonth);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);

    const [monthly, setMonthly] = useState<FlowMonthlyResponse | null>(null);
    const [daily, setDaily] = useState<FlowDailyResponse | null>(null);
    const [detail, setDetail] = useState<FlowDetailResponse | null>(null);
    const [aiAdvice, setAiAdvice] = useState<FlowAiAdviceResponse | null>(null);
    const [isSavedAdvice, setIsSavedAdvice] = useState(false);

    const [loadingMonthly, setLoadingMonthly] = useState(false);
    const [loadingDaily, setLoadingDaily] = useState(false);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [loadingAiAdvice, setLoadingAiAdvice] = useState(false);

    const [error, setError] = useState<string | null>(null);
    const [aiError, setAiError] = useState<string | null>(null);

    // 월별 흐름 로드
    useEffect(() => {
        let cancelled = false;
        setLoadingMonthly(true);
        setError(null);

        getFlowMonthly({ birth_input: birthInput, year, category })
            .then((res) => {
                if (cancelled) return;
                setMonthly(res);
            })
            .catch((e) => {
                if (cancelled) return;
                setError(e instanceof Error ? e.message : '월별 흐름을 불러오지 못했습니다.');
                setMonthly(null);
            })
            .finally(() => {
                if (cancelled) return;
                setLoadingMonthly(false);
            });

        return () => {
            cancelled = true;
        };
    }, [birthInput, year, category]);

    // 일별 흐름 로드
    useEffect(() => {
        if (!selectedMonth) return;
        let cancelled = false;

        setLoadingDaily(true);
        setError(null);
        setDaily(null);
        setDetail(null);
        setAiAdvice(null);
        setAiError(null);
        setSelectedDate(null);

        getFlowDaily({ birth_input: birthInput, year, month: selectedMonth, category })
            .then((res) => {
                if (cancelled) return;
                setDaily(res);
                
                const today = new Date();
                if (year === today.getFullYear() && selectedMonth === today.getMonth() + 1) {
                    const todayDay = today.getDate();
                    if (todayDay <= res.points.length) {
                        const todayStr = `${year}-${String(selectedMonth).padStart(2, '0')}-${String(todayDay).padStart(2, '0')}`;
                        setSelectedDate(todayStr);
                    }
                }
            })
            .catch((e) => {
                if (cancelled) return;
                setError(e instanceof Error ? e.message : '일별 흐름을 불러오지 못했습니다.');
                setDaily(null);
            })
            .finally(() => {
                if (cancelled) return;
                setLoadingDaily(false);
            });

        return () => {
            cancelled = true;
        };
    }, [birthInput, year, selectedMonth, category]);

    // 날짜 상세 로드
    useEffect(() => {
        if (!selectedDate) return;
        let cancelled = false;

        setLoadingDetail(true);
        setError(null);
        setDetail(null);
        setAiAdvice(null);
        setIsSavedAdvice(false);
        setAiError(null);

        getFlowDetail({ birth_input: birthInput, date: selectedDate, category })
            .then((res) => {
                if (cancelled) return;
                setDetail(res);
            })
            .catch((e) => {
                if (cancelled) return;
                setError(e instanceof Error ? e.message : '상세 정보를 불러오지 못했습니다.');
                setDetail(null);
            })
            .finally(() => {
                if (cancelled) return;
                setLoadingDetail(false);
            });

        return () => {
            cancelled = true;
        };
    }, [birthInput, selectedDate, category]);

    // 저장된 AI 조언 자동 로드
    useEffect(() => {
        if (!selectedDate || !profileId || !token) return;
        let cancelled = false;

        const loadSavedAdvice = async () => {
            try {
                const saved = await getSavedFlowAdvice(profileId, selectedDate, category, token);
                if (!cancelled && saved.found && saved.advice) {
                    setAiAdvice(saved.advice as FlowAiAdviceResponse);
                    setIsSavedAdvice(true);
                }
            } catch {
                // 저장된 조언 없음 - 버튼으로 새로 생성 가능
            }
        };

        loadSavedAdvice();
        return () => { cancelled = true; };
    }, [selectedDate, category, profileId, token]);

    const selectedCategoryScore = (scores: FlowScores | Record<string, number> | undefined) => {
        if (!scores) return 50;
        const key = category as string;
        return (scores as Record<string, number>)[key] ?? (scores as FlowScores).general ?? 50;
    };

    const handleAiAdvice = async (forceNew = false) => {
        if (!detail) return;
        setPaymentError(null);
        setIsSavedAdvice(false);

        if (profileId && !forceNew) {
            setLoadingAiAdvice(true);
            try {
                const saved = await getSavedFlowAdvice(profileId, detail.date, category, token || undefined);
                if (saved.found && saved.advice) {
                    setAiAdvice(saved.advice);
                    setIsSavedAdvice(true);
                    setLoadingAiAdvice(false);
                    return;
                }
            } catch {
                /* fallthrough to new generation */
            }
            setLoadingAiAdvice(false);
        }

        if (!canUse) {
            setPaymentError(`엽전이 부족합니다. (필요: ${price}엽전)`);
            return;
        }

        setLoadingAiAdvice(true);
        setAiError(null);

        try {
            const res = await getFlowAiAdvice({
                birth_input: birthInput,
                date: detail.date,
                category,
                profile_id: profileId,
            }, token || undefined);
            setAiAdvice(res);
            await refreshWallet();
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : 'AI 조언 생성에 실패했습니다.';
            if (errorMessage.includes('부족') || errorMessage.includes('402')) {
                setPaymentError(errorMessage);
            } else {
                setAiError(errorMessage);
            }
            setAiAdvice(null);
        } finally {
            setLoadingAiAdvice(false);
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.headerRow}>
                <div className={styles.title}>
                    <CalendarDays size={18} color="#4F46E5" />
                    <span>기운 캘린더 (년/월/일)</span>
                </div>

                <div className={styles.controls}>
                    <div className={styles.yearControl}>
                        <button
                            type="button"
                            className={styles.iconButton}
                            onClick={() => setYear((y) => y - 1)}
                            aria-label="이전 해"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <span className={styles.yearText}>{year}년</span>
                        <button
                            type="button"
                            className={styles.iconButton}
                            onClick={() => setYear((y) => y + 1)}
                            aria-label="다음 해"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            </div>

            <div className={styles.chips}>
                {CATEGORY_OPTIONS.map((opt) => (
                    <button
                        key={opt.key}
                        type="button"
                        className={`${styles.chip} ${category === opt.key ? styles.chipActive : ''}`}
                        onClick={() => setCategory(opt.key)}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>

            {error && (
                <div className={styles.errorRow}>
                    <AlertTriangle size={16} />
                    <span>{error}</span>
                </div>
            )}

            {/* 연간 운 흐름 요약 (상단) */}
            {monthly && (monthly.highlights.good_summary || monthly.highlights.caution_summary) && (
                <div className={styles.yearSummarySection}>
                    <div className={styles.yearSummaryCards}>
                        <div className={`${styles.yearSummaryCard} ${styles.goodCard}`}>
                            <Sparkles size={16} />
                            <span className={styles.yearCardLabel}>좋은 구간</span>
                            <span className={styles.yearCardText}>
                                {monthly.highlights.good_summary || '특별히 좋은 구간 없음'}
                            </span>
                        </div>
                        <div className={`${styles.yearSummaryCard} ${styles.cautionCard}`}>
                            <AlertTriangle size={16} />
                            <span className={styles.yearCardLabel}>주의 구간</span>
                            <span className={styles.yearCardText}>
                                {monthly.highlights.caution_summary || '특별히 주의할 구간 없음'}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {loadingMonthly && (
                <div className={styles.loadingRow}>
                    <Loader2 size={16} className={styles.spin} />
                    <span>월별 흐름 계산 중…</span>
                </div>
            )}

            {/* 월별 캐러셀 슬라이더 */}
            {monthly && (
                <div className={styles.carouselContainer}>
                    <div
                        className={styles.carouselTrack}
                        style={{ transform: `translateX(calc(-${selectedMonth - 1} * ${stride}px + 50% - ${stride / 2}px))` }}
                    >
                        {monthly.points.map((p) => {
                            const score = selectedCategoryScore(p.scores);
                            const badgeCls = score >= 60 ? styles.badgeGood : score <= 39 ? styles.badgeCaution : styles.badgeNeutral;
                            const isActive = selectedMonth === p.month;

                            return (
                                <button
                                    type="button"
                                    key={p.month}
                                    className={`${styles.carouselCard} ${isActive ? styles.carouselCardActive : ''}`}
                                    onClick={() => setSelectedMonth(p.month)}
                                    style={{ width: cardWidth }}
                                >
                                    <div className={styles.carouselCardHeader}>
                                        <div className={styles.carouselCardLabel}>{p.label}</div>
                                        <div className={`${styles.scorePill} ${badgeCls}`}>
                                            <span>{p.badge}</span>
                                            <span>{score}</span>
                                        </div>
                                    </div>
                                    <div className={styles.carouselCardGanji}>
                                        <GlossaryHighlight text={p.ganji} />
                                    </div>
                                    {isActive && (
                                        <div className={styles.carouselCardNote}>
                                            <GlossaryHighlight text={p.note} />
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    <button
                        type="button"
                        className={`${styles.carouselArrow} ${styles.carouselArrowLeft}`}
                        onClick={() => setSelectedMonth(m => m > 1 ? m - 1 : 12)}
                        aria-label="이전 월"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <button
                        type="button"
                        className={`${styles.carouselArrow} ${styles.carouselArrowRight}`}
                        onClick={() => setSelectedMonth(m => m < 12 ? m + 1 : 1)}
                        aria-label="다음 월"
                    >
                        <ChevronRight size={20} />
                    </button>
                </div>
            )}

            {/* 월 인디케이터 */}
            {monthly && (
                <div className={styles.monthIndicators}>
                    {monthly.points.map(p => (
                        <button
                            key={p.month}
                            type="button"
                            className={`${styles.monthDot} ${selectedMonth === p.month ? styles.monthDotActive : ''}`}
                            onClick={() => setSelectedMonth(p.month)}
                            aria-label={`${p.month}월`}
                        />
                    ))}
                </div>
            )}

            {/* Daily panel */}
            <div className={styles.panel}>
                <div className={styles.panelTitle}>
                    <h4>
                        {selectedMonth}월 일별 흐름
                    </h4>
                </div>

                {loadingDaily && (
                    <div className={styles.loadingRow}>
                        <Loader2 size={16} className={styles.spin} />
                        <span>일별 흐름 계산 중…</span>
                    </div>
                )}

                {daily && (
                    <>
                        <div className={styles.daySlider}>
                            {daily.points.map((point, idx) => {
                                const day = idx + 1;
                                const score = selectedCategoryScore(point.scores as FlowScores);
                                const isActive = selectedDate === point.date;
                                const dayOfWeek = new Date(daily.year, daily.month - 1, day).getDay();

                                return (
                                    <button
                                        key={point.date}
                                        type="button"
                                        className={`${styles.dayCard} ${isActive ? styles.dayCardActive : ''}`}
                                        style={{ background: scoreBg(score) }}
                                        onClick={() => setSelectedDate(point.date)}
                                    >
                                        <span className={styles.dayWeekday}>{WEEKDAYS[dayOfWeek]}</span>
                                        <span className={styles.dayNumber} style={{ color: scoreTextColor(score) }}>{day}</span>
                                        <span className={styles.dayScore} style={{ color: scoreTextColor(score) }}>{score}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {daily.highlights.caution_summary && (
                            <div className={styles.summaryLine} style={{ marginTop: '6px' }}>
                                <span className={styles.summaryBadge}>주의</span>
                                {daily.highlights.caution_summary}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Detail */}
            {loadingDetail && (
                <div className={styles.loadingRow}>
                    <Loader2 size={16} className={styles.spin} />
                    <span>상세 분석 생성 중…</span>
                </div>
            )}

            {detail && (
                <div className={styles.detail}>
                    <div className={styles.detailHeader}>
                        <div className={styles.detailTitle}>
                            {detail.date} · <GlossaryHighlight text={detail.day_ganji} />
                        </div>
                        <div className={`${styles.scorePill} ${scoreClass(selectedCategoryScore(detail.scores))}`}>
                            <span>{detail.scores[category] ?? detail.scores.general}</span>
                        </div>
                    </div>

                    <div className={styles.detailSummary}>
                        <GlossaryHighlight text={detail.summary} />
                    </div>

                    {detail.why.length > 0 && (
                        <div className={styles.listBox}>
                            <div className={styles.listTitle}>왜 이런 흐름일까?</div>
                            <ul>
                                {detail.why.map((w) => (
                                    <li key={w}>
                                        <GlossaryHighlight text={w} />
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {detail.caution_note && (
                        <div className={styles.detailSummary}>
                            <GlossaryHighlight text={detail.caution_note} />
                        </div>
                    )}

                    {/* AI 조언 버튼 */}
                    {!aiAdvice && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {/* 결제 오류 메시지 */}
                            {paymentError && (
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    padding: '12px 16px', background: '#FEF2F2',
                                    border: '1px solid #FECACA', borderRadius: '12px',
                                    color: '#B91C1C', fontSize: '14px'
                                }}>
                                    <AlertCircle size={16} />
                                    <span style={{ flex: 1 }}>{paymentError}</span>
                                    <button
                                        type="button"
                                        onClick={() => router.push('/charge')}
                                        style={{
                                            background: '#EF4444', color: 'white', border: 'none',
                                            padding: '6px 12px', borderRadius: '6px',
                                            fontSize: '13px', fontWeight: '600', cursor: 'pointer'
                                        }}
                                    >
                                        충전하기
                                    </button>
                                </div>
                            )}

                            <button
                                type="button"
                                className={`btn btn-primary`}
                                style={{ width: '100%', whiteSpace: 'normal', height: 'auto', minHeight: '52px', padding: '12px 16px' }}
                                onClick={() => handleAiAdvice()}
                                disabled={loadingAiAdvice}
                            >
                                {loadingAiAdvice ? (
                                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                        <Loader2 size={18} className={styles.spin} style={{ flexShrink: 0 }} />
                                        <span>AI 분석 중...</span>
                                    </span>
                                ) : isSavedAdvice ? (
                                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <Sparkles size={18} style={{ flexShrink: 0 }} />
                                        <span style={{ textAlign: 'center' }}>저장된 AI 조언 보기</span>
                                    </span>
                                ) : (
                                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <Sparkles size={18} style={{ flexShrink: 0 }} />
                                        <span style={{ textAlign: 'center' }}>AI 상세 조언 받기 ({price}엽전)</span>
                                    </span>
                                )}
                            </button>

                            {/* 가격 안내 */}
                            {!isSavedAdvice && (
                                <p style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                    fontSize: '13px', color: '#6B7280', margin: 0
                                }}>
                                    <Coins size={14} />
                                    AI 상세 조언은 {price}엽전이 필요해요
                                </p>
                            )}
                        </div>
                    )}

                    {aiError && (
                        <div className={styles.errorRow} style={{ marginTop: '10px' }}>
                            <AlertTriangle size={16} />
                            <span>{aiError}</span>
                        </div>
                    )}

                    {aiAdvice && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {(aiAdvice.headline || aiAdvice.summary || aiAdvice.detailed) && (
                                <div className={styles.listBox}>
                                    <div className={styles.listTitle}>{aiAdvice.headline || 'AI 상세 조언'}</div>
                                    {aiAdvice.summary && (
                                        <div className={styles.detailSummary}>
                                            <GlossaryHighlight text={aiAdvice.summary} />
                                        </div>
                                    )}
                                    {aiAdvice.detailed && (
                                        <div className={styles.detailSummary}>
                                            <GlossaryHighlight text={aiAdvice.detailed} />
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className={styles.lists}>
                                <div className={styles.listBox}>
                                    <div className={styles.listTitle}>좋은 점</div>
                                    <ul>
                                        {aiAdvice.good_points.map((v) => (
                                            <li key={v}>
                                                <GlossaryHighlight text={v} />
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className={styles.listBox}>
                                    <div className={styles.listTitle}>조심할 점</div>
                                    <ul>
                                        {aiAdvice.bad_points.map((v) => (
                                            <li key={v}>
                                                <GlossaryHighlight text={v} />
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            <div className={styles.lists}>
                                <div className={styles.listBox}>
                                    <div className={styles.listTitle}>해야 할 것</div>
                                    <ul>
                                        {aiAdvice.do.map((v) => (
                                            <li key={v}>
                                                <GlossaryHighlight text={v} />
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className={styles.listBox}>
                                    <div className={styles.listTitle}>피해야 할 것</div>
                                    <ul>
                                        {aiAdvice.dont.map((v) => (
                                            <li key={v}>
                                                <GlossaryHighlight text={v} />
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            {aiAdvice.disclaimer && (
                                <div className={styles.detailSummary}>
                                    <GlossaryHighlight text={aiAdvice.disclaimer} />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
