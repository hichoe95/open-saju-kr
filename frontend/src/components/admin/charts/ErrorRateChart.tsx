'use client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import styles from './Charts.module.css';

interface ErrorRateChartProps {
  data: Array<{ date: string; error_count: number; total_count: number; error_rate: number }>;
  isLoading?: boolean;
  title?: string;
  threshold?: number;
}

export default function ErrorRateChart({ data, isLoading, title = '에러율 추이', threshold }: ErrorRateChartProps) {
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

  return (
    <div className={styles.chartContainer}>
      <div className={styles.chartHeader}>
        <h3 className={styles.chartTitle}>{title}</h3>
      </div>
      <div className={styles.chartWrapper}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorError" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#EF4444" stopOpacity={0.2}/>
                <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
            <XAxis 
              dataKey="date" 
              tick={{ fontSize: 12, fill: '#6B7280' }} 
              axisLine={false}
              tickLine={false}
              dy={10}
            />
            <YAxis 
              tick={{ fontSize: 12, fill: '#6B7280' }} 
              axisLine={false}
              tickLine={false}
              tickFormatter={(value) => `${value}%`}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'white', 
                borderRadius: '8px', 
                border: '1px solid #E5E7EB',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}
              itemStyle={{ fontSize: '12px', fontWeight: 500 }}
              labelStyle={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}
              formatter={(value) => [`${value}%`, '에러율']}
            />
            {threshold && (
              <ReferenceLine y={threshold} stroke="#EF4444" strokeDasharray="3 3" label={{ value: '임계치', fill: '#EF4444', fontSize: 10 }} />
            )}
            <Line 
              type="monotone" 
              dataKey="error_rate" 
              stroke="#EF4444" 
              strokeWidth={2}
              dot={{ r: 3, fill: '#EF4444' }}
              activeDot={{ r: 5 }}
              name="에러율"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
