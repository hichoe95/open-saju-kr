'use client';

import { useState } from 'react';
import styles from '../ResultTabs.module.css';
import { Users, Heart, Briefcase } from 'lucide-react';
import TabContent from '@/components/TabContent';
import { ReadingResponse } from '@/types';
import SecondaryCard from '@/components/result/shared/SecondaryCard';
import SecondaryGrid from '@/components/result/shared/SecondaryGrid';

interface CompatibilityTabProps {
    data: ReadingResponse;
}

const RELATIONSHIP_SUB_TABS = [
    { key: 'overview' as const, label: '종합', icon: <img src="/icons/emoji-replacements/compatibility/overview.png" width={20} height={20} alt="종합" loading="eager" /> },
    { key: 'friend' as const, label: '친구', icon: <img src="/icons/emoji-replacements/compatibility/friend_tab.png" width={20} height={20} alt="우정" loading="eager" /> },
    { key: 'romance' as const, label: '연애', icon: <img src="/icons/emoji-replacements/compatibility/romance.png" width={20} height={20} alt="연애" loading="eager" /> },
    { key: 'work' as const, label: '직장', icon: <img src="/icons/emoji-replacements/compatibility/work.png" width={20} height={20} alt="직장" loading="eager" /> },
    { key: 'family' as const, label: '가족', icon: <img src="/icons/emoji-replacements/compatibility/family_tab.png" width={20} height={20} alt="가족" loading="eager" /> },
];

