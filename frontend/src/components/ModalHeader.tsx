'use client';

import { ArrowLeft, X } from 'lucide-react';
import styles from './ModalHeader.module.css';

interface ModalHeaderProps {
  title: string;
  onClose: () => void;
  showBackButton?: boolean;
  showCloseButton?: boolean;
}

export default function ModalHeader({
  title,
  onClose,
  showBackButton = true,
  showCloseButton = true,
}: ModalHeaderProps) {
  return (
    <div className={styles.header}>
      <div className={styles.left}>
        {showBackButton && (
          <button
            className={styles.backButton}
            onClick={onClose}
            aria-label="뒤로 가기"
          >
            <ArrowLeft size={20} />
          </button>
        )}
      </div>
      <h2 className={styles.title}>{title}</h2>
      <div className={styles.right}>
        {showCloseButton && (
          <button
            className={styles.closeButton}
            onClick={onClose}
            aria-label="닫기"
          >
            <X size={20} />
          </button>
        )}
      </div>
    </div>
  );
}
