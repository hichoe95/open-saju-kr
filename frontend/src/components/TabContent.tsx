'use client';

import { ReactNode } from 'react';
import styles from './TabContent.module.css';
import GlossaryHighlight from './GlossaryHighlight';
import { TrendingUp, AlertTriangle, Lightbulb, History as HistoryIcon, Target, Rocket } from 'lucide-react';

const stripEmoji = (text: string) => {
    return text.replace(/(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g, '').trim();
};

interface Section {
    title: string;
    items: string[];
    type: 'positive' | 'negative' | 'tip';
}

interface TimelineData {
    past: string;
    present: string;
    future: string;
}

interface TabContentProps {
    title: string;
    icon: ReactNode;  // lucide 아이콘 컴포넌트
    summary: string;
    full_text?: string;
    timeline?: TimelineData;
    sections: Section[];
    extra?: ReactNode;
    note?: string;
    children?: ReactNode;
}

export default function TabContent({
    title,
    icon,
    summary,
    full_text,
    timeline,
    sections,
    extra,
    note,
    children,
}: TabContentProps) {
    const fullTextLines = full_text ? full_text.split('\n') : [];

    return (
        <div className={styles.container}>
            <h3 className={styles.title}>
                <span className={styles.titleIcon}>{icon}</span>
                {title}
            </h3>

            {summary && (
                <p className={styles.summary}>
                    <GlossaryHighlight text={summary} />
                </p>
            )}

            {full_text ? (
                <div className={styles.fullText}>
                    {fullTextLines.map((line, idx) => {
                        const trimmedLine = line.trim();
                        const lineKey = `${idx}-${trimmedLine || 'blank'}`;

                        // 빈 줄 처리
                        if (!trimmedLine) {
                            return <br key={lineKey} />;
                        }

                        // ### 헤더 처리
                        if (trimmedLine.startsWith('### ')) {
                            return (
                                <h4 key={lineKey} style={{
                                    fontSize: '16px',
                                    fontWeight: '700',
                                    marginTop: '24px',
                                    marginBottom: '12px',
                                    color: '#1F2937'
                                }}>
                                    <GlossaryHighlight text={trimmedLine.slice(4)} />
                                </h4>
                            );
                        }

                        // ## 헤더 처리
                        if (trimmedLine.startsWith('## ')) {
                            return (
                                <h3 key={lineKey} style={{
                                    fontSize: '18px',
                                    fontWeight: '700',
                                    marginTop: '28px',
                                    marginBottom: '14px',
                                    color: '#111827'
                                }}>
                                    <GlossaryHighlight text={trimmedLine.slice(3)} />
                                </h3>
                            );
                        }

                        // > 인용문 처리
                        if (trimmedLine.startsWith('> ')) {
                            return (
                                <blockquote key={lineKey} style={{
                                    borderLeft: '4px solid #6366F1',
                                    paddingLeft: '16px',
                                    margin: '16px 0',
                                    fontStyle: 'italic',
                                    color: '#4B5563'
                                }}>
                                    <GlossaryHighlight text={trimmedLine.slice(2)} />
                                </blockquote>
                            );
                        }

                        // - 리스트 처리
                        if (trimmedLine.startsWith('- ')) {
                            return (
                                <div key={lineKey} style={{
                                    display: 'flex',
                                    gap: '8px',
                                    marginBottom: '8px',
                                    paddingLeft: '8px'
                                }}>
                                    <span>•</span>
                                    <span><GlossaryHighlight text={trimmedLine.slice(2)} /></span>
                                </div>
                            );
                        }

                        // 숫자 리스트 처리 (1. 2. 3.)
                        const numListMatch = trimmedLine.match(/^(\d+)\.\s+(.+)$/);
                        if (numListMatch) {
                            return (
                                <div key={lineKey} style={{
                                    display: 'flex',
                                    gap: '8px',
                                    marginBottom: '8px',
                                    paddingLeft: '8px'
                                }}>
                                    <span style={{ color: '#6366F1', fontWeight: '600' }}>{numListMatch[1]}.</span>
                                    <span><GlossaryHighlight text={numListMatch[2]} /></span>
                                </div>
                            );
                        }

                        // 일반 텍스트
                        return (
                            <p key={lineKey} style={{ marginBottom: '8px', lineHeight: '1.8' }}>
                                <GlossaryHighlight text={trimmedLine} />
                            </p>
                        );
                    })}
                </div>
            ) : (
                <div className={styles.fullText} style={{ color: 'var(--color-text-muted)' }}>
                    상세 분석 데이터가 없습니다.
                </div>
            )}

            {/* 타임라인 섹션 추가 */}
            {timeline && (
                <div className={styles.timeline}>
                    <div className={styles.timelineTitle}>
                        ⏳ 시간 흐름 분석 (Timeline)
                    </div>
                    <div className={styles.timelineGrid}>
                        {/* 과거 */}
                        <div className={`${styles.timelineCard} ${styles.past}`}>
                            <div className={styles.timelineHeader}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><HistoryIcon size={16} /> Past</span>
                            </div>
                            <div className={styles.timelineText}>
                                <GlossaryHighlight text={timeline.past} />
                            </div>
                        </div>

                        {/* 현재 */}
                        <div className={`${styles.timelineCard} ${styles.present}`}>
                            <div className={styles.timelineHeader}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Target size={16} /> Present</span>
                                <span className={styles.pulseDot} />
                            </div>
                            <div className={styles.timelineText}>
                                <GlossaryHighlight text={timeline.present} />
                            </div>
                        </div>

                        {/* 미래 */}
                        <div className={`${styles.timelineCard} ${styles.future}`}>
                            <div className={styles.timelineHeader}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Rocket size={16} /> Future</span>
                            </div>
                            <div className={styles.timelineText}>
                                <GlossaryHighlight text={timeline.future} />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className={styles.sections}>
                {sections.map((section) => (
                    <div
                        key={`${section.type}-${section.title}`}
                        className={`${styles.section} ${styles[section.type]}`}
                    >
                        <h4>
                            {section.type === 'positive' && <TrendingUp size={18} />}
                            {section.type === 'negative' && <AlertTriangle size={18} />}
                            {section.type === 'tip' && <Lightbulb size={18} />}
                            {stripEmoji(section.title)}
                        </h4>
                        <ul>
                            {section.items.map((item, j) => (
                                <li key={`${section.title}-${j}-${item}`}>
                                    <GlossaryHighlight text={item} />
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
            {children}

            {extra && (
                <div className={styles.secondaryCards}>
                    {extra}
                </div>
            )}

            {note && (
                <div className={styles.note} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    <span style={{ flexShrink: 0, marginTop: '2px' }}><AlertTriangle size={16} /></span>
                    <div style={{ flex: 1 }}><GlossaryHighlight text={note} /></div>
                </div>
            )}
        </div>
    );
}