export default function CompatibilityTab({ data }: CompatibilityTabProps) {
    const [relationshipSubTab, setRelationshipSubTab] = useState<'overview' | 'friend' | 'romance' | 'work' | 'family'>('overview');

    if (!data.tabs.compatibility) return null;

    return (
        <div className={styles.relationshipTabWrapper}>
            {/* 서브탭 네비게이션 */}
            <div className={styles.relationshipSubTabs}>
                {RELATIONSHIP_SUB_TABS.map((tab) => (
                    <button
                        type="button"
                        key={tab.key}
                        className={`${styles.relationshipSubTabBtn} ${relationshipSubTab === tab.key ? styles.relationshipSubTabActive : ''}`}
                        onClick={() => setRelationshipSubTab(tab.key)}
                    >
                        <span className={styles.subTabEmoji}>{tab.icon}</span>
                        <span>{tab.label}</span>
                    </button>
                ))}
            </div>

            {relationshipSubTab === 'overview' && (
                <>
                    <TabContent
                        title="관계 종합"
                        icon={<Users size={24} />}
                        summary={data.tabs.compatibility.summary}
                        full_text={data.tabs.compatibility.full_text}
                        timeline={data.tabs.compatibility.timeline}
                        sections={[
                            { title: '잘 맞는 유형', items: data.tabs.compatibility.good_matches, type: 'positive' },
                            { title: '나의 갈등 버튼', items: data.tabs.compatibility.conflict_triggers, type: 'negative' },
                            { title: '화해/소통 팁', items: data.tabs.compatibility.communication_scripts, type: 'tip' },
                            { title: '데이트/선물 추천', items: data.tabs.compatibility.date_ideas, type: 'tip' },
                            { title: '관계 주의보', items: data.tabs.compatibility.red_flags, type: 'negative' },
                        ]}
                        extra={
                            (data.tabs.compatibility.chemistry_score !== undefined || data.tabs.compatibility.relationship_label || data.tabs.compatibility.survival_rate !== undefined) && (
                                <SecondaryGrid columns={2}>
                                    {data.tabs.compatibility.chemistry_score !== undefined && (
                                        <SecondaryCard title="케미 지수" icon={<Users size={16} />} variant="metric">
                                            <div className={styles.chemistryScoreValue}>{data.tabs.compatibility.chemistry_score}<span>점</span></div>
                                            <div className={styles.chemistryScoreBar}>
                                                <div 
                                                    className={styles.chemistryScoreFill}
                                                    style={{ width: `${data.tabs.compatibility.chemistry_score}%` }}
                                                />
                                            </div>
                                        </SecondaryCard>
                                    )}
                                    {data.tabs.compatibility.relationship_label && (
                                        <SecondaryCard title="관계 별칭" icon={<Users size={16} />}>
                                            <strong>{data.tabs.compatibility.relationship_label}</strong>
                                        </SecondaryCard>
                                    )}
                                    {data.tabs.compatibility.survival_rate !== undefined && (
                                        <SecondaryCard title="관계 생존율" icon={<Users size={16} />}>
                                            <strong>{data.tabs.compatibility.survival_rate}%</strong>
                                        </SecondaryCard>
                                    )}
                                </SecondaryGrid>
                            )
                        }
                    />
                </>
            )}

            {/* 친구 관계 */}
            {relationshipSubTab === 'friend' && data.tabs.compatibility.friend && (
                <TabContent
                    title="친구 관계"
                    icon={<Users size={24} />}
                    summary={data.tabs.compatibility.friend.summary}
                    full_text={data.tabs.compatibility.friend.full_text}
                    sections={[
                        { title: '친구 관계 강점', items: data.tabs.compatibility.friend.strengths, type: 'positive' },
                        { title: '주의할 점', items: data.tabs.compatibility.friend.challenges, type: 'negative' },
                        { title: '더 친해지는 팁', items: data.tabs.compatibility.friend.tips, type: 'tip' },
                        ...(data.tabs.compatibility.friend.scenarios?.length ? [{ title: '상황별 가이드', items: data.tabs.compatibility.friend.scenarios, type: 'tip' as const }] : []),
                    ]}
                />
            )}

            {/* 연애/썸 관계 */}
            {relationshipSubTab === 'romance' && data.tabs.compatibility.romance && (
                <TabContent
                    title="연애/썸 관계"
                    icon={<Heart size={24} />}
                    summary={data.tabs.compatibility.romance.summary}
                    full_text={data.tabs.compatibility.romance.full_text}
                    sections={[
                        { title: '연애 매력 포인트', items: data.tabs.compatibility.romance.strengths, type: 'positive' },
                        { title: '연애 주의 패턴', items: data.tabs.compatibility.romance.challenges, type: 'negative' },
                        { title: '마음 얻는 팁', items: data.tabs.compatibility.romance.tips, type: 'tip' },
                        ...(data.tabs.compatibility.romance.scenarios?.length ? [{ title: '상황별 공략법', items: data.tabs.compatibility.romance.scenarios, type: 'tip' as const }] : []),
                    ]}
                />
            )}

            {/* 직장/학교 관계 */}
            {relationshipSubTab === 'work' && data.tabs.compatibility.work && (
                <TabContent
                    title="직장/학교 관계"
                    icon={<Briefcase size={24} />}
                    summary={data.tabs.compatibility.work.summary}
                    full_text={data.tabs.compatibility.work.full_text}
                    sections={[
                        { title: '조직 생활 강점', items: data.tabs.compatibility.work.strengths, type: 'positive' },
                        { title: '조직에서 주의할 점', items: data.tabs.compatibility.work.challenges, type: 'negative' },
                        { title: '인정받는 방법', items: data.tabs.compatibility.work.tips, type: 'tip' },
                        ...(data.tabs.compatibility.work.scenarios?.length ? [{ title: '상황별 대처법', items: data.tabs.compatibility.work.scenarios, type: 'tip' as const }] : []),
                    ]}
                />
            )}

            {/* 가족 관계 */}
            {relationshipSubTab === 'family' && data.tabs.compatibility.family && (
                <TabContent
                    title="가족 관계"
                    icon={<Users size={24} />}
                    summary={data.tabs.compatibility.family.summary}
                    full_text={data.tabs.compatibility.family.full_text}
                    sections={[
                        { title: '가족 관계 강점', items: data.tabs.compatibility.family.strengths, type: 'positive' },
                        { title: '갈등 포인트', items: data.tabs.compatibility.family.challenges, type: 'negative' },
                        { title: '화목해지는 방법', items: data.tabs.compatibility.family.tips, type: 'tip' },
                        ...(data.tabs.compatibility.family.scenarios?.length ? [{ title: '상황별 가이드', items: data.tabs.compatibility.family.scenarios, type: 'tip' as const }] : []),
                    ]}
                />
            )}

            {/* 서브탭 데이터가 없는 경우 */}
            {relationshipSubTab !== 'overview' && !data.tabs.compatibility[relationshipSubTab] && (
                <div className={styles.emptySubTab}>
                    <p>이 카테고리의 분석 데이터가 아직 없습니다.</p>
                    <p className={styles.emptySubTabHint}>새로운 분석을 실행하면 상세한 관계 분석이 제공됩니다.</p>
                </div>
            )}
        </div>
    );
}
