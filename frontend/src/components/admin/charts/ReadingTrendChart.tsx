'use client';

import { BarChart3, FileText } from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';
import styles from './Charts.module.css';

export interface ReadingTrendData {
    date: string;
    count: number;
}

interface ReadingTrendChartProps {
    data: ReadingTrendData[];
    title?: string;
    isLoading?: boolean;
}

interface TooltipPayload {
    value?: number;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string }) {
    if (active && payload && payload.length) {
        return (
            <div className={styles.customTooltip}>
                <p className={styles.tooltipLabel}>{label}</p>
                <p className={styles.tooltipValue}>
                    분석 요청: {payload[0].value?.toLocaleString()}건
                </p>
            </div>
        );
    }
    return null;
}

export default function ReadingTrendChart({
    data,
    title = '일별 분석 요청',
    isLoading = false,
}: ReadingTrendChartProps) {
    if (isLoading) {
        return (
            <div className={styles.chartContainer}>
                <div className={styles.chartHeader}>
                    <h3 className={styles.chartTitle}>
                        <FileText size={18} />
                        {title}
                    </h3>
                </div>
                <div className={styles.chartLoading}>로딩 중...</div>
            </div>
        );
    }

    if (!data || data.length === 0) {
        return (
            <div className={styles.chartContainer}>
                <div className={styles.chartHeader}>
                    <h3 className={styles.chartTitle}>
                        <FileText size={18} />
                        {title}
                    </h3>
                </div>
                <div className={styles.chartEmpty}>
                    <BarChart3 size={40} />
                    <p>데이터가 없습니다</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.chartContainer}>
            <div className={styles.chartHeader}>
                <div>
                    <h3 className={styles.chartTitle}>
                        <FileText size={18} />
                        {title}
                    </h3>
                    <p className={styles.chartSubtitle}>최근 7일간 사주 분석 요청</p>
                </div>
            </div>
            <div className={styles.chartWrapper}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={data}
                        margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
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
                        <Bar
                            dataKey="count"
                            fill="#3B82F6"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={50}
                        />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
