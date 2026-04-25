'use client';

import { useState, useEffect } from 'react';
import { ThumbsUp, History } from 'lucide-react';
import styles from './PastTimeline.module.css';
import { PastTimelineResponse, PastTimelineItem, InteractionType } from '@/types';
import { getPastTimeline } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import GlossaryHighlight from '@/components/GlossaryHighlight';

interface PastTimelineProps {
    profileId: string;
}

const interactionColors: Record<InteractionType, string> = {
    '충': '#EF4444',
    '형': '#F97316',
    '파': '#EAB308',
    '해': '#8B5CF6',
};

const interactionLabels: Record<InteractionType, string> = {
    '충': '충돌',
    '형': '형벌',
    '파': '파괴',
    '해': '해소',
};

function TimelineCard({ item, onFeedback }: { item: PastTimelineItem; onFeedback: (year: number) => void }) {
    const color = interactionColors[item.interaction_type];
    const isStrong = item.severity === '강함';

    return (
        <div 
            className={`${styles.timelineCard} ${isStrong ? styles.strongCard : ''}`}
            style={{ borderLeftColor: isStrong ? color : undefined }}
        >
            <div className={styles.timelineDot} style={{ backgroundColor: color }} />
            <div className={styles.cardContent}>
                <div className={styles.cardHeader}>
                    <span className={styles.year}>{item.year}년</span>
                    <span 
                        className={styles.interactionBadge}
                        style={{ 
                            backgroundColor: `${color}20`,
                            color: color,
                            border: `1px solid ${color}40`,
                        }}
                    >
                        {item.interaction_type} ({interactionLabels[item.interaction_type]})
                    </span>
                </div>
                <div className={styles.ganji}>{item.year_ganji} · {item.type_detail}</div>
                <p className={styles.description}>
                    <GlossaryHighlight text={item.description} />
                </p>
                <div className={styles.cardFooter}>
                    <span 
                        className={styles.severity}
                        style={{ color: isStrong ? color : '#6B7280' }}
                    >
                        {item.severity === '강함' && '● '}
                        {item.severity === '강함' ? '강한 영향' : item.severity === '보통' ? '보통 영향' : '약한 영향'}
                    </span>
                    <button 
                        className={styles.feedbackButton}
                        onClick={() => onFeedback(item.year)}
                    >
                        <ThumbsUp size={14} />
                        맞아요!
                    </button>
                </div>
            </div>
        </div>
    );
}

function SkeletonCard() {
    return (
        <div className={`${styles.timelineCard} ${styles.skeleton}`}>
            <div className={styles.timelineDot} style={{ backgroundColor: '#E5E7EB' }} />
            <div className={styles.cardContent}>
                <div className={styles.skeletonHeader} />
                <div className={styles.skeletonGanji} />
                <div className={styles.skeletonDescription} />
                <div className={styles.skeletonFooter} />
            </div>
        </div>
    );
}

export default function PastTimeline({ profileId }: PastTimelineProps) {
    const { token } = useAuth();
    const [data, setData] = useState<PastTimelineResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [feedbackGiven, setFeedbackGiven] = useState<Set<number>>(new Set());

    useEffect(() => {
        const loadTimeline = async () => {
            try {
                setIsLoading(true);
                const result = await getPastTimeline({ profile_id: profileId }, token || undefined);
                setData(result);
            } catch (err) {
                setError(err instanceof Error ? err.message : '과거 타임라인을 불러오는데 실패했습니다');
            } finally {
                setIsLoading(false);
            }
        };

        if (profileId && profileId.trim()) {
            loadTimeline();
        }
    }, [profileId, token]);

    const handleFeedback = (year: number) => {
        setFeedbackGiven(prev => new Set(prev).add(year));
    };

    if (isLoading) {
        return (
            <div className={styles.container}>
                <div className={styles.sectionHeader}>
                    <History size={20} />
                    <h3>과거 돌아보기</h3>
                </div>
                <div className={styles.timeline}>
                    <div className={styles.timelineLine} />
                    {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
                </div>
            </div>
        );
    }

    // API 실패 시 섹션 자체를 숨김 (데이터 없음 = 에러가 아님)
    if (error || !data || data.total_count === 0) {
        return null;
    }


    return (
        <div className={styles.container}>
            <div className={styles.sectionHeader}>
                <History size={20} />
                <h3>과거 돌아보기</h3>
                <span className={styles.countBadge}>{data.total_count}개</span>
            </div>
            
            <div className={styles.timeline}>
                <div className={styles.timelineLine} />
                {data.conflicts.map((item) => (
                    <TimelineCard 
                        key={item.year} 
                        item={item} 
                        onFeedback={handleFeedback}
                    />
                ))}
            </div>

            {feedbackGiven.size > 0 && (
                <div className={styles.feedbackThanks}>
                    <ThumbsUp size={16} />
                    {feedbackGiven.size}개의 피드백을 주셨어요. 감사합니다!
                </div>
            )}
        </div>
    );
}
