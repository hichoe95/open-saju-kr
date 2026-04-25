'use client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import styles from './Charts.module.css';

interface FunnelStep {
  name: string;
  count: number;
  conversion_rate: number;
}

interface ConversionFunnelChartProps {
  data: FunnelStep[];
  isLoading?: boolean;
  title?: string;
}

export default function ConversionFunnelChart({ data, isLoading, title = '전환 퍼널' }: ConversionFunnelChartProps) {
  if (isLoading) {
    return (
      <div className={styles.chartContainer}>
        <div className={styles.chartHeader}>
          <h3 className={styles.chartTitle}>{title}</h3>
        </div>
        <div className={styles.chartLoading}>데이터를 불러오는 중...</div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className={styles.chartContainer}>
        <div className={styles.chartHeader}>
          <h3 className={styles.chartTitle}>{title}</h3>
        </div>
        <div className={styles.chartEmpty}>데이터가 없습니다</div>
      </div>
    );
  }

  const getBarColor = (index: number, total: number) => {
    const opacity = 1 - (index / total) * 0.6;
    return `rgba(59, 130, 246, ${opacity})`;
  };

  return (
    <div className={styles.chartContainer}>
      <div className={styles.chartHeader}>
        <h3 className={styles.chartTitle}>{title}</h3>
      </div>
      <div className={styles.chartWrapper}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart 
            data={data} 
            layout="vertical" 
            margin={{ top: 10, right: 50, left: 40, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
            <XAxis type="number" hide />
            <YAxis 
              dataKey="name" 
              type="category" 
              tick={{ fontSize: 12, fill: '#6B7280' }} 
              axisLine={false}
              tickLine={false}
              width={80}
            />
            <Tooltip 
              cursor={{ fill: 'transparent' }}
              contentStyle={{ 
                backgroundColor: 'white', 
                borderRadius: '8px', 
                border: '1px solid #E5E7EB',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}
              itemStyle={{ fontSize: '12px', fontWeight: 500 }}
              labelStyle={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}
              formatter={(value, _name, props) => {
                const rate = (props as { payload?: { conversion_rate?: number } })?.payload?.conversion_rate ?? 0;
                return [`${Number(value).toLocaleString()}명 (${rate}%)`, '사용자'];
              }}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={30}>
              {data.map((entry, index) => (
                <Cell key={`cell-${entry.name}-${index}`} fill={getBarColor(index, data.length)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
