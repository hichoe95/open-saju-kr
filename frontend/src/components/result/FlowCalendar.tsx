'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './FlowCalendar.module.css';
import { ChevronLeft, ChevronRight, Calendar, X, Check, AlertCircle, Loader2 } from 'lucide-react';
import { getFlowDaily, getFlowDetail } from '@/lib/api';
import type { BirthInput, FlowDailyResponse, FlowDetailResponse, FlowScores } from '@/types';
import GlossaryHighlight from '@/components/GlossaryHighlight';

interface FlowCalendarProps {
    profileId: string;
    birthDate: string; // YYYY-MM-DD format
}

interface DayData {
    date: string;
    day: number;
    dayGanji: string;
    scores: FlowScores;
    badge: string;
    isToday: boolean;
}

interface CalendarCell {
    key: string;
    dayData: DayData | null;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const SKELETON_KEYS = Array.from({ length: 35 }, (_, index) => `skeleton-${index + 1}`);

function getScoreColor(score: number): string {
    if (score >= 65) return '#22C55E'; // green
    if (score >= 35) return '#EAB308'; // yellow
    return '#EF4444'; // red
}

function getScoreLabel(score: number): string {
    if (score >= 65) return '좋음';
    if (score >= 35) return '보통';
    return '주의';
}

export default function FlowCalendar({ profileId, birthDate }: FlowCalendarProps) {
    void profileId;
    const today = useMemo(() => new Date(), []);
    const [currentYear, setCurrentYear] = useState(today.getFullYear());
    const [currentMonth, setCurrentMonth] = useState(today.getMonth() + 1);
    
    const [dailyData, setDailyData] = useState<FlowDailyResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [detailData, setDetailData] = useState<FlowDetailResponse | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState<string | null>(null);
    
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Parse birth input from birthDate
    const birthInput: BirthInput = useMemo(() => {
        return {
            birth_solar: birthDate,
            birth_time: '12:00',
            timezone: 'Asia/Seoul',
            birth_place: '대한민국',
            calendar_type: 'solar',
            gender: 'male',
        };
    }, [birthDate]);

    // Load daily flow data
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        
        getFlowDaily({
            birth_input: birthInput,
            year: currentYear,
            month: currentMonth,
            category: 'general',
        })
            .then((res) => {
                if (cancelled) return;
                setDailyData(res);
            })
            .catch((e) => {
                if (cancelled) return;
                setError(e instanceof Error ? e.message : '캘린더를 불러올 수 없습니다');
            })
            .finally(() => {
                if (cancelled) return;
                setLoading(false);
            });
        
        return () => {
            cancelled = true;
        };
    }, [birthInput, currentYear, currentMonth]);

    // Generate calendar days
    const calendarDays = useMemo(() => {
        if (!dailyData) return [];
        
        const firstDayOfMonth = new Date(currentYear, currentMonth - 1, 1).getDay();
        const daysInMonth = dailyData.points.length;
        
        const days: CalendarCell[] = [];
        
        // Empty cells for days before the 1st
        for (let i = 0; i < firstDayOfMonth; i++) {
            days.push({
                key: `empty-${currentYear}-${currentMonth}-${i + 1}`,
                dayData: null,
            });
        }
        
        // Check if this is the current month
        const isCurrentMonth = currentYear === today.getFullYear() && currentMonth === today.getMonth() + 1;
        
        // Generate day data
        for (let day = 1; day <= daysInMonth; day++) {
            const point = dailyData.points[day - 1];
            const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            // Check if today
            const isToday = isCurrentMonth && day === today.getDate();

            days.push({
                key: dateStr,
                dayData: {
                    date: dateStr,
                    day,
                    dayGanji: point.ganji,
                    scores: point.scores,
                    badge: point.badge,
                    isToday,
                },
            });
        }
        
        return days;
    }, [dailyData, currentYear, currentMonth, today]);

    // Navigate months
    const goToPrevMonth = () => {
        if (currentMonth === 1) {
            setCurrentMonth(12);
            setCurrentYear(y => y - 1);
        } else {
            setCurrentMonth(m => m - 1);
        }
    };

    const goToNextMonth = () => {
        if (currentMonth === 12) {
            setCurrentMonth(1);
            setCurrentYear(y => y + 1);
        } else {
            setCurrentMonth(m => m + 1);
        }
    };

    // Handle date click
    const handleDateClick = async (dayData: DayData) => {
        setSelectedDate(dayData.date);
        setDetailData(null);
        setDetailError(null);
        setDetailLoading(true);
        setIsModalOpen(true);
        
        try {
            const detail = await getFlowDetail({
                birth_input: birthInput,
                date: dayData.date,
                category: 'general',
            });
            setDetailData(detail);
        } catch (e) {
            setDetailError(e instanceof Error ? e.message : '상세 정보를 불러올 수 없습니다');
        } finally {
            setDetailLoading(false);
        }
    };

    // Close modal
    const closeModal = () => {
        setIsModalOpen(false);
        setSelectedDate(null);
        setDetailData(null);
        setDetailError(null);
    };

    return (
        <div className={styles.flowCalendarSection}>
            <h3 className={styles.sectionTitle}>
                <Calendar size={20} />
                이번 달 기운 캘린더
            </h3>
            
            {/* Month Navigation */}
            <div className={styles.monthNavigation}>
                <button
                    type="button"
                    className={styles.navButton}
                    onClick={goToPrevMonth}
                    aria-label="이전 달"
                >
                    <ChevronLeft size={20} />
                </button>
                <span className={styles.monthLabel}>
                    {currentYear}년 {currentMonth}월
                </span>
                <button
                    type="button"
                    className={styles.navButton}
                    onClick={goToNextMonth}
                    aria-label="다음 달"
                >
                    <ChevronRight size={20} />
                </button>
            </div>
            
            {/* Weekday Headers */}
            <div className={styles.weekdayHeader}>
                {WEEKDAYS.map(day => (
                    <div key={day} className={styles.weekdayCell}>
                        {day}
                    </div>
                ))}
            </div>
            
            {/* Calendar Grid */}
            {loading ? (
                <div className={styles.skeletonGrid}>
                    {SKELETON_KEYS.map((key) => (
                        <div key={key} className={styles.skeletonCell} />
                    ))}
                </div>
            ) : error ? (
                <div className={styles.errorMessage}>
                    <AlertCircle size={16} />
                    <span>{error}</span>
                </div>
            ) : (
                <div className={styles.calendarGrid}>
                    {calendarDays.map(({ key, dayData }) => (
                        dayData ? (
                            <button
                                key={key}
                                type="button"
                                className={`${styles.dayCell} ${dayData.isToday ? styles.dayCellToday : ''}`}
                                onClick={() => handleDateClick(dayData)}
                            >
                                <span className={styles.dayNumber}>{dayData.day}</span>
                                <div
                                    className={styles.scoreDot}
                                    style={{
                                        backgroundColor: getScoreColor(dayData.scores.general),
                                    }}
                                />
                            </button>
                        ) : (
                            <div key={key} className={styles.dayCell} aria-hidden="true" />
                        )
                    ))}
                </div>
            )}
            
            {/* Legend */}
            <div className={styles.legend}>
                <div className={styles.legendItem}>
                    <div className={styles.legendDot} style={{ backgroundColor: '#22C55E' }} />
                    <span>좋음 (65+)</span>
                </div>
                <div className={styles.legendItem}>
                    <div className={styles.legendDot} style={{ backgroundColor: '#EAB308' }} />
                    <span>보통 (35-64)</span>
                </div>
                <div className={styles.legendItem}>
                    <div className={styles.legendDot} style={{ backgroundColor: '#EF4444' }} />
                    <span>주의 (&lt;35)</span>
                </div>
            </div>
            
            {/* Modal */}
            {isModalOpen && (
                <div className={styles.modalOverlay}>
                    <button
                        type="button"
                        className={styles.modalBackdrop}
                        onClick={closeModal}
                        aria-label="모달 닫기"
                    />
                    <div
                        className={styles.modalContent}
                        onClick={e => e.stopPropagation()}
                        onKeyDown={e => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                    >
                        <div className={styles.modalHeader}>
                            <h4 className={styles.modalTitle}>
                                {selectedDate ? (
                                    <>
                                        {selectedDate}
                                        {detailData && (
                                            <span className={styles.modalGanji}>
                                                <GlossaryHighlight text={detailData.day_ganji} />
                                            </span>
                                        )}
                                    </>
                                ) : '날짜 정보'}
                            </h4>
                            <button
                                type="button"
                                className={styles.modalClose}
                                onClick={closeModal}
                                aria-label="닫기"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className={styles.modalBody}>
                            {detailLoading ? (
                                <div className={styles.modalLoading}>
                                    <Loader2 size={24} className={styles.spin} />
                                    <span>상세 정보 로딩 중...</span>
                                </div>
                            ) : detailError ? (
                                <div className={styles.modalError}>
                                    <AlertCircle size={16} />
                                    <span>{detailError}</span>
                                </div>
                            ) : detailData ? (
                                <>
                                    {/* Overall Score */}
                                    <div className={styles.scoreSection}>
                                        <div
                                            className={styles.scoreBadge}
                                            style={{
                                                backgroundColor: getScoreColor(detailData.scores.general),
                                            }}
                                        >
                                            {detailData.scores.general}점
                                            <span className={styles.scoreLabel}>
                                                {getScoreLabel(detailData.scores.general)}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    {/* Category Scores */}
                                    <div className={styles.categoryScores}>
                                        {Object.entries(detailData.scores)
                                            .filter(([key]) => key !== 'general')
                                            .map(([key, score]) => (
                                                <div key={key} className={styles.categoryItem}>
                                                    <span className={styles.categoryName}>
                                                        {key === 'love' && '연애'}
                                                        {key === 'money' && '금전'}
                                                        {key === 'career' && '커리어'}
                                                        {key === 'health' && '건강'}
                                                        {key === 'study' && '학업'}
                                                    </span>
                                                    <div className={styles.categoryBar}>
                                                        <div
                                                            className={styles.categoryFill}
                                                            style={{
                                                                width: `${score}%`,
                                                                backgroundColor: getScoreColor(score),
                                                            }}
                                                        />
                                                    </div>
                                                    <span className={styles.categoryValue}>{score}</span>
                                                </div>
                                            ))}
                                    </div>
                                    
                                    {/* Summary */}
                                    {detailData.summary && (
                                        <div className={styles.summarySection}>
                                            <p><GlossaryHighlight text={detailData.summary} /></p>
                                        </div>
                                    )}
                                    
                                    {/* Do List */}
                                    {detailData.do.length > 0 && (
                                        <div className={styles.listSection}>
                                            <h5 className={styles.listTitleDo}>
                                                <Check size={14} />
                                                해야 할 것
                                            </h5>
                                            <ul className={styles.list}>
                                                {detailData.do.map((item) => (
                                                    <li key={`do-${item}`} className={styles.listItemDo}>
                                                        <GlossaryHighlight text={item} />
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    
                                    {/* Don't List */}
                                    {detailData.dont.length > 0 && (
                                        <div className={styles.listSection}>
                                            <h5 className={styles.listTitleDont}>
                                                <X size={14} />
                                                피해야 할 것
                                            </h5>
                                            <ul className={styles.list}>
                                                {detailData.dont.map((item) => (
                                                    <li key={`dont-${item}`} className={styles.listItemDont}>
                                                        <GlossaryHighlight text={item} />
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className={styles.lockMessage}>
                                    <AlertCircle size={32} />
                                    <p>상세 정보를 불러오지 못했습니다</p>
                                    <span>잠시 후 다시 시도해 주세요</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
