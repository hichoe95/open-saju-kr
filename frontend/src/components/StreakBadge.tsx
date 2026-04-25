'use client';

import { useState, useEffect } from 'react';
import { Flame, Calendar, Trophy, Zap, Award, Target, Gift } from 'lucide-react';
import styles from './StreakBadge.module.css';
import { StreakStatus } from '@/types';
import { getStreakStatus, checkIn } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

interface StreakBadgeProps {
    compact?: boolean;
    onCheckIn?: (coins: number) => void;
}

const tierConfig = {
    bronze: { icon: '3위', label: '브론즈', color: '#CD7F32' },
    silver: { icon: '2위', label: '실버', color: '#C0C0C0' },
    gold: { icon: '1위', label: '골드', color: '#FFD700' },
    diamond: { icon: '/icons/emoji-replacements/misc/streak_gem.png', label: '다이아몬드', color: '#00BFFF' },
};

function getTierInfo(tier: string | null | undefined) {
    if (!tier) return null;
    return tierConfig[tier as keyof typeof tierConfig] || null;
}

export default function StreakBadge({ compact = false, onCheckIn }: StreakBadgeProps) {
    const { user, token } = useAuth();
    const [streak, setStreak] = useState<StreakStatus | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [checkInResult, setCheckInResult] = useState<string | null>(null);

    useEffect(() => {
        if (user && token) {
            loadStreak();
        }
    }, [user, token]); // eslint-disable-line react-hooks/exhaustive-deps

    const loadStreak = async () => {
        try {
            const data = await getStreakStatus(token || undefined);
            setStreak(data);
        } catch (error) {
            console.error('스트릭 로드 실패:', error);
        }
    };

    const handleCheckIn = async () => {
        if (!token || isLoading || streak?.checked_in_today) return;

        setIsLoading(true);
        try {
            const result = await checkIn(token);
            setStreak(result.streak);
            setCheckInResult(result.message);

            if (result.coins_earned > 0 && onCheckIn) {
                onCheckIn(result.coins_earned);
            }

            setTimeout(() => setCheckInResult(null), 3000);
        } catch (error) {
            console.error('출석 체크 실패:', error);
            setCheckInResult('출석 체크에 실패했습니다');
            setTimeout(() => setCheckInResult(null), 3000);
        } finally {
            setIsLoading(false);
        }
    };

    if (!user) return null;

    const tierInfo = getTierInfo(streak?.badge_tier);
    const currentStreak = streak?.current_streak || 0;
    const nextMilestone = streak?.next_milestone;
    const nextMilestoneReward = streak?.next_milestone_reward || 0;
    const progressToNext = nextMilestone 
        ? Math.min(100, (currentStreak / nextMilestone) * 100)
        : 0;
    const daysRemaining = nextMilestone ? nextMilestone - currentStreak : 0;

    if (compact) {
        return (
            <div className={styles.compactBadge}>
                <Flame className={styles.flameIcon} size={16} />
                <span className={styles.streakCount}>{currentStreak}</span>
                {tierInfo && <span className={styles.compactTier}>{tierInfo.icon}</span>}
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.card}>
                <div className={styles.header}>
                    <div className={styles.flameContainer}>
                        <Flame
                            className={`${styles.flame} ${currentStreak > 0 ? styles.flameActive : ''}`}
                            size={32}
                        />
                        <span className={styles.streakNumber}>{currentStreak}</span>
                    </div>
                    <div className={styles.headerText}>
                        <h3 className={styles.title}>연속 출석</h3>
                        <p className={styles.subtitle}>
                            {streak?.checked_in_today ? '오늘 출석 완료!' : '오늘 출석 체크하세요'}
                        </p>
                    </div>
                </div>

                {tierInfo && (
                    <div className={styles.tierSection}>
                        <div className={styles.tierBadge}>
                            <span className={styles.tierIcon}>
                                {streak?.badge_tier === 'diamond' ? (
                                    <img src={tierInfo.icon} alt="diamond" width={24} height={24} />
                                ) : (
                                    tierInfo.icon
                                )}
                            </span>
                            <div className={styles.tierInfo}>
                                <span className={styles.tierLabel}>{tierInfo.label} 등급</span>
                                {streak?.title && (
                                    <span className={styles.tierTitle}>{streak.title}</span>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                <button
                    className={`${styles.checkInButton} ${streak?.checked_in_today ? styles.checkInDone : ''}`}
                    onClick={handleCheckIn}
                    disabled={isLoading || streak?.checked_in_today}
                >
                    {isLoading ? (
                        <span className={styles.loading}>...</span>
                    ) : streak?.checked_in_today ? (
                        <>
                            <Calendar size={18} />
                            <span>출석 완료</span>
                        </>
                    ) : (
                        <>
                            <Zap size={18} />
                            <span>출석 체크</span>
                        </>
                    )}
                </button>

                {checkInResult && (
                    <div className={styles.resultMessage}>
                        {checkInResult}
                    </div>
                )}

                <div className={styles.stats}>
                    <div className={styles.statItem}>
                        <Trophy size={16} className={styles.statIcon} />
                        <span className={styles.statLabel}>최고 기록</span>
                        <span className={styles.statValue}>{streak?.longest_streak || 0}일</span>
                    </div>
                    <div className={styles.statItem}>
                        <Calendar size={16} className={styles.statIcon} />
                        <span className={styles.statLabel}>총 출석</span>
                        <span className={styles.statValue}>{streak?.total_check_ins || 0}회</span>
                    </div>
                    {(streak?.streak_bonus || 0) > 0 && (
                        <div className={styles.statItem}>
                            <Zap size={16} className={styles.statIcon} />
                            <span className={styles.statLabel}>보너스</span>
                            <span className={styles.statValue}>+{streak?.streak_bonus || 0}</span>
                        </div>
                    )}
                </div>

                {nextMilestone && daysRemaining > 0 && (
                    <div className={styles.milestoneSection}>
                        <div className={styles.milestoneHeader}>
                            <Target size={14} />
                            <span>다음 목표</span>
                        </div>
                        <div className={styles.milestoneInfo}>
                            <span className={styles.milestoneTarget}>{nextMilestone}일</span>
                            <span className={styles.milestoneRemaining}>({daysRemaining}일 남음)</span>
                        </div>
                        <div className={styles.milestoneBar}>
                            <div
                                className={styles.milestoneFill}
                                style={{ width: `${progressToNext}%` }}
                            />
                        </div>
                        {nextMilestoneReward > 0 && (
                            <div className={styles.milestoneReward}>
                                <Gift size={12} />
                                <span>달성 시 {nextMilestoneReward} 엽전 획득!</span>
                            </div>
                        )}
                        {streak?.next_milestone_badge && (
                            <div className={styles.milestoneBadge}>
                                <Award size={12} />
                                <span>칭호: {streak.next_milestone_badge}</span>
                            </div>
                        )}
                    </div>
                )}

                <div className={styles.progressSection}>
                    <div className={styles.progressLabel}>
                        <span>7일 연속 목표</span>
                        <span>{currentStreak % 7}/7</span>
                    </div>
                    <div className={styles.progressBar}>
                        <div
                            className={styles.progressFill}
                            style={{ width: `${(currentStreak % 7) / 7 * 100}%` }}
                        />
                    </div>
                    <p className={styles.progressHint}>
                        7일 연속 출석 시 보너스 +10 엽전!
                    </p>
                </div>
            </div>
        </div>
    );
}
