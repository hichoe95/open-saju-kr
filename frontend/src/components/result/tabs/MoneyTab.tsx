'use client';

import styles from '../ResultTabs.module.css';
import { Coins, AlertTriangle } from 'lucide-react';
import { WarningIcon } from '@phosphor-icons/react/dist/csr/Warning';
import TabContent from '@/components/TabContent';
import GlossaryHighlight from '@/components/GlossaryHighlight';
import SecondaryCard from '@/components/result/shared/SecondaryCard';
import SecondaryGrid from '@/components/result/shared/SecondaryGrid';
import { ReadingResponse } from '@/types';

interface MoneyTabProps {
    data: ReadingResponse;
    featureMoneyV2Enabled?: boolean;
}

export default function MoneyTab({ data, featureMoneyV2Enabled = true }: MoneyTabProps) {

    return (
        <TabContent
            title="금전운"
            icon={<Coins size={24} />}
            summary={data.tabs.money.summary}
            full_text={data.tabs.money.full_text}
            timeline={data.tabs.money.timeline}
            sections={[
                { title: '위험 구간', items: data.tabs.money.risk, type: 'negative' },
                { title: '방어 규칙', items: data.tabs.money.rules, type: 'tip' },
            ]}
            extra={
                featureMoneyV2Enabled !== false && (data.tabs.money.wealth_vessel || data.tabs.money.money_type || data.tabs.money.investment_dna || data.tabs.money.leak_warning) && (
                    <SecondaryGrid columns={2}>
                        {data.tabs.money.wealth_vessel && (
                            <SecondaryCard title="돈 그릇" icon={<Coins size={16} />}>
                                {data.tabs.money.wealth_vessel}
                            </SecondaryCard>
                        )}
                        {data.tabs.money.money_type && (
                            <SecondaryCard title="재물 유형" icon={<Coins size={16} />}>
                                {data.tabs.money.money_type}
                            </SecondaryCard>
                        )}
                        {data.tabs.money.investment_dna && (
                            <SecondaryCard title="투자 DNA" icon={<Coins size={16} />}>
                                <GlossaryHighlight text={data.tabs.money.investment_dna} />
                            </SecondaryCard>
                        )}
                        {data.tabs.money.leak_warning && (
                            <SecondaryCard title="돈샘 경고" icon={<WarningIcon size={16} />} variant="warning">
                                <GlossaryHighlight text={data.tabs.money.leak_warning} />
                            </SecondaryCard>
                        )}

                        {data.tabs.money.wealth_grade && (
                            <SecondaryCard title="재물 등급" icon={<Coins size={16} />} variant="metric">
                                <div className={`${styles.wealthGradeBadge} ${styles[`wealthGrade${data.tabs.money.wealth_grade}`] || ''}`}>
                                    <span className={styles.wealthGradeLetter}>{data.tabs.money.wealth_grade}</span>
                                </div>
                            </SecondaryCard>
                        )}

                        {data.tabs.money.lucky_money_days && data.tabs.money.lucky_money_days.length > 0 && (
                            <SecondaryCard title="이번 달 금전 에너지가 강한 날" icon={<Coins size={16} />} variant="info">
                                <div className={styles.luckyMoneyDays}>
                                    {data.tabs.money.lucky_money_days.map((day) => (
                                        <span key={day} className={styles.luckyMoneyDay}>{day}일</span>
                                    ))}
                                </div>
                            </SecondaryCard>
                        )}

                        {data.tabs.money.leak_weekday && (
                            <SecondaryCard title="주의 요일" icon={<AlertTriangle size={16} />} variant="warning">
                                <strong>{data.tabs.money.leak_weekday}</strong>
                            </SecondaryCard>
                        )}
                    </SecondaryGrid>
                )
            }
        />
    );
}
