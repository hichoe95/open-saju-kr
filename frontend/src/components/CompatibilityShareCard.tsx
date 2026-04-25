'use client';

import { forwardRef } from 'react';
import { CompatibilityResponse, BirthInput, CompatibilityScenario } from '@/types';
import styles from './CompatibilityShareCard.module.css';

export type CardTheme = 'romantic' | 'minimal' | 'dark' | 'cute';

interface CompatibilityShareCardProps {
    data: CompatibilityResponse;
    userA: BirthInput;
    userB: BirthInput;
    scenario?: CompatibilityScenario;
    theme?: CardTheme;
    showWatermark?: boolean;
}

const SCENARIO_LABELS: Record<CompatibilityScenario, { iconPath: string; label: string }> = {
    lover: { iconPath: '/icons/emoji-replacements/compatibility/lover.png', label: '연인 궁합' },
    crush: { iconPath: '/icons/emoji-replacements/compatibility/crush.png', label: '썸 궁합' },
    friend: { iconPath: '/icons/emoji-replacements/compatibility/friend.png', label: '친구 궁합' },
    family: { iconPath: '/icons/emoji-replacements/compatibility/family.png', label: '가족 궁합' },
    business: { iconPath: '/icons/emoji-replacements/compatibility/business.png', label: '비즈니스 궁합' },
};

function getScoreIconPath(score: number): string {
    if (score >= 80) return '/icons/emoji-replacements/compatibility/score_high.png';
    if (score >= 50) return '/icons/emoji-replacements/compatibility/score_medium.png';
    return '/icons/emoji-replacements/compatibility/score_low.png';
}

function getScoreGrade(score: number): string {
    if (score >= 90) return '천생연분';
    if (score >= 80) return '최고의 궁합';
    if (score >= 70) return '좋은 궁합';
    if (score >= 60) return '괜찮은 궁합';
    if (score >= 50) return '보통';
    return '노력 필요';
}

const CompatibilityShareCard = forwardRef<HTMLDivElement, CompatibilityShareCardProps>(
    ({ data, userA, userB, scenario = 'lover', theme = 'romantic', showWatermark = true }, ref) => {
        const scenarioInfo = SCENARIO_LABELS[scenario];
        const scoreIconPath = getScoreIconPath(data.score);
        const scoreGrade = getScoreGrade(data.score);

        return (
            <div ref={ref} className={`${styles.card} ${styles[theme]}`}>
                <div className={styles.bgDecoration}>
                    {theme === 'romantic' && (
                        <>
                            <div className={styles.hearts} />
                            <div className={styles.sparkles} />
                        </>
                    )}
                    {theme === 'cute' && <div className={styles.floatingHearts} />}
                </div>

                <div className={styles.header}>
                    <span className={styles.scenarioBadge}>
                        <img
                            src={scenarioInfo.iconPath}
                            alt=""
                            width={16}
                            height={16}
                            loading="eager"
                        />
                        {scenarioInfo.label}
                    </span>
                </div>

                <div className={styles.namesSection}>
                    <div className={styles.nameCard}>
                        <span className={styles.nameLabel}>나</span>
                        <span className={styles.nameValue}>{userA.name || 'A'}</span>
                    </div>
                    <div className={styles.heartConnector}>
                        <span>
                            <img
                                src={scenarioInfo.iconPath}
                                alt=""
                                width={24}
                                height={24}
                                loading="eager"
                            />
                        </span>
                    </div>
                    <div className={styles.nameCard}>
                        <span className={styles.nameLabel}>상대</span>
                        <span className={styles.nameValue}>{userB.name || 'B'}</span>
                    </div>
                </div>

                <div className={styles.scoreSection}>
                    <div className={styles.scoreCircle}>
                        <span className={styles.scoreEmoji}>
                            <img
                                src={scoreIconPath}
                                alt=""
                                width={20}
                                height={20}
                                loading="eager"
                            />
                        </span>
                        <span className={styles.scoreNumber}>{data.score}</span>
                        <span className={styles.scoreUnit}>점</span>
                    </div>
                    <span className={styles.scoreGrade}>{scoreGrade}</span>
                </div>

                <div className={styles.summarySection}>
                    <p className={styles.summaryText}>&ldquo;{data.summary}&rdquo;</p>
                </div>

                <div className={styles.keywordSection}>
                    {data.keyword.split(/\s+/).slice(0, 3).map((kw, i) => (
                        <span key={i} className={styles.keyword}>{kw}</span>
                    ))}
                </div>

                {showWatermark && (
                    <div className={styles.watermark}>
                        <span className={styles.watermarkLogo}>
                            <img
                                src="/icons/emoji-replacements/compatibility/compatibility_watermark.png"
                                alt=""
                                width={14}
                                height={14}
                                loading="eager"
                            />
                        </span>
                        <span className={styles.watermarkText}>마이사주</span>
                    </div>
                )}
            </div>
        );
    }
);

CompatibilityShareCard.displayName = 'CompatibilityShareCard';

export default CompatibilityShareCard;
