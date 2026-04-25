'use client';

import { Coins, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { usePayment } from '@/contexts/PaymentContext';
import { useAuth } from '@/contexts/AuthContext';
import styles from './CoinBalance.module.css';

interface CoinBalanceProps {
  showPlus?: boolean;
  size?: 'sm' | 'md';
}

export default function CoinBalance({ showPlus = true, size = 'md' }: CoinBalanceProps) {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { wallet, walletError, isLoading } = usePayment();

  // 비로그인 또는 로딩 중이면 표시 안함
  if (!isAuthenticated || isLoading) return null;

  return (
    <button
      type="button"
      className={`${styles.container} ${styles[size]}`}
      onClick={() => router.push('/charge')}
    >
      <Coins size={size === 'sm' ? 14 : 16} className={styles.icon} />
      <span className={styles.balance}>{walletError ? '확인 필요' : (wallet?.balance?.toLocaleString() ?? '0')}</span>
      {showPlus && <Plus size={size === 'sm' ? 12 : 14} className={styles.plus} />}
    </button>
  );
}
