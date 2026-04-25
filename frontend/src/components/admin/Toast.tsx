'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { CheckCircle, XCircle, AlertCircle, AlertTriangle, X } from 'lucide-react';
import styles from './Toast.module.css';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
    id: string;
    message: string;
    type: ToastType;
}

interface ToastContextValue {
    showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastType, ReactNode> = {
    success: <CheckCircle size={20} />,
    error: <XCircle size={20} />,
    info: <AlertCircle size={20} />,
    warning: <AlertTriangle size={20} />,
};

const AUTO_DISMISS_MS = 4000;

interface ToastItemProps {
    toast: Toast;
    onClose: (id: string) => void;
}

function ToastItem({ toast, onClose }: ToastItemProps) {
    const [isExiting, setIsExiting] = useState(false);

    const handleClose = useCallback(() => {
        setIsExiting(true);
        setTimeout(() => onClose(toast.id), 300);
    }, [onClose, toast.id]);

    useEffect(() => {
        const timer = setTimeout(() => {
            handleClose();
        }, AUTO_DISMISS_MS);
        return () => clearTimeout(timer);
    }, [handleClose]);

    return (
        <div className={`${styles.toast} ${styles[toast.type]} ${isExiting ? styles.exit : ''}`}>
            <span className={styles.icon}>{ICONS[toast.type]}</span>
            <span className={styles.message}>{toast.message}</span>
            <button 
                className={styles.closeButton} 
                onClick={handleClose}
                aria-label="닫기"
            >
                <X size={16} />
            </button>
        </div>
    );
}

interface ToastProviderProps {
    children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((message: string, type: ToastType = 'success') => {
        const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        setToasts((prev) => [...prev, { id, message, type }]);
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className={styles.container}>
                {toasts.map((toast) => (
                    <ToastItem key={toast.id} toast={toast} onClose={removeToast} />
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast(): ToastContextValue {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}
