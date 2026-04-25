'use client';

import { PieChart as PieChartIcon, Users } from 'lucide-react';
import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    Tooltip,
} from 'recharts';
import styles from './Charts.module.css';

export interface ProviderData {
    name: string;
    value: number;
    label: string;
}

interface ProviderPieChartProps {
    data: ProviderData[];
    title?: string;
    isLoading?: boolean;
}

const PROVIDER_COLORS: Record<string, string> = {
    kakao: '#FEE500',
    naver: '#03C75A',
    email: '#6B7280',
};

const PROVIDER_LABELS: Record<string, string> = {
    kakao: '카카오',
    naver: '네이버',
    email: '이메일',
};

interface TooltipPayload {
    payload: ProviderData & { color: string; label: string };
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        return (
            <div className={styles.customTooltip}>
                <p className={styles.tooltipLabel}>{data.label}</p>
                <p className={styles.tooltipValue}>
                    {data.value.toLocaleString()}명
                </p>
            </div>
        );
    }
    return null;
}

interface LabelProps {
    cx?: number;
    cy?: number;
    midAngle?: number;
    innerRadius?: number;
    outerRadius?: number;
    percent?: number;
}

function renderCustomLabel(props: LabelProps) {
    const { cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, percent = 0 } = props;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    if (percent < 0.05) return null;

    return (
        <text
            x={x}
            y={y}
            fill="#1F2937"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={12}
            fontWeight={600}
        >
            {`${(percent * 100).toFixed(0)}%`}
        </text>
    );
}

export default function ProviderPieChart({
    data,
    title = '로그인 방식 분포',
    isLoading = false,
}: ProviderPieChartProps) {
    const chartData = data.map((item) => ({
        ...item,
        color: PROVIDER_COLORS[item.name] || '#9CA3AF',
        label: PROVIDER_LABELS[item.name] || item.name,
    }));

    const total = chartData.reduce((sum, item) => sum + item.value, 0);

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

    if (!data || data.length === 0) {
        return (
            <div className={styles.chartContainer}>
                <div className={styles.chartHeader}>
                    <h3 className={styles.chartTitle}>
                        <Users size={18} />
                        {title}
                    </h3>
                </div>
                <div className={styles.chartEmpty}>
                    <PieChartIcon size={40} />
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
                        <Users size={18} />
                        {title}
                    </h3>
                    <p className={styles.chartSubtitle}>전체 {total.toLocaleString()}명</p>
                </div>
            </div>
            <div className={styles.chartWrapperSmall}>
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={chartData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={renderCustomLabel}
                            outerRadius={80}
                            innerRadius={40}
                            fill="#8884d8"
                            dataKey="value"
                            paddingAngle={2}
                        >
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                </ResponsiveContainer>
            </div>
            <div className={styles.customLegend}>
                {chartData.map((entry, index) => (
                    <div key={index} className={styles.legendItem}>
                        <span
                            className={styles.legendDot}
                            style={{ backgroundColor: entry.color }}
                        />
                        <span>{entry.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
