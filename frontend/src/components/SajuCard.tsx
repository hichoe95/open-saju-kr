'use client';

import { useState } from 'react';
import styles from './SajuCard.module.css';
import { PillarsData, CardData } from '@/types';
import { BrainIcon } from '@phosphor-icons/react/dist/csr/Brain';
import { CoinsIcon } from '@phosphor-icons/react/dist/csr/Coins';
import { HeartIcon } from '@phosphor-icons/react/dist/csr/Heart';
import { LeafIcon } from '@phosphor-icons/react/dist/csr/Leaf';
import { LightningIcon } from '@phosphor-icons/react/dist/csr/Lightning';
import { NotebookIcon } from '@phosphor-icons/react/dist/csr/Notebook';
import { BarChart2, Hexagon, ScrollText, Target, Drama, Sparkles, AlertTriangle, BookOpen, Crown, Cat, Activity } from 'lucide-react';
import ElementalRadar from './ElementalRadar';
import GlossaryHighlight from './GlossaryHighlight';

interface SajuCardProps {
    pillars: PillarsData;
    card: CardData;
}

const ELEMENT_COLORS: Record<string, string> = {
    water: 'var(--color-water)',
    wood: 'var(--color-wood)',
    fire: 'var(--color-fire)',
    metal: 'var(--color-metal)',
    earth: 'var(--color-earth)',
};

const ELEMENT_LABELS: Record<string, string> = {
    water: '수(水)',
    wood: '목(木)',
    fire: '화(火)',
    metal: '금(金)',
    earth: '토(土)',
};

const PILLAR_DESCRIPTIONS = [
    { label: '년주', desc: '초년운, 배경, 가문 (뿌리)' },
    { label: '월주', desc: '청년운, 사회성, 직업 (줄기)' },
    { label: '일주', desc: '본인, 중년운, 배우자 (꽃)' },
    { label: '시주', desc: '말년운, 자녀, 결과물 (열매)' },
];

const ELEMENT_DESCRIPTIONS = [
    { label: '목(Wood)', desc: '성장, 창의, 인자함 (봄)' },
    { label: '화(Fire)', desc: '열정, 표현, 예의 (여름)' },
    { label: '토(Earth)', desc: '중재, 신용, 포용 (환절기)' },
    { label: '금(Metal)', desc: '결단, 원칙, 의리 (가을)' },
    { label: '수(Water)', desc: '지혜, 유연, 총명 (겨울)' },
];

const CHARACTER_DESCRIPTIONS = [
    { label: '버프', desc: '타고난 장점으로, 인생을 살아가는 데 큰 무기가 됩니다.' },
    { label: '디버프', desc: '주의해야 할 약점으로, 보완하면 성장의 계기가 됩니다.' },
];

