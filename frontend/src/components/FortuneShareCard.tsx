'use client';

import { forwardRef } from 'react';
import { ReadingResponse, BirthInput, ElementStats } from '@/types';
import styles from './FortuneShareCard.module.css';

export type CardTheme = 'minimal' | 'gradient' | 'dark' | 'traditional' | 'cute';

interface FortuneShareCardProps {
    data: ReadingResponse;
    birthInput?: BirthInput | null;
    theme?: CardTheme;
    showWatermark?: boolean;
    hidePillars?: boolean;
}

const ANIMALS: Record<string, string> = {
    '자': '子', '축': '丑', '인': '寅', '묘': '卯', '진': '辰', '사': '巳',
    '오': '午', '미': '未', '신': '申', '유': '酉', '술': '戌', '해': '亥'
};

const ELEMENT_COLORS: Record<string, { bg: string; text: string }> = {
    wood: { bg: '#22c55e', text: '#fff' },
    fire: { bg: '#ef4444', text: '#fff' },
    earth: { bg: '#eab308', text: '#000' },
    metal: { bg: '#94a3b8', text: '#000' },
    water: { bg: '#3b82f6', text: '#fff' },
};

const ELEMENT_NAMES: Record<string, string> = {
    wood: '목', fire: '화', earth: '토', metal: '금', water: '수'
};

function getAnimal(ganji: string): string {
    if (!ganji) return '子';
    const korean = ganji.match(/[가-힣]+/g)?.join('') || '';
    const ji = korean.slice(-1);
    return ANIMALS[ji] || '子';
}

function getDominantElement(stats: ElementStats): string {
    const entries: [string, number][] = [
        ['wood', stats.wood],
        ['fire', stats.fire],
        ['earth', stats.earth],
        ['metal', stats.metal],
        ['water', stats.water],
    ];
    return entries.reduce((a, b) => (a[1] > b[1] ? a : b))[0];
}

const FortuneShareCard = forwardRef<HTMLDivElement, FortuneShareCardProps>(
    ({ data, birthInput, theme = 'gradient', showWatermark = true, hidePillars = false }, ref) => {
        const dominant = getDominantElement(data.card.stats);
        const animal = getAnimal(data.pillars.year);

        return (
            <div ref={ref} className={`${styles.card} ${styles[theme]}`}>
                {/* 배경 장식 */}
                <div className={styles.bgDecoration}>
                    {theme === 'traditional' && (
                        <>
                            <div className={styles.patternOverlay} />
                            <div className={styles.cornerDecor} data-position="top-left" />
                            <div className={styles.cornerDecor} data-position="top-right" />
                            <div className={styles.cornerDecor} data-position="bottom-left" />
                            <div className={styles.cornerDecor} data-position="bottom-right" />
                        </>
                    )}
                    {theme === 'cute' && (
                        <>
                            <div className={styles.floatingStars} />
                            <div className={styles.cloudDecor} />
                        </>
                    )}
                </div>

                {/* 헤더 */}
                <div className={styles.header}>
                    <div className={styles.animalBadge}>
                        <span className={styles.animalEmoji}>{animal}</span>
                    </div>
                    {birthInput?.name && (
                        <span className={styles.userName}>{birthInput.name}님의</span>
                    )}
                    <h2 className={styles.title}>오늘의 운세</h2>
                </div>

                {!hidePillars && (
                    <div className={styles.pillarsSection}>
                        <div className={styles.pillarRow}>
                            <div className={styles.pillar}>
                                <span className={styles.pillarLabel}>년</span>
                                <span className={styles.pillarValue}>{data.pillars.year}</span>
                            </div>
                            <div className={styles.pillar}>
                                <span className={styles.pillarLabel}>월</span>
                                <span className={styles.pillarValue}>{data.pillars.month}</span>
                            </div>
                            <div className={styles.pillar}>
                                <span className={styles.pillarLabel}>일</span>
                                <span className={styles.pillarValue}>{data.pillars.day}</span>
                            </div>
                            {data.pillars.hour_A && (
                                <div className={styles.pillar}>
                                    <span className={styles.pillarLabel}>시</span>
                                    <span className={styles.pillarValue}>{data.pillars.hour_A}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* 한줄 요약 */}
                <div className={styles.oneLiner}>
                    <p>&ldquo;{data.one_liner}&rdquo;</p>
                </div>

                {/* 오행 분포 (미니) */}
                <div className={styles.elementBar}>
                    {(['wood', 'fire', 'earth', 'metal', 'water'] as const).map((element) => (
                        <div
                            key={element}
                            className={styles.elementSegment}
                            style={{
                                flex: data.card.stats[element],
                                backgroundColor: ELEMENT_COLORS[element]?.bg || '#888',
                            }}
                            title={`${ELEMENT_NAMES[element]}: ${data.card.stats[element]}%`}
                        />
                    ))}
                </div>
                <div className={styles.elementLabel}>
                    <span
                        className={styles.dominantBadge}
                        style={{ backgroundColor: ELEMENT_COLORS[dominant]?.bg }}
                    >
                        {ELEMENT_NAMES[dominant]} 기운 우세
                    </span>
                </div>

                {/* 태그 */}
                <div className={styles.tags}>
                    {data.card.tags.slice(0, 3).map((tag, i) => (
                        <span key={i} className={styles.tag}>#{tag}</span>
                    ))}
                </div>

                {/* 워터마크 */}
                {showWatermark && (
                    <div className={styles.watermark}>
                        <img
                            className={styles.watermarkLogo}
                            src="/icons/emoji-replacements/misc/crystal_ball.png"
                            width={40}
                            height={40}
                            alt=""
                            loading="eager"
                        />
                        <span className={styles.watermarkText}>마이사주</span>
                    </div>
                )}
            </div>
        );
    }
);

FortuneShareCard.displayName = 'FortuneShareCard';

export default FortuneShareCard;
