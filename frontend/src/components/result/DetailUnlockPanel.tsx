'use client';

import { LockKeyhole, Sparkles } from 'lucide-react';
import styles from './DetailUnlockPanel.module.css';

interface DetailUnlockPanelProps {
  title: string;
  summary: string;
  tabKey: string;
  price: number;
  isAuthenticated: boolean;
  isLoading?: boolean;
  onRequestDetail: () => void;
}

export default function DetailUnlockPanel({
  title,
  summary,
  tabKey,
  price,
  isAuthenticated,
  isLoading = false,
  onRequestDetail,
}: DetailUnlockPanelProps) {
  return (
    <section className={styles.panel} data-testid={`detail-unlock-panel-${tabKey}`}>
      <div className={styles.badge}>
        <Sparkles size={14} />
        <span>무료 요약은 여기까지</span>
      </div>

      <h3 className={styles.title}>{title} 요약</h3>
      <p className={styles.summary}>{summary}</p>

      <div className={styles.lockCard}>
        <div className={styles.lockIcon}>
          <LockKeyhole size={18} />
        </div>
        <div>
          <strong>이 리딩의 전체 상세 해설은 잠겨 있어요.</strong>
          <p>한 번 열면 모든 탭의 상세 해설이 함께 열리고, 결제 후에는 요청했던 {title} 탭으로 바로 돌아갑니다.</p>
        </div>
      </div>

      <button
        type="button"
        className={styles.cta}
        onClick={onRequestDetail}
        disabled={isLoading}
        data-testid={`detail-unlock-cta-${tabKey}`}
      >
        {isLoading
          ? '확인 중...'
          : isAuthenticated
            ? `${price.toLocaleString()}엽전으로 이 리딩 전체 상세 해설 열기`
            : '로그인하고 이 리딩 전체 상세 해설 열기'}
      </button>
    </section>
  );
}
