'use client';

import { useEffect, useRef } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import styles from './WithdrawModal.module.css';

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isLoading: boolean;
}

export default function WithdrawModal({ isOpen, onClose, onConfirm, isLoading }: WithdrawModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal} ref={modalRef}>
        <div className={styles.iconContainer}>
          <AlertTriangle size={32} strokeWidth={2} />
        </div>
        
        <h2 className={styles.title}>정말 탈퇴하시겠습니까?</h2>
        
        <p className={styles.description}>
          탈퇴하시면 모든 사주 분석 기록과<br />
          저장된 프로필 정보가 영구적으로 삭제됩니다.
        </p>
        
        <div className={styles.warningBox}>
          <div className={styles.warningItem}>
            <CheckCircle2 size={14} className={styles.warningIcon} />
            <span>생성된 모든 사주 리포트 삭제</span>
          </div>
          <div className={styles.warningItem}>
            <CheckCircle2 size={14} className={styles.warningIcon} />
            <span>저장된 사용자 정보 즉시 파기</span>
          </div>
          <div className={styles.warningItem}>
            <CheckCircle2 size={14} className={styles.warningIcon} />
            <span>재가입 시 이전 데이터 복구 불가</span>
          </div>
        </div>
        
        <div className={styles.buttonGroup}>
          <button 
            className={styles.cancelButton} 
            onClick={onClose}
            disabled={isLoading}
          >
            취소
          </button>
          <button 
            className={styles.confirmButton} 
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? '처리 중...' : '탈퇴하기'}
          </button>
        </div>
      </div>
    </div>
  );
}
