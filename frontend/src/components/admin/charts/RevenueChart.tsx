'use client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import styles from './Charts.module.css';

interface RevenueChartProps {
  data: Array<{ date: string; revenue: number; transactions: number }>;
  isLoading?: boolean;
  title?: string;
}

export default function RevenueChart({ data, isLoading, title = '매출 및 결제 건수' }: RevenueChartProps) {
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
          <LineChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
            <XAxis 
              dataKey="date" 
              tick={{ fontSize: 12, fill: '#6B7280' }} 
              axisLine={false}
              tickLine={false}
              dy={10}
            />
            <YAxis 
              yAxisId="left"
              tick={{ fontSize: 12, fill: '#6B7280' }} 
              axisLine={false}
              tickLine={false}
              tickFormatter={(value) => `₩${value.toLocaleString()}`}
            />
            <YAxis 
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 12, fill: '#6B7280' }} 
              axisLine={false}
              tickLine={false}
              tickFormatter={(value) => `${value}건`}
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
              formatter={(value, name) => {
                if (name === '매출') return [`₩${Number(value).toLocaleString()}`, name];
                return [`${value}건`, name];
              }}
            />
            <Legend 
              wrapperStyle={{ paddingTop: '20px' }}
              formatter={(value) => <span style={{ color: '#6B7280', fontSize: '12px' }}>{value}</span>}
            />
            <Line 
              yAxisId="left"
              type="monotone" 
              dataKey="revenue" 
              stroke="#22C55E" 
              strokeWidth={2}
              dot={{ r: 3, fill: '#22C55E' }}
              activeDot={{ r: 5 }}
              name="매출"
            />
            <Line 
              yAxisId="right"
              type="monotone" 
              dataKey="transactions" 
              stroke="#3B82F6" 
              strokeWidth={2}
              dot={{ r: 3, fill: '#3B82F6' }}
              activeDot={{ r: 5 }}
              name="결제 건수"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
