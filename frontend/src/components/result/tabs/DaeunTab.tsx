'use client';

import styles from '../ResultTabs.module.css';
import { AlertTriangle, Lightbulb, Orbit, Route, TrendingUp } from 'lucide-react';
import GlossaryHighlight from '@/components/GlossaryHighlight';
import PastTimeline from '../PastTimeline';
import SecondaryGrid from '@/components/result/shared/SecondaryGrid';
import SecondaryCard from '@/components/result/shared/SecondaryCard';
import { ReadingResponse } from '@/types';

interface DaeunTabProps {
    data: ReadingResponse;
    profileId?: string;
}

export default function DaeunTab({ data, profileId }: DaeunTabProps) {
    if (!data.tabs.daeun) return null;

    const fullTextLines = data.tabs.daeun.full_text ? data.tabs.daeun.full_text.split('\n') : [];

    return (
        <div className={styles.daeunTabContainer}>
            <div className={styles.daeunHeaderSection}>
                <h3 className={styles.daeunMainTitle}>
                    <Orbit size={24} />
                    {data.tabs.daeun.summary || '대운 분석'}
                </h3>
                <p className={styles.daeunCurrentBadge}>
                    현재 대운: <strong>{data.tabs.daeun.current_daeun}</strong>
                </p>
            </div>

            {(data.tabs.daeun.season_title || data.tabs.daeun.genre || data.tabs.daeun.progress_percent !== undefined) && (
                <div className={styles.daeunEnhanced}>
                    {data.tabs.daeun.season_title && (
                        <div className={styles.daeunSeasonBanner}>
                            <span className={styles.daeunSeasonTitle}>{data.tabs.daeun.season_title}</span>
                            {data.tabs.daeun.genre && (
                                <span className={styles.daeunGenre}>{data.tabs.daeun.genre}</span>
                            )}
                        </div>
                    )}
                    {data.tabs.daeun.progress_percent !== undefined && (
                        <div className={styles.daeunProgress}>
                            <div className={styles.daeunProgressLabel}>
                                <span>현재 대운 진행률</span>
                                <span>{data.tabs.daeun.progress_percent}%</span>
                            </div>
                            <div className={styles.daeunProgressBar}>
                                <div 
                                    className={styles.daeunProgressFill}
                                    style={{ width: `${data.tabs.daeun.progress_percent}%` }}
                                />
                            </div>
                        </div>
                    )}
                    {data.tabs.daeun.season_ending_preview && (
                        <div className={styles.daeunEndingPreview}>
                            <span className={styles.daeunEndingLabel}>시즌 엔딩 프리뷰</span>
                            <p><GlossaryHighlight text={data.tabs.daeun.season_ending_preview} /></p>
                        </div>
                    )}
                </div>
            )}

            {data.tabs.daeun.full_text && (
                <div className={styles.daeunNarrative}>
                    {fullTextLines.map((line, idx) => {
                        const trimmedLine = line.trim();
                        const lineKey = `${idx}-${trimmedLine || 'blank'}`;
                        if (!trimmedLine) return <br key={lineKey} />;
                        if (trimmedLine.startsWith('### ')) {
                            return <h4 key={lineKey} className={styles.narrativeH4}><GlossaryHighlight text={trimmedLine.slice(4)} /></h4>;
                        }
                        if (trimmedLine.startsWith('## ')) {
                            return <h3 key={lineKey} className={styles.narrativeH3}><GlossaryHighlight text={trimmedLine.slice(3)} /></h3>;
                        }
                        if (trimmedLine.startsWith('> ')) {
                            return <blockquote key={lineKey} className={styles.narrativeQuote}><GlossaryHighlight text={trimmedLine.slice(2)} /></blockquote>;
                        }
                        if (trimmedLine.startsWith('- ')) {
                            return (
                                <div key={lineKey} className={styles.narrativeList}>
                                    <span>•</span>
                                    <span><GlossaryHighlight text={trimmedLine.slice(2)} /></span>
                                </div>
                            );
                        }
                        return <p key={lineKey} className={styles.narrativeText}><GlossaryHighlight text={trimmedLine} /></p>;
                    })}
                </div>
            )}

            {data.tabs.daeun.timeline && data.tabs.daeun.timeline.length > 0 && (
                <div className={styles.daeunTimelineSection}>
                    <h3 className={styles.sectionHeading}><Route size={20} /> 대운의 흐름 (10년 주기)</h3>
                    <div className={styles.daeunTimelineScroll}>
                        {data.tabs.daeun.timeline.map((item) => {
                            const isCurrent = data.tabs.daeun.current_daeun && item.ganji.includes(data.tabs.daeun.current_daeun);
                            const itemKey = `${item.age}-${item.ganji}`;
                            return (
                                <div
                                    key={itemKey}
                                    className={`${styles.daeunCard} ${isCurrent ? styles.currentDaeun : ''}`}
                                >
                                    <div className={styles.daeunHeader}>
                                        <span className={styles.daeunAge}>{item.age}</span>
                                        {isCurrent && <span className={styles.currentBadge}>현재</span>}
                                    </div>
                                    <div className={styles.daeunGanji}><GlossaryHighlight text={item.ganji} /></div>
                                    <div className={styles.daeunTheme}><GlossaryHighlight text={item.theme} /></div>
                                    <div className={styles.daeunDesc}><GlossaryHighlight text={item.description} /></div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {data.tabs.daeun.sections && data.tabs.daeun.sections.length > 0 && (
                <SecondaryGrid columns={1} className={styles.daeunSupportCards}>
                    {data.tabs.daeun.sections.map((section) => {
                        let icon = <Lightbulb size={18} />;
                        let variant: 'default' | 'info' | 'warning' | 'success' | 'metric' = 'default';
                        if (section.type === 'positive') {
                            icon = <TrendingUp size={18} />;
                            variant = 'success';
                        } else if (section.type === 'negative') {
                            icon = <AlertTriangle size={18} />;
                            variant = 'warning';
                        } else if (section.type === 'tip') {
                            icon = <Lightbulb size={18} />;
                            variant = 'info';
                        }
                        return (
                            <SecondaryCard key={section.title} title={section.title.replace(/(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g, '').trim()} icon={icon} variant={variant}>
                                <ul className={styles.supportList}>
                                    {section.items.map((item, index) => (
                                        <li key={`${section.title}-${index}-${item}`}><GlossaryHighlight text={item} /></li>
                                    ))}
                                </ul>
                            </SecondaryCard>
                        );
                    })}
                </SecondaryGrid>
            )}

            {data.tabs.daeun.next_daeun_change && (
                <div className={styles.daeunNextChange}>
                    <AlertTriangle size={16} />
                    <span>다음 대운 변화: {data.tabs.daeun.next_daeun_change}</span>
                </div>
            )}

            {profileId && <PastTimeline profileId={profileId} />}
        </div>
    );
}
