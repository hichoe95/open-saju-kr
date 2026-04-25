'use client';

import { Users } from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from 'recharts';
import styles from './Charts.module.css';

export interface UserTrendData {
    date: string;
    count: number;
}

export interface UserTrendByProvider {
    date: string;
    kakao: number;
    naver: number;
    total: number;
}

interface UserTrendChartProps {
    data?: UserTrendData[];
    dataByProvider?: UserTrendByProvider[];
    title?: string;
    isLoading?: boolean;
}

const PROVIDER_COLORS = {
    kakao: '#FEE500',
    naver: '#03C75A',
};

const PROVIDER_LABELS = {
    kakao: '카카오',
    naver: '네이버',
};

interface TooltipPayloadItem {
    name: string;
    value: number;
    color: string;
    dataKey: string;
}

function CustomTooltip({ 
    active, 
    payload, 
    label 
}: { 
    active?: boolean; 
    payload?: TooltipPayloadItem[]; 
    label?: string;
}) {
    if (active && payload && payload.length) {
        const total = payload.reduce((sum, item) => sum + (item.value || 0), 0);
        return (
            <div className={styles.customTooltip}>
                <p className={styles.tooltipLabel}>{label}</p>
                {payload.map((item, index) => (
                    <p key={index} style={{ color: item.color, fontSize: '12px' }}>
                        {PROVIDER_LABELS[item.dataKey as keyof typeof PROVIDER_LABELS] || item.name}: {item.value}명
                    </p>
                ))}
                <p className={styles.tooltipValue} style={{ marginTop: '4px', borderTop: '1px solid #E5E7EB', paddingTop: '4px' }}>
                    총 {total}명
                </p>
            </div>
        );
    }
    return null;
}

export default function UserTrendChart({
    data,
    dataByProvider,
    title = '신규 가입 추이',
    isLoading = false,
}: UserTrendChartProps) {
    const hasProviderData = dataByProvider && dataByProvider.length > 0;
    const chartData = hasProviderData ? dataByProvider : data;

    if (isLoading) {
        return (
            <div className={styles.chartContainer}>
                <div className={styles.chartHeader}>
                    <h3 className={styles.chartTitle}>
                        <Users size={18} />
                        {title}
                    </h3>
                </div>
                <div className={styles.chartLoading}>로딩 중...</div>
            </div>
        );
    }

    if (!chartData || chartData.length === 0) {
        return (
            <div className={styles.chartContainer}>
                <div className={styles.chartHeader}>
                    <h3 className={styles.chartTitle}>
                        <Users size={18} />
                        {title}
                    </h3>
                </div>
                <div className={styles.chartEmpty}>
                    <Users size={40} />
                    <p>데이터가 없습니다</p>
                </div>
            </div>
        );
    }

    const totalSignups = hasProviderData 
        ? dataByProvider!.reduce((sum, d) => sum + d.total, 0)
        : data!.reduce((sum, d) => sum + d.count, 0);

    return (
        <div className={styles.chartContainer}>
            <div className={styles.chartHeader}>
                <div>
                    <h3 className={styles.chartTitle}>
                        <Users size={18} />
                        {title}
                    </h3>
                    <p className={styles.chartSubtitle}>
                        기간 내 총 {totalSignups.toLocaleString()}명 가입
                    </p>
                </div>
            </div>
            <div className={styles.chartWrapper}>
                <ResponsiveContainer width="100%" height="100%">
                    {hasProviderData ? (
                        <BarChart
                            data={dataByProvider}
                            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                            <XAxis
                                dataKey="date"
                                tick={{ fill: '#6B7280', fontSize: 12 }}
                                tickLine={false}
                                axisLine={{ stroke: '#E5E7EB' }}
                            />
                            <YAxis
                                tick={{ fill: '#6B7280', fontSize: 12 }}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => value.toLocaleString()}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend 
                                formatter={(value) => PROVIDER_LABELS[value as keyof typeof PROVIDER_LABELS] || value}
                                wrapperStyle={{ fontSize: '12px' }}
                            />
                            <Bar 
                                dataKey="kakao" 
                                stackId="provider" 
                                fill={PROVIDER_COLORS.kakao}
                                radius={[0, 0, 0, 0]}
                            />
                            <Bar 
                                dataKey="naver" 
                                stackId="provider" 
                                fill={PROVIDER_COLORS.naver}
                                radius={[4, 4, 0, 0]}
                            />
                        </BarChart>
                    ) : (
                        <BarChart
                            data={data}
                            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                            <XAxis
                                dataKey="date"
                                tick={{ fill: '#6B7280', fontSize: 12 }}
                                tickLine={false}
                                axisLine={{ stroke: '#E5E7EB' }}
                            />
                            <YAxis
                                tick={{ fill: '#6B7280', fontSize: 12 }}
                                tickLine={false}
                                axisLine={false}
                            />
                            <Tooltip />
                            <Bar dataKey="count" fill="#6366F1" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    )}
                </ResponsiveContainer>
            </div>
        </div>
    );
}
