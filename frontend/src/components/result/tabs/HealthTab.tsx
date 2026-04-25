'use client';

import styles from '../ResultTabs.module.css';
import { Activity } from 'lucide-react';
import { BarbellIcon } from '@phosphor-icons/react/dist/csr/Barbell';
import { FlowerIcon } from '@phosphor-icons/react/dist/csr/Flower';
import { PersonSimpleRunIcon } from '@phosphor-icons/react/dist/csr/PersonSimpleRun';
import { WarningIcon } from '@phosphor-icons/react/dist/csr/Warning';
import TabContent from '@/components/TabContent';
import { ReadingResponse } from '@/types';
import SecondaryCard from '@/components/result/shared/SecondaryCard';
import SecondaryGrid from '@/components/result/shared/SecondaryGrid';

interface HealthTabProps {
    data: ReadingResponse;
}

export default function HealthTab({ data }: HealthTabProps) {
    return (
        <TabContent
            title="건강운"
            icon={<Activity size={24} />}
            summary={data.tabs.health.summary}
            full_text={data.tabs.health.full_text}
            timeline={data.tabs.health.timeline}
            sections={[
                { title: '컨디션 관리 루틴', items: data.tabs.health.routine, type: 'positive' },
                { title: '취약 패턴', items: data.tabs.health.warnings, type: 'negative' },
            ]}
            note="비의료 참고용 - 증상이 있다면 전문의와 상담하세요"
            extra={
                (data.tabs.health.body_type || data.tabs.health.weak_organs || data.tabs.health.exercise_recommendation || data.tabs.health.stress_relief) && (
                    <SecondaryGrid columns={2}>
                        {data.tabs.health.body_type && (
                            <SecondaryCard title="체질 유형" icon={<BarbellIcon size={16} />}>
                                <strong>{data.tabs.health.body_type}</strong>
                            </SecondaryCard>
                        )}
                        {data.tabs.health.weak_organs && data.tabs.health.weak_organs.length > 0 && (
                            <SecondaryCard title="취약 부위" icon={<WarningIcon size={16} />} variant="warning">
                                <div className={styles.weakOrganTags}>
                                    {data.tabs.health.weak_organs.map((organ, i) => (
                                        <span key={i} className={styles.weakOrganTag}>{organ}</span>
                                    ))}
                                </div>
                            </SecondaryCard>
                        )}
                        {data.tabs.health.exercise_recommendation && (
                            <SecondaryCard title="추천 운동" icon={<PersonSimpleRunIcon size={16} />}>
                                <p>{data.tabs.health.exercise_recommendation}</p>
                            </SecondaryCard>
                        )}
                        {data.tabs.health.stress_relief && (
                            <SecondaryCard title="스트레스 해소법" icon={<FlowerIcon size={16} />}>
                                <p>{data.tabs.health.stress_relief}</p>
                            </SecondaryCard>
                        )}
                    </SecondaryGrid>
                )
            }
        />
    );
}
