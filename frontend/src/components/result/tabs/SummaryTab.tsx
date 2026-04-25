'use client';

import { Sparkles, Hash, User, Zap, Star, Eye, Brain } from 'lucide-react';
import SajuCard from '@/components/SajuCard';
import AdvancedAnalysisView from '@/components/AdvancedAnalysisView';
import CharacterCard from '@/components/result/CharacterCard';
import SecondaryGrid from '@/components/result/shared/SecondaryGrid';
import SecondaryCard from '@/components/result/shared/SecondaryCard';
import { ReadingResponse } from '@/types';
import styles from '../ResultTabs.module.css';

interface SummaryTabProps {
    data: ReadingResponse;
    featureSummaryV2Enabled?: boolean;
    featureCharacterCardEnabled?: boolean;
}

export default function SummaryTab({
    data,
    featureSummaryV2Enabled = true,
    featureCharacterCardEnabled = true,
}: SummaryTabProps) {
    const hiddenPersonality = data.hidden_personality;


    const handleShare = () => {
        // Analytics callback only — Web Share is handled by CharacterCard.exportCharacterCard()
    };

    const getEnergyBadgeClass = (energy: string): string => {
        switch (energy) {
            case '강함':
                return styles.energyStrong;
            case '보통':
                return styles.energyNormal;
            case '약함':
                return styles.energyWeak;
            default:
                return styles.energyNormal;
        }
    };

    return (
        <div className={styles.summaryTab}>
            <SajuCard pillars={data.pillars} card={data.card} />

            {featureCharacterCardEnabled && data.character && (
                <CharacterCard
                    character={data.character}
                    onShare={handleShare}
                />
            )}

            {featureSummaryV2Enabled && (
                <div className={styles.summaryV2Container}>
                    {data.saju_dna && (
                        <div className={styles.summaryDnaCard}>
                            <Sparkles size={20} />
                            <p>{data.saju_dna}</p>
                        </div>
                    )}

                    {hiddenPersonality && (
                        <SecondaryGrid columns={2}>
                            <SecondaryCard title="겉모습" icon={<Eye size={18} />} variant="info">
                                <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.6 }}>{hiddenPersonality.outer}</p>
                            </SecondaryCard>
                            <SecondaryCard title="속마음" icon={<Brain size={18} />} variant="default">
                                <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.6 }}>{hiddenPersonality.inner}</p>
                            </SecondaryCard>
                        </SecondaryGrid>
                    )}

                    {data.superpower && (
                        <div className={styles.summarySuperpower}>
                            <div className={styles.superpowerBadge}>
                                <Zap size={18} />
                                <span>{data.superpower}</span>
                            </div>
                        </div>
                    )}

                    {data.hashtags && data.hashtags.length > 0 && (
                        <div className={styles.summaryHashtags}>
                            <div className={styles.hashtagsHeader}>
                                <Hash size={16} />
                                <span>나의 키워드</span>
                            </div>
                            <div className={styles.hashtagsList}>
                                {(() => {
                                    const tags = data.hashtags ?? [];
                                    const seen = new Map<string, number>();
                                    return tags.map((tag) => {
                                        const n = seen.get(tag) ?? 0;
                                        seen.set(tag, n + 1);
                                        const key = n === 0 ? tag : `${tag}-${n}`;
                                        return (
                                            <span key={key} className={styles.summaryHashtag}>
                                                #{tag}
                                            </span>
                                        );
                                    });
                                })()}
                            </div>
                        </div>
                    )}

                    {data.famous_same_stem && (
                        <SecondaryCard title="같은 일간 유명인" icon={<Star size={18} />}>
                            <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.6 }}>{data.famous_same_stem}</p>
                        </SecondaryCard>
                    )}

                    {data.yearly_predictions && data.yearly_predictions.length > 0 && (
                        <SecondaryCard title="올해 3가지 예측" icon={<User size={18} />}>
                            <div className={styles.predictionsList}>
                                {(() => {
                                    const preds = data.yearly_predictions ?? [];
                                    const seen = new Map<string, number>();
                                    return preds.map((prediction, index) => {
                                        const n = seen.get(prediction.event) ?? 0;
                                        seen.set(prediction.event, n + 1);
                                        const key = n === 0 ? prediction.event : `${prediction.event}-${n}`;
                                        return (
                                            <div key={key} className={styles.summaryPredictionItem}>
                                                <span className={styles.predictionNumber}>{index + 1}</span>
                                                <p>{prediction.event}</p>
                                                <span className={`${styles.energyBadge} ${getEnergyBadgeClass(prediction.energy)}`}>
                                                    {prediction.energy}
                                                </span>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                        </SecondaryCard>
                    )}
                </div>
            )}

            {data.advanced_analysis && (
                <AdvancedAnalysisView
                    data={data.advanced_analysis}
                    elementStats={data.card.stats}
                />
            )}
        </div>
    );
}