export default function SajuCard({ pillars, card }: SajuCardProps) {
    const [viewMode, setViewMode] = useState<'bar' | 'radar'>('radar');
    const characterBuffs = card.character.buffs ?? [];
    const characterDebuffs = card.character.debuffs ?? [];
    const cardTags = card.tags ?? [];

    const maxStat = Math.max(
        card.stats.water,
        card.stats.wood,
        card.stats.fire,
        card.stats.metal,
        card.stats.earth,
        5
    );

    const normalizedHourA = pillars.hour_A?.trim() || '?';
    const normalizedHourB = pillars.hour_B?.trim() || '';
    const showBothHours = normalizedHourB && normalizedHourB !== normalizedHourA;

    return (
        <div className={styles.container}>
            {/* 사주 팔자 */}
            <div className={styles.pillarsSection}>
                <h3 className={styles.sectionHeading}><ScrollText size={18} /> 사주 팔자 (만세력)</h3>

                <div className={styles.pillarsGrid}>
                    <div className={styles.pillar}>
                        <span className={styles.pillarLabel}>시주</span>
                        <div className={styles.hourVariants}>
                            <span className={styles.pillarValue}>{normalizedHourA}</span>
                            {showBothHours && (
                                <span className={styles.pillarVariant}>또는 {normalizedHourB}</span>
                            )}
                        </div>
                    </div>
                    <div className={styles.pillar}>
                        <span className={styles.pillarLabel}>일주</span>
                        <span className={styles.pillarValue}>{pillars.day || '?'}</span>
                    </div>
                    <div className={styles.pillar}>
                        <span className={styles.pillarLabel}>월주</span>
                        <span className={styles.pillarValue}>{pillars.month || '?'}</span>
                    </div>
                    <div className={styles.pillar}>
                        <span className={styles.pillarLabel}>년주</span>
                        <span className={styles.pillarValue}>{pillars.year || '?'}</span>
                    </div>
                </div>

                {pillars.hour_note && (
                    <p className={styles.hourNote}>{pillars.hour_note}</p>
                )}

                {/* 사주팔자 설명 섹션 */}
                <details className={styles.descriptionBox}>
                    <summary className={styles.descSummary}>
                        <BookOpen size={14} />
                        <span>사주팔자란?</span>
                    </summary>
                    <p>
                        태어난 연, 월, 일, 시를 네 개의 기둥(사주)과<br />
                        여덟 글자(팔자)로 표현하여 운명을 분석합니다.
                    </p>
                    <div className={styles.descGrid}>
                        {PILLAR_DESCRIPTIONS.map(p => (
                            <div key={p.label} className={styles.descItem}>
                                <span className={styles.descLabel}>{p.label}</span>
                                <span className={styles.descText}>{p.desc}</span>
                            </div>
                        ))}
                    </div>
                </details>
            </div>

            {/* 오행 스탯 */}
            <div className={styles.statsSection}>
                <div className={styles.statsHeader}>
                    <h3 className={styles.sectionHeading}><Target size={18} /> 오행 스탯</h3>
                    <div className={styles.viewToggleGroup}>
                        <button
                            type="button"
                            onClick={() => setViewMode('bar')}
                            title="바 차트 보기"
                            className={`${styles.viewToggleBtn} ${viewMode === 'bar' ? styles.viewToggleBtnActive : ''}`}
                        >
                            <BarChart2 size={18} color={viewMode === 'bar' ? 'var(--primary)' : 'var(--text-tertiary)'} />
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('radar')}
                            title="레이더 차트 보기"
                            className={`${styles.viewToggleBtn} ${viewMode === 'radar' ? styles.viewToggleBtnActive : ''}`}
                        >
                            <Hexagon size={18} color={viewMode === 'radar' ? 'var(--primary)' : 'var(--text-tertiary)'} />
                        </button>
                    </div>
                </div>

                {viewMode === 'radar' ? (
                    <div className={styles.radarWrapper}>
                        <ElementalRadar stats={card.stats} size={240} />
                    </div>
                ) : (
                    <div className={styles.statsList}>
                        {Object.entries(card.stats).map(([key, value]) => (
                            <div key={key} className={styles.statItem}>
                                <span className={styles.statLabel}>{ELEMENT_LABELS[key]}</span>
                                <div className={styles.statBar}>
                                    <div
                                        className={styles.statFill}
                                        style={{
                                            width: `${(value / maxStat) * 100}%`,
                                            backgroundColor: ELEMENT_COLORS[key],
                                        }}
                                    />
                                </div>
                                <span className={styles.statValue}>{value.toFixed(1)}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* 오행 설명 섹션 */}
                <details className={styles.descriptionBox} style={{ marginTop: '20px' }}>
                    <summary className={styles.descSummary}>
                        <BookOpen size={14} />
                        <span>오행(五行)이란?</span>
                    </summary>
                    <p>
                        우주 만물을 이루는 다섯 가지 기운으로,<br />
                        서로 영향을 주고받으며 개인의 성향을 형성합니다.
                    </p>
                    <div className={styles.descGrid}>
                        {ELEMENT_DESCRIPTIONS.map(e => (
                            <div key={e.label} className={styles.descItem}>
                                <span className={styles.descLabel} style={{ width: 'auto', minWidth: '60px' }}>{e.label}</span>
                                <span className={styles.descText}>{e.desc}</span>
                            </div>
                        ))}
                    </div>
                </details>
            </div>

            {/* 콘텐츠 강화: 칭호 뱃지, 조선시대 직업, 영혼의 동물, 아우라 컬러 */}
            {(card.title_badge || card.joseon_job || card.soul_animal || card.aura_color) && (
                <div className={styles.enhancedSection}>
                    {card.title_badge && (
                        <div className={styles.titleBadge}>
                            <Crown size={16} />
                            <span>{card.title_badge}</span>
                        </div>
                    )}
                    
                    <div className={styles.enhancedGrid}>
                        {card.joseon_job && (
                            <div className={styles.enhancedCard}>
                                <div className={styles.enhancedCardIcon}><NotebookIcon size={20} /></div>
                                <div className={styles.enhancedCardLabel}>조선시대 직업</div>
                                <div className={styles.enhancedCardValue}>{card.joseon_job}</div>
                            </div>
                        )}
                        
                        {card.soul_animal && (
                            <div className={styles.enhancedCard}>
                                <div className={styles.enhancedCardIcon}><Cat size={20} /></div>
                                <div className={styles.enhancedCardLabel}>영혼의 동물</div>
                                <div className={styles.enhancedCardValue}>{card.soul_animal}</div>
                            </div>
                        )}
                        
                        {card.aura_color && (
                            <div className={styles.enhancedCard}>
                                <div 
                                    className={styles.auraColorCircle}
                                    style={{ backgroundColor: card.aura_color }}
                                />
                                <div className={styles.enhancedCardLabel}>아우라 컬러</div>
                                <div className={styles.enhancedCardValue}>{card.aura_color_name || card.aura_color}</div>
                            </div>
                        )}
                    </div>
                    
                    {/* 인생 5대 스탯 레이더 */}
                    {card.life_stat_radar && (
                        <div className={styles.lifeStatSection}>
                            <h4 className={styles.lifeStatTitle}><Activity size={16} /> 인생 5대 스탯</h4>
                            <div className={styles.lifeStatGrid}>
                                <div className={styles.lifeStatItem}>
                                    <span className={styles.lifeStatLabel}><BrainIcon size={14} /> 지력</span>
                                    <div className={styles.lifeStatBar}>
                                        <div 
                                            className={styles.lifeStatFill}
                                            style={{ width: `${card.life_stat_radar.intellect}%`, backgroundColor: '#3B82F6' }}
                                        />
                                    </div>
                                    <span className={styles.lifeStatValue}>{card.life_stat_radar.intellect}</span>
                                </div>
                                <div className={styles.lifeStatItem}>
                                    <span className={styles.lifeStatLabel}><HeartIcon size={14} /> 매력</span>
                                    <div className={styles.lifeStatBar}>
                                        <div 
                                            className={styles.lifeStatFill}
                                            style={{ width: `${card.life_stat_radar.charm}%`, backgroundColor: '#EC4899' }}
                                        />
                                    </div>
                                    <span className={styles.lifeStatValue}>{card.life_stat_radar.charm}</span>
                                </div>
                                <div className={styles.lifeStatItem}>
                                    <span className={styles.lifeStatLabel}><CoinsIcon size={14} /> 재력</span>
                                    <div className={styles.lifeStatBar}>
                                        <div 
                                            className={styles.lifeStatFill}
                                            style={{ width: `${card.life_stat_radar.wealth}%`, backgroundColor: '#F59E0B' }}
                                        />
                                    </div>
                                    <span className={styles.lifeStatValue}>{card.life_stat_radar.wealth}</span>
                                </div>
                                <div className={styles.lifeStatItem}>
                                    <span className={styles.lifeStatLabel}><LightningIcon size={14} /> 체력</span>
                                    <div className={styles.lifeStatBar}>
                                        <div 
                                            className={styles.lifeStatFill}
                                            style={{ width: `${card.life_stat_radar.vitality}%`, backgroundColor: '#10B981' }}
                                        />
                                    </div>
                                    <span className={styles.lifeStatValue}>{card.life_stat_radar.vitality}</span>
                                </div>
                                <div className={styles.lifeStatItem}>
                                    <span className={styles.lifeStatLabel}><LeafIcon size={14} /> 멘탈</span>
                                    <div className={styles.lifeStatBar}>
                                        <div 
                                            className={styles.lifeStatFill}
                                            style={{ width: `${card.life_stat_radar.mental}%`, backgroundColor: '#8B5CF6' }}
                                        />
                                    </div>
                                    <span className={styles.lifeStatValue}>{card.life_stat_radar.mental}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* 캐릭터 */}
            <div className={styles.characterSection}>
                <h3 className={styles.sectionHeading}><Drama size={18} /> 캐릭터</h3>

                <p className={styles.characterSummary}>
                    <GlossaryHighlight text={card.character.summary} />
                </p>

                {(characterBuffs.length > 0 || characterDebuffs.length > 0) && (
                    <div className={styles.buffsDebuffs}>
                        {characterBuffs.length > 0 && (
                            <div className={styles.buffs}>
                                <h4 className={styles.buffTitle}><Sparkles size={16} /> 버프 (장점)</h4>
                                <ul>
                                    {characterBuffs.map((buff) => (
                                        <li key={buff}>
                                            <GlossaryHighlight text={buff} />
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {characterDebuffs.length > 0 && (
                            <div className={styles.debuffs}>
                                <h4 className={styles.debuffTitle}><AlertTriangle size={16} /> 디버프 (주의)</h4>
                                <ul>
                                    {characterDebuffs.map((debuff) => (
                                        <li key={debuff}>
                                            <GlossaryHighlight text={debuff} />
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}

                {/* 캐릭터 설명 섹션 */}
                <details className={styles.descriptionBox} style={{ marginTop: '20px' }}>
                    <summary className={styles.descSummary}>
                        <BookOpen size={14} />
                        <span>캐릭터 성향이란?</span>
                    </summary>
                    <p>사주로 분석된 나의 핵심 기질과 장단점입니다.</p>
                    <div className={styles.descGrid}>
                        {CHARACTER_DESCRIPTIONS.map(c => (
                            <div key={c.label} className={styles.descItem}>
                                <span className={styles.descLabel} style={{ width: 'auto', minWidth: '60px' }}>{c.label}</span>
                                <span className={styles.descText}>{c.desc}</span>
                            </div>
                        ))}
                    </div>
                </details>
            </div>

            {/* 태그 */}
            {cardTags.length > 0 && (
                <div className={styles.tagsSection}>
                    <div className={styles.tags}>
                        {cardTags.map((tag) => (
                            <span key={tag} className={styles.tag}>
                                {tag}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
