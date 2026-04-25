'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    CalendarCheck,
    Sparkles,
    Share2,
    Calendar,
    MessageCircle,
    Check,
    Gift,
    ChevronRight,
} from 'lucide-react';
import styles from './DailyMissionWidget.module.css';
import PushOptInPrompt from './PushOptInPrompt';
import { DailyMission } from '@/types';
import { getDailyMissions, completeMission } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

// 미션 아이콘 매핑
const MISSION_ICONS: Record<string, React.ReactNode> = {
    'calendar-check': <CalendarCheck size={20} />,
    'sparkles': <Sparkles size={20} />,
    'share': <Share2 size={20} />,
    'calendar': <Calendar size={20} />,
    'message-circle': <MessageCircle size={20} />,
};

interface DailyMissionWidgetProps {
    onCoinsEarned?: (coins: number) => void;
    compact?: boolean;
}

export default function DailyMissionWidget({ onCoinsEarned, compact = false }: DailyMissionWidgetProps) {
    const { user, token } = useAuth();
    const [missions, setMissions] = useState<DailyMission[]>([]);
    const [totalReward, setTotalReward] = useState(0);
    const [completedCount, setCompletedCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [completingId, setCompletingId] = useState<string | null>(null);
    const [pushPromptNonce, setPushPromptNonce] = useState(0);

    const loadMissions = useCallback(async () => {
        try {
            setIsLoading(true);
            const data = await getDailyMissions(token || undefined);
            setMissions(data.missions);
            setTotalReward(data.total_reward);
            setCompletedCount(data.completed_count);
        } catch (error) {
            console.error('미션 로드 실패:', error);
        } finally {
            setIsLoading(false);
        }
    }, [token]);

    useEffect(() => {
        if (user && token) {
            void loadMissions();
        }
    }, [loadMissions, token, user]);

    const handleComplete = async (missionId: string) => {
        if (!token || completingId) return;

        setCompletingId(missionId);
        try {
            const result = await completeMission(missionId, token);
            if (result.success) {
                // 미션 상태 업데이트
                setMissions(prev => prev.map(m =>
                    m.id === missionId ? { ...m, is_completed: true } : m
                ));
                setCompletedCount(prev => prev + 1);

                if (result.coins_earned > 0) {
                    setTotalReward(prev => prev - result.coins_earned);
                    onCoinsEarned?.(result.coins_earned);
                }

                setPushPromptNonce(prev => prev + 1);
            }
        } catch (error) {
            console.error('미션 완료 실패:', error);
        } finally {
            setCompletingId(null);
        }
    };

    if (!user) return null;

    // 컴팩트 모드: 요약만 표시
    if (compact) {
        return (
            <div className={styles.compactContainer}>
                <div className={styles.compactHeader}>
                    <Gift size={18} className={styles.compactIcon} />
                    <span>오늘의 미션</span>
                </div>
                <div className={styles.compactProgress}>
                    <span className={styles.compactCount}>{completedCount}/{missions.length}</span>
                    <span className={styles.compactReward}>+{totalReward} 엽전</span>
                </div>
                <ChevronRight size={16} className={styles.compactArrow} />
            </div>
        );
    }

    return (
        <div className={styles.container}>
            {/* 헤더 */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <Gift size={24} className={styles.headerIcon} />
                    <div>
                        <h3 className={styles.title}>오늘의 미션</h3>
                        <p className={styles.subtitle}>
                            {completedCount}/{missions.length} 완료
                            {totalReward > 0 && ` · ${totalReward} 엽전 남음`}
                        </p>
                    </div>
                </div>
                {/* 전체 진행률 */}
                <div className={styles.progressCircle}>
                    <svg viewBox="0 0 36 36" className={styles.progressSvg} aria-hidden="true" focusable="false">
                        <path
                            className={styles.progressBg}
                            d="M18 2.0845
                               a 15.9155 15.9155 0 0 1 0 31.831
                               a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                        <path
                            className={styles.progressFill}
                            strokeDasharray={`${missions.length > 0 ? (completedCount / missions.length) * 100 : 0}, 100`}
                            d="M18 2.0845
                               a 15.9155 15.9155 0 0 1 0 31.831
                               a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                    </svg>
                    <span className={styles.progressText}>
                        {missions.length > 0 ? Math.round((completedCount / missions.length) * 100) : 0}%
                    </span>
                </div>
            </div>

            {/* 미션 목록 */}
            <div className={styles.missionList}>
                {isLoading ? (
                    <div className={styles.loading}>미션 로딩 중...</div>
                ) : missions.length === 0 ? (
                    <div className={styles.empty}>오늘의 미션이 없습니다</div>
                ) : (
                    missions.map((mission) => (
                        <div
                            key={mission.id}
                            className={`${styles.missionItem} ${mission.is_completed ? styles.missionCompleted : ''}`}
                        >
                            <div className={styles.missionIcon}>
                                {mission.is_completed ? (
                                    <Check size={20} className={styles.checkIcon} />
                                ) : (
                                    MISSION_ICONS[mission.icon || ''] || <Gift size={20} />
                                )}
                            </div>

                            <div className={styles.missionContent}>
                                <h4 className={styles.missionTitle}>{mission.title}</h4>
                                {mission.description && (
                                    <p className={styles.missionDesc}>{mission.description}</p>
                                )}
                            </div>

                            <div className={styles.missionReward}>
                                {mission.is_completed ? (
                                    <span className={styles.completedBadge}>완료</span>
                                ) : (
                                    <>
                                        <span className={styles.rewardAmount}>+{mission.reward_coins}</span>
                                        <button
                                            type="button"
                                            className={styles.claimButton}
                                            onClick={() => handleComplete(mission.id)}
                                            disabled={completingId === mission.id}
                                        >
                                            {completingId === mission.id ? '...' : '받기'}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* 모든 미션 완료 시 축하 메시지 */}
            {!isLoading && completedCount === missions.length && missions.length > 0 && (
                <div className={styles.allCompletedBanner}>
                    <Sparkles size={20} />
                    <span>오늘의 미션을 모두 완료했어요!</span>
                </div>
            )}
            {pushPromptNonce > 0 && (
                <PushOptInPrompt
                    key={`mission-complete-${pushPromptNonce}`}
                    trigger="mission_complete"
                />
            )}
        </div>
    );
}
