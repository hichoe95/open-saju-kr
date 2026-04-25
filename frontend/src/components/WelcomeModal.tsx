'use client';

import { useEffect, useState, startTransition } from 'react';
import styles from './WelcomeModal.module.css';
import { Gift, Coins, X, PartyPopper, Info } from 'lucide-react';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  bonusAmount?: number;
}

export default function WelcomeModal({ isOpen, onClose, bonusAmount = 100 }: WelcomeModalProps) {
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      startTransition(() => {
        setIsAnimating(true);
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay}>
      <button
        type="button"
        className={styles.backdropButton}
        onClick={onClose}
        aria-label="환영 모달 닫기"
      />
      <div
        className={`${styles.modal} ${isAnimating ? styles.modalAnimated : ''}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-modal-title"
        tabIndex={-1}
      >
        <button type="button" className={styles.closeButton} onClick={onClose}>
          <X size={20} />
        </button>

        <div className={styles.iconWrapper}>
          <div className={styles.iconBg}>
            <Gift size={48} className={styles.giftIcon} />
          </div>
          <PartyPopper size={24} className={styles.confetti1} />
          <PartyPopper size={24} className={styles.confetti2} />
        </div>

        <h2 id="welcome-modal-title" className={styles.title}>
          사주의 문 앞에 다다르신 것을<br />환영합니다!
        </h2>

        <div className={styles.bonusCard}>
          <Coins size={28} className={styles.coinIcon} />
          <div className={styles.bonusInfo}>
            <span className={styles.bonusLabel}>가입 축하 선물</span>
            <span className={styles.bonusAmount}>{bonusAmount.toLocaleString()} 엽전</span>
          </div>
        </div>

        <p className={styles.description}>
          그대의 첫 발걸음을 위해, <strong>100엽전을 미리 얹어두었소.</strong>
          원하는 분석부터 천천히 둘러보시게.
        </p>

        <div className={styles.notice}>
          <Info size={16} />
          <span>지급된 엽전으로 원하는 분석과 상담을 바로 시작할 수 있습니다.</span>
        </div>

        <button type="button" className={styles.startButton} onClick={onClose}>
          시작하기
        </button>
      </div>
    </div>
  );
}
