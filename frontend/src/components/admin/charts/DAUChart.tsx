'use client';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import styles from './Charts.module.css';

interface DAUChartProps {
  data: Array<{ date: string; dau: number; page_views: number }>;
  isLoading?: boolean;
  title?: string;
}

export default function DAUChart({ data, isLoading, title = '일간 활성 사용자 (DAU)' }: DAUChartProps) {
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
          <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorDau" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorPv" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#93C5FD" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#93C5FD" stopOpacity={0}/>
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
            />
            <Area 
              type="monotone" 
              dataKey="page_views" 
              stroke="#93C5FD" 
              fillOpacity={1} 
              fill="url(#colorPv)" 
              name="페이지뷰"
            />
            <Area 
              type="monotone" 
              dataKey="dau" 
              stroke="#3B82F6" 
              fillOpacity={1} 
              fill="url(#colorDau)" 
              name="DAU"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
