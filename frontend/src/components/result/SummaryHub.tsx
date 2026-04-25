'use client';

import type { ReactNode } from 'react';
import { Heart, Coins, Briefcase, BookOpen, HeartPulse, Users, Sparkles, ChevronRight } from 'lucide-react';
import SajuCard from '@/components/SajuCard';
import OneLiner from './shared/OneLiner';
import { ReadingResponse } from '@/types';
import styles from './SummaryHub.module.css';
import { TabKey } from './types';
import { getSummaryHubCards } from './summaryHubCards';

interface SummaryHubProps {
    data: ReadingResponse;
    onTabChange?: (tab: TabKey) => void;
    onRequestDetail?: (tab: TabKey) => void;
    featureCharacterCardEnabled?: boolean;
}

const SUMMARY_CARD_ICONS: Record<TabKey, ReactNode> = {
    summary: <Sparkles size={20} />,
    lucky: <Sparkles size={20} />,
    love: <Heart size={20} />,
    money: <Coins size={20} />,
    career: <Briefcase size={20} />,
    study: <BookOpen size={20} />,
    health: <HeartPulse size={20} />,
    compatibility: <Users size={20} />,
    life: <HeartPulse size={20} />,
    daeun: <Sparkles size={20} />,
};

export default function SummaryHub({
    data,
    onTabChange,
    onRequestDetail,
    featureCharacterCardEnabled = true,
}: SummaryHubProps) {
    const summaryCards = getSummaryHubCards(data);

    const handleCardClick = (tabKey: TabKey) => {
        onTabChange?.(tabKey);
    };

    return (
        <div className={styles.hub} data-testid="summary-hub">
            {/* One-liner - trust-oriented opening */}
            <OneLiner text={data.one_liner || ''} />

            {/* Saju Card - Pillars & Five Elements */}
            <div className={styles.sajuCardWrapper}>
                <SajuCard pillars={data.pillars} card={data.card} />
            </div>

            {/* Character Card (if enabled) */}
            {featureCharacterCardEnabled && data.character && (
                <div className={styles.characterSection}>
                    <div className={styles.characterCard}>
                        <div className={styles.characterIcon}>
                            {data.character.icon_path ? (
                                <img 
                                    src={data.character.icon_path} 
                                    alt={data.character.name}
                                    className={styles.characterImage}
                                />
                            ) : (
                                <Sparkles size={32} />
                            )}
                        </div>
                        <div className={styles.characterInfo}>
                            <span className={styles.characterType}>{data.character.type}</span>
                            <h3 className={styles.characterName}>{data.character.name}</h3>
                            <p className={styles.characterDesc}>{data.character.description}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Summary Cards Grid */}
            <div className={styles.summarySection}>
                <h2 className={styles.sectionTitle}>
                    <Sparkles size={18} />
                    <span>영역별 요약</span>
                </h2>
                <div className={styles.summaryGrid} data-testid="summary-cards-grid">
                    {summaryCards.map((card) => (
                        <div key={card.key} className={styles.summaryCard}>
                            <button
                                className={styles.cardPreviewButton}
                                onClick={() => handleCardClick(card.key)}
                                type="button"
                                aria-label={`${card.title} 요약 보기`}
                                data-testid={`summary-card-${card.key}`}
                            >
                                <div className={styles.cardHeader}>
                                    <span className={styles.cardIcon}>{SUMMARY_CARD_ICONS[card.key]}</span>
                                    <span className={styles.cardTitle}>{card.title}</span>
                                    <ChevronRight size={16} className={styles.cardArrow} />
                                </div>
                                <p className={styles.cardSummary}>{card.summary}</p>
                            </button>

                            <button
                                type="button"
                                className={styles.cardDetailButton}
                                onClick={() => onRequestDetail?.(card.key)}
                                data-testid={`summary-card-detail-cta-${card.key}`}
                            >
                                상세 사주 보기
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Scroll hint */}
            <div className={styles.scrollHint}>
                <span>탭을 눌러 상세 분석을 확인하세요</span>
            </div>
        </div>
    );
}
