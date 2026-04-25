'use client';

import styles from '../ResultTabs.module.css';
import { Briefcase, TrendingUp } from 'lucide-react';
import TabContent from '@/components/TabContent';
import GlossaryHighlight from '@/components/GlossaryHighlight';
import SecondaryCard from '@/components/result/shared/SecondaryCard';
import SecondaryGrid from '@/components/result/shared/SecondaryGrid';
import { ReadingResponse } from '@/types';

interface CareerTabProps {
    data: ReadingResponse;
    featureCareerV2Enabled?: boolean;
}

export default function CareerTab({ data, featureCareerV2Enabled = true }: CareerTabProps) {

    return (
        <TabContent
            title="커리어"
            icon={<Briefcase size={24} />}
            summary={data.tabs.career.summary}
            full_text={data.tabs.career.full_text}
            timeline={data.tabs.career.timeline}
            sections={[
                { title: '잘 맞는 환경', items: data.tabs.career.fit, type: 'positive' },
                { title: '피해야 할 환경', items: data.tabs.career.avoid, type: 'negative' },
                { title: '앞으로의 포인트', items: data.tabs.career.next_steps, type: 'tip' },
            ]}
            extra={
                featureCareerV2Enabled !== false && (data.tabs.career.job_change_signal || data.tabs.career.office_villain_risk || data.tabs.career.interview_killer_move || data.tabs.career.salary_nego_timing || data.tabs.career.office_role) && (
                    <SecondaryGrid columns={2}>
                        {data.tabs.career.office_role && (
                            <SecondaryCard title="회사 내 역할" icon={<Briefcase size={16} />}>
                                <strong>{data.tabs.career.office_role}</strong>
                            </SecondaryCard>
                        )}
                        {data.tabs.career.job_change_signal && (
                            <SecondaryCard title="이직 신호등" icon={<Briefcase size={16} />}>
                                <GlossaryHighlight text={data.tabs.career.job_change_signal} />
                            </SecondaryCard>
                        )}
                        {data.tabs.career.office_villain_risk && (
                            <SecondaryCard title="사내 빌런 경고" icon={<Briefcase size={16} />} variant="warning">
                                <GlossaryHighlight text={data.tabs.career.office_villain_risk} />
                            </SecondaryCard>
                        )}
                        {data.tabs.career.interview_killer_move && (
                            <SecondaryCard title="면접 필살기" icon={<Briefcase size={16} />}>
                                <GlossaryHighlight text={data.tabs.career.interview_killer_move} />
                            </SecondaryCard>
                        )}
                        {data.tabs.career.salary_nego_timing && (
                            <SecondaryCard title="연봉 협상 타이밍" icon={<Briefcase size={16} />}>
                                <GlossaryHighlight text={data.tabs.career.salary_nego_timing} />
                            </SecondaryCard>
                        )}

                        {data.tabs.career.dream_jobs && data.tabs.career.dream_jobs.length > 0 && (
                            <SecondaryCard title="나의 천직" icon={<Briefcase size={16} />} variant="info">
                                <div className={styles.dreamJobsList}>
                                    {data.tabs.career.dream_jobs.map((job, i) => (
                                        <div key={job} className={styles.dreamJobItem}>
                                            <span className={styles.dreamJobNumber}>{i + 1}</span>
                                            <span className={styles.dreamJobName}>{job}</span>
                                        </div>
                                    ))}
                                </div>
                            </SecondaryCard>
                        )}

                        {data.tabs.career.promotion_energy && (
                            <SecondaryCard title="올해 승진 에너지" icon={<TrendingUp size={16} />} variant="metric">
                                <div className={`${styles.promotionEnergy} ${styles[`energy${data.tabs.career.promotion_energy === '강함' ? 'Strong' : data.tabs.career.promotion_energy === '보통' ? 'Normal' : 'Weak'}`]}`}>
                                    <strong>{data.tabs.career.promotion_energy}</strong>
                                </div>
                            </SecondaryCard>
                        )}
                    </SecondaryGrid>
                )
            }
        />
    );
}
