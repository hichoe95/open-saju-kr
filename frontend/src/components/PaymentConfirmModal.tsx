'use client';

import { useEffect } from 'react';
import styles from './PaymentConfirmModal.module.css';
import { Coins, X, AlertCircle } from 'lucide-react';

const CRITICAL_MODAL_VISIBILITY_EVENT = 'mysaju:critical-modal-visibility';

interface PaymentConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onCharge?: () => void;
  price: number;
  balance: number | null;
  featureName: string;
  isLoading?: boolean;
  title?: string;
  description?: string;
  confirmLabel?: string;
  chargeLabel?: string;
  errorMessage?: string;
}

export default function PaymentConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  onCharge,
  price,
  balance,
  featureName,
  isLoading = false,
  title = '엽전 사용 안내',
  description,
  confirmLabel = '사용하기',
  chargeLabel = '충전하기',
  errorMessage,
}: PaymentConfirmModalProps) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    window.dispatchEvent(
      new CustomEvent(CRITICAL_MODAL_VISIBILITY_EVENT, {
        detail: { isOpen: true },
      })
    );
  }, [isOpen]);

  if (!isOpen) return null;

  const canAfford = balance !== null && balance >= price;

  return (
    <div className={styles.overlay} data-testid="payment-confirm-modal">
      <button
        type="button"
        aria-label="결제 확인 닫기"
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          border: 'none',
          background: 'transparent',
          padding: 0,
          margin: 0,
          cursor: 'pointer',
        }}
      />
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <button type="button" className={styles.closeButton} onClick={onClose}>
          <X size={20} />
        </button>

        <div className={styles.iconWrapper}>
          <Coins size={40} />
        </div>

        <h2 className={styles.title}>{title}</h2>

        {description && (
          <p className={styles.description}>{description}</p>
        )}

        <div className={styles.priceBox}>
          <span className={styles.featureName}>{featureName}</span>
          <span className={styles.price}>{price.toLocaleString()} 엽전</span>
        </div>

        <div className={styles.balanceInfo}>
          <span>현재 보유</span>
          <span className={canAfford ? styles.balanceOk : styles.balanceLow}>
            {balance === null ? '확인 필요' : `${balance.toLocaleString()} 엽전`}
          </span>
        </div>

        {balance === null && (
          <div className={styles.warning}>
            <AlertCircle size={16} />
            <span>보유 엽전을 확인하지 못했습니다. 다시 로그인 후 시도해주세요.</span>
          </div>
        )}

        {balance !== null && !canAfford && (
          <div className={styles.warning}>
            <AlertCircle size={16} />
            <span>엽전이 부족합니다. 충전 후 이용해주세요.</span>
          </div>
        )}

        {errorMessage && (
          <div className={styles.warning}>
            <AlertCircle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className={styles.buttons}>
          <button type="button" className={styles.cancelButton} onClick={onClose} data-testid="payment-confirm-cancel">
            취소
          </button>
          {canAfford ? (
            <button
              type="button"
              className={styles.confirmButton}
              onClick={onConfirm}
              disabled={isLoading}
              data-testid="payment-confirm-submit"
            >
              {isLoading ? '처리 중...' : confirmLabel}
            </button>
          ) : (
            <button
              type="button"
              className={styles.chargeButton}
              onClick={() => {
                if (onCharge) {
                  onCharge();
                  return;
                }

                onClose();
                window.location.href = '/charge';
              }}
              data-testid="payment-confirm-charge"
            >
              {chargeLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
