'use client';

import styles from '../ResultTabs.module.css';
import { Heart, Calendar, Sparkles, AlertTriangle } from 'lucide-react';
import { FireIcon } from '@phosphor-icons/react/dist/csr/Fire';
import { MoonIcon } from '@phosphor-icons/react/dist/csr/Moon';
import TabContent from '@/components/TabContent';
import GlossaryHighlight from '@/components/GlossaryHighlight';
import SecondaryCard from '@/components/result/shared/SecondaryCard';
import SecondaryGrid from '@/components/result/shared/SecondaryGrid';
import { ReadingResponse } from '@/types';

interface LoveTabProps {
    data: ReadingResponse;
    featureLoveV2Enabled?: boolean;
}

export default function LoveTab({ data, featureLoveV2Enabled = true }: LoveTabProps) {

    return (
        <TabContent
            title="연애운"
            icon={<Heart size={24} />}
            summary={data.tabs.love.summary}
            full_text={data.tabs.love.full_text}
            timeline={data.tabs.love.timeline}
            sections={[]}
            extra={
                <>
                    {featureLoveV2Enabled !== false && (data.tabs.love.love_style_badges || data.tabs.love.ideal_type_portrait || data.tabs.love.flirting_skill) && (
                        <SecondaryGrid columns={2}>
                            {data.tabs.love.love_style_badges && data.tabs.love.love_style_badges.length > 0 && (
                                <SecondaryCard title="연애 스타일" icon={<Heart size={16} />} className={styles.fullWidth}>
                                    <div className={styles.loveStyleBadges}>
                                        {data.tabs.love.love_style_badges.map((badge) => (
                                            <span key={badge} className={styles.loveStyleBadge}>{badge}</span>
                                        ))}
                                    </div>
                                </SecondaryCard>
                            )}
                            {data.tabs.love.ideal_type_portrait && (
                                <SecondaryCard title="이상형 프로필" icon={<Sparkles size={16} />}>
                                    <GlossaryHighlight text={data.tabs.love.ideal_type_portrait} />
                                </SecondaryCard>
                            )}
                            {data.tabs.love.flirting_skill && (
                                <SecondaryCard title="플러팅 필살기" icon={<FireIcon size={16} />}>
                                    <GlossaryHighlight text={data.tabs.love.flirting_skill} />
                                </SecondaryCard>
                            )}
                            {data.tabs.love.best_confession_timing && (
                                <SecondaryCard title="고백 최적 타이밍" icon={<Calendar size={16} />}>
                                    <GlossaryHighlight text={data.tabs.love.best_confession_timing} />
                                </SecondaryCard>
                            )}
                            {data.tabs.love.past_life_love && (
                                <SecondaryCard title="전생의 연인" icon={<MoonIcon size={16} />}>
                                    <GlossaryHighlight text={data.tabs.love.past_life_love} />
                                </SecondaryCard>
                            )}

                            {typeof data.tabs.love.love_energy_score === 'number' && (
                                <SecondaryCard title="연애 에너지 지수" icon={<Heart size={16} />} variant="metric">
                                    <div className={styles.loveEnergyNumber}>{data.tabs.love.love_energy_score}</div>
                                    <div className={styles.loveEnergyBadge}>
                                        {data.tabs.love.love_energy_score >= 70 ? <><FireIcon size={16} /> 활활</> : data.tabs.love.love_energy_score >= 40 ? '은은히' : <><MoonIcon size={16} /> 잠잠</>}
                                    </div>
                                    <div className={styles.loveEnergyBar}>
                                        <div
                                            className={styles.loveEnergyFill}
                                            style={{ width: `${data.tabs.love.love_energy_score}%` }}
                                        />
                                    </div>
                                </SecondaryCard>
                            )}

                            {data.tabs.love.breakup_risk_months && data.tabs.love.breakup_risk_months.length > 0 && (
                                <SecondaryCard title="이별 기운 주의 시기" icon={<AlertTriangle size={16} />} variant="warning">
                                    <div className={styles.breakupRiskMonths}>
                                        {data.tabs.love.breakup_risk_months.map((month) => (
                                            <span key={month} className={styles.breakupRiskMonth}>{month}월</span>
                                        ))}
                                    </div>
                                </SecondaryCard>
                            )}

                            {data.tabs.love.ideal_stem_type && (
                                <SecondaryCard title="이런 사람이 딱!" icon={<Sparkles size={16} />} variant="info">
                                    {data.tabs.love.ideal_stem_type}
                                </SecondaryCard>
                            )}
                        </SecondaryGrid>
                    )}
                </>
            }
        />
    );
}
