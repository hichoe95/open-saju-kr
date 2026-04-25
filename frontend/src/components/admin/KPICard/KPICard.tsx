'use client';

import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import styles from './KPICard.module.css';

interface KPICardProps {
  title: string;
  value: string | number;
  unit?: string;
  subtitle?: string;
  changePercent?: number;
  trend?: 'up' | 'down' | 'neutral';
  icon: LucideIcon;
  isLoading?: boolean;
  color?: 'primary' | 'success' | 'warning' | 'error' | 'info' | 'danger';
}

export default function KPICard({
  title,
  value,
  unit,
  subtitle,
  changePercent,
  trend = 'neutral',
  icon: Icon,
  isLoading = false,
  color = 'primary',
}: KPICardProps) {
  const getTrendIcon = () => {
    switch (trend) {
      case 'up':
        return <TrendingUp size={14} />;
      case 'down':
        return <TrendingDown size={14} />;
      default:
        return <Minus size={14} />;
    }
  };

  const getTrendClass = () => {
    switch (trend) {
      case 'up':
        return styles.trendUp;
      case 'down':
        return styles.trendDown;
      default:
        return styles.trendNeutral;
    }
  };

  if (isLoading) {
    return (
      <div className={`${styles.card} ${styles.loading}`}>
        <div className={styles.iconWrapper}>
          <Icon size={24} />
        </div>
        <div className={styles.content}>
          <span className={styles.title}>{title}</span>
          <div className={styles.valueWrapper}>
            <span className={styles.value}>000</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.card} ${styles[color]}`}>
      <div className={styles.iconWrapper}>
        <Icon size={24} />
      </div>
      <div className={styles.content}>
        <span className={styles.title}>{title}</span>
        <div className={styles.valueWrapper}>
          <span className={styles.value}>{value}</span>
          {unit && <span className={styles.unit}>{unit}</span>}
        </div>
        {subtitle && (
          <span className={styles.subtitle}>{subtitle}</span>
        )}
        {changePercent !== undefined && (
          <div className={`${styles.trendWrapper} ${getTrendClass()}`}>
            {getTrendIcon()}
            <span>{Math.abs(changePercent).toFixed(1)}%</span>
            <span>{trend === 'up' ? '증가' : trend === 'down' ? '감소' : '변동없음'}</span>
          </div>
        )}
      </div>
    </div>
  );
}
