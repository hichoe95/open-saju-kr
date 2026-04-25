'use client';

import { useEffect, useCallback } from 'react';
import { AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import styles from './ConfirmModal.module.css';

type ModalVariant = 'danger' | 'warning' | 'info';

interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel: () => void;
    variant?: ModalVariant;
}

const ICONS: Record<ModalVariant, React.ReactNode> = {
    danger: <AlertTriangle size={24} />,
    warning: <AlertCircle size={24} />,
    info: <Info size={24} />,
};

export default function ConfirmModal({
    isOpen,
    title,
    message,
    confirmText = '확인',
    cancelText = '취소',
    onConfirm,
    onCancel,
    variant = 'info',
}: ConfirmModalProps) {
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onCancel();
            } else if (e.key === 'Enter') {
                onConfirm();
            }
        },
        [onCancel, onConfirm]
    );

    useEffect(() => {
        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [isOpen, handleKeyDown]);

    if (!isOpen) return null;

    return (
        <div className={styles.overlay} onClick={onCancel}>
            <div 
                className={styles.modal} 
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-title"
            >
                <button 
                    className={styles.closeButton}
                    onClick={onCancel}
                    aria-label="닫기"
                >
                    <X size={20} />
                </button>
                
                <div className={`${styles.iconWrapper} ${styles[variant]}`}>
                    {ICONS[variant]}
                </div>
                
                <h2 id="modal-title" className={styles.title}>{title}</h2>
                <p className={styles.message}>{message}</p>
                
                <div className={styles.actions}>
                    <button 
                        className={styles.cancelButton}
                        onClick={onCancel}
                    >
                        {cancelText}
                    </button>
                    <button 
                        className={`${styles.confirmButton} ${styles[variant]}`}
                        onClick={onConfirm}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
