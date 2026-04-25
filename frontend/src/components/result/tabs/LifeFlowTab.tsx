'use client';

import { useState } from 'react';
import styles from '../ResultTabs.module.css';
import { TrendingUp, Calendar, ChevronLeft, ChevronRight, CalendarDays, Briefcase, Coins, Heart, Activity } from 'lucide-react';
import FlowExplorer from '@/components/FlowExplorer';
import GlossaryHighlight from '@/components/GlossaryHighlight';
import SecondaryGrid from '@/components/result/shared/SecondaryGrid';
import SecondaryCard from '@/components/result/shared/SecondaryCard';
import { Settings } from 'lucide-react';
import { ReadingResponse, BirthInput } from '@/types';

interface LifeFlowTabProps {
    data: ReadingResponse;
    birthInput?: BirthInput | null;
    profileId?: string;
}

export default function LifeFlowTab({ data, birthInput, profileId }: LifeFlowTabProps) {
    const [yearSlideIndex, setYearSlideIndex] = useState(0);
    const [monthSlideIndex, setMonthSlideIndex] = useState(0);

    return (
        <div className={styles.lifeTab}>
            <h3><TrendingUp size={24} /> 인생 흐름</h3>

            {birthInput && (
                <FlowExplorer birthInput={birthInput} profileId={profileId} />
            )}

            {/* 연간 흐름 슬라이더 */}
            {data.tabs.life_flow.years.length > 0 && (
                <div className={styles.yearsFlow}>
                    <h4 className={styles.sectionHeading}><Calendar size={18} /> 연간 흐름</h4>
                    <div className={styles.sliderWrapper}>
                        <button
                            type="button"
                            className={styles.sliderBtn}
                            onClick={() => setYearSlideIndex(i => Math.max(0, i - 1))}
                            disabled={yearSlideIndex === 0}
                        >
                            <ChevronLeft size={20} />
                        </button>
                        <div className={styles.sliderTrack}>
                            <div
                                className={styles.sliderInner}
                                style={{ transform: `translateX(-${yearSlideIndex * 100}%)` }}
                            >
                                {data.tabs.life_flow.years.map((y, i) => (
                                    <div key={i} className={styles.slideCard}>
                                        <div className={styles.slideCardHeader}>
                                            <span className={styles.slideCardYear}>{y.year}</span>
                                            {y.weather_icon && (
                                                <span className={styles.yearWeatherIcon}>{y.weather_icon}</span>
                                            )}
                                        </div>
                                        <div className={styles.slideCardTheme}>
                                            <GlossaryHighlight text={y.theme} />
                                        </div>
                                        <div className={styles.slideCardContent}>
                                            {y.strategy && (
                                                <div className={styles.slideCardStrategy}>
                                                    <span className={styles.slideCardLabel}>전략</span>
                                                    <p><GlossaryHighlight text={y.strategy} /></p>
                                                </div>
                                            )}
                                            <div className={styles.slideCardRow}>
                                                <span className={styles.slideCardLabel}>리스크</span>
                                                <p><GlossaryHighlight text={y.risk} /></p>
                                            </div>
                                            <div className={styles.slideCardRow}>
                                                <span className={styles.slideCardLabel}>팁</span>
                                                <p><GlossaryHighlight text={y.tip} /></p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <button
                            type="button"
                            className={styles.sliderBtn}
                            onClick={() => setYearSlideIndex(i => Math.min(data.tabs.life_flow.years.length - 1, i + 1))}
                            disabled={yearSlideIndex >= data.tabs.life_flow.years.length - 1}
                        >
                            <ChevronRight size={20} />
                        </button>
                    </div>
                    <div className={styles.sliderDots}>
                        {data.tabs.life_flow.years.map((_, i) => (
                            <button
                                key={i}
                                type="button"
                                className={`${styles.sliderDot} ${yearSlideIndex === i ? styles.sliderDotActive : ''}`}
                                onClick={() => setYearSlideIndex(i)}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* 월별 흐름 슬라이더 */}
            {data.tabs.life_flow.monthly_optional && data.tabs.life_flow.monthly_optional.length > 0 && (
                <div className={styles.monthlyFlow}>
                    <h4><CalendarDays size={18} className={styles.inlineIcon} /> 2026년 월별 흐름</h4>
                    <div className={styles.sliderWrapper}>
                        <button
                            type="button"
                            className={styles.sliderBtn}
                            onClick={() => setMonthSlideIndex(i => Math.max(0, i - 1))}
                            disabled={monthSlideIndex === 0}
                        >
                            <ChevronLeft size={20} />
                        </button>
                        <div className={styles.sliderTrack}>
                            <div
                                className={styles.sliderInner}
                                style={{ transform: `translateX(-${monthSlideIndex * 100}%)` }}
                            >
                                {data.tabs.life_flow.monthly_optional.map((m, i) => (
                                    <div key={i} className={styles.slideCard}>
                                        <div className={styles.slideCardHeader}>
                                            <span className={styles.monthRange}>{m.range}</span>
                                            <span className={styles.monthGanji}>{m.ganji}</span>
                                        </div>
                                        <div className={styles.slideCardContent}>
                                            <div className={styles.monthItem}>
                                                <span className={styles.monthLabel}><Briefcase size={14} /> 직장/학업</span>
                                                <p><GlossaryHighlight text={m.work} /></p>
                                            </div>
                                            <div className={styles.monthItem}>
                                                <span className={styles.monthLabel}><Coins size={14} /> 금전</span>
                                                <p><GlossaryHighlight text={m.money} /></p>
                                            </div>
                                            <div className={styles.monthItem}>
                                                <span className={styles.monthLabel}><Heart size={14} /> 연애</span>
                                                <p><GlossaryHighlight text={m.love} /></p>
                                            </div>
                                            <div className={styles.monthItem}>
                                                <span className={styles.monthLabel}><Activity size={14} /> 건강</span>
                                                <p><GlossaryHighlight text={m.health} /></p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <button
                            type="button"
                            className={styles.sliderBtn}
                            onClick={() => setMonthSlideIndex(i => Math.min(data.tabs.life_flow.monthly_optional!.length - 1, i + 1))}
                            disabled={monthSlideIndex >= data.tabs.life_flow.monthly_optional!.length - 1}
                        >
                            <ChevronRight size={20} />
                        </button>
                    </div>
                    <div className={styles.sliderDots}>
                        {data.tabs.life_flow.monthly_optional.map((_, i) => (
                            <button
                                key={i}
                                type="button"
                                className={`${styles.sliderDot} ${monthSlideIndex === i ? styles.sliderDotActive : ''}`}
                                onClick={() => setMonthSlideIndex(i)}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* 운 메커니즘 (맨 아래) */}
            {data.tabs.life_flow.mechanism.length > 0 && (
                <SecondaryGrid columns={1} className={styles.mechanismGrid}>
                    <SecondaryCard title="운 메커니즘" icon={<Settings size={18} />} variant="info">
                        <ul className={styles.mechanismList}>
                            {data.tabs.life_flow.mechanism.map((m, i) => (
                                <li key={i}>
                                    <GlossaryHighlight text={m} />
                                </li>
                            ))}
                        </ul>
                    </SecondaryCard>
                </SecondaryGrid>
            )}
        </div>
    );
}
