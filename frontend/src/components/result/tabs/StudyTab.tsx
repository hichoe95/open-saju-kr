'use client';

import { BookOpen } from 'lucide-react';
import TabContent from '@/components/TabContent';
import GlossaryHighlight from '@/components/GlossaryHighlight';
import { ReadingResponse } from '@/types';
import SecondaryCard from '@/components/result/shared/SecondaryCard';
import SecondaryGrid from '@/components/result/shared/SecondaryGrid';

interface StudyTabProps {
    data: ReadingResponse;
}

export default function StudyTab({ data }: StudyTabProps) {
    return (
        <TabContent
            title="학업운"
            icon={<BookOpen size={24} />}
            summary={data.tabs.study.summary}
            full_text={data.tabs.study.full_text}
            timeline={data.tabs.study.timeline}
            sections={[
                { title: '효율 좋은 루틴', items: data.tabs.study.routine, type: 'positive' },
                { title: '주의할 점', items: data.tabs.study.pitfalls, type: 'negative' },
            ]}
            extra={
                (data.tabs.study.study_type || data.tabs.study.focus_golden_time || data.tabs.study.study_bgm || data.tabs.study.slump_escape) && (
                    <SecondaryGrid columns={2}>
                        {data.tabs.study.study_type && (
                            <SecondaryCard title="학습 유형" icon={<BookOpen size={16} />}>
                                <strong>{data.tabs.study.study_type}</strong>
                            </SecondaryCard>
                        )}
                        {data.tabs.study.focus_golden_time && (
                            <SecondaryCard title="집중 골든타임" icon={<BookOpen size={16} />}>
                                <p>{data.tabs.study.focus_golden_time}</p>
                            </SecondaryCard>
                        )}
                        {data.tabs.study.study_bgm && (
                            <SecondaryCard title="공부 BGM" icon={<BookOpen size={16} />}>
                                <p>{data.tabs.study.study_bgm}</p>
                            </SecondaryCard>
                        )}
                        {data.tabs.study.slump_escape && (
                            <SecondaryCard title="슬럼프 탈출법" icon={<BookOpen size={16} />} variant="info">
                                <p><GlossaryHighlight text={data.tabs.study.slump_escape} /></p>
                            </SecondaryCard>
                        )}
                    </SecondaryGrid>
                )
            }
        />
    );
}
