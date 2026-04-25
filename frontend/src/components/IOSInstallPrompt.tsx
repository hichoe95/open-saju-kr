'use client';

import { useState, useEffect } from 'react';
import { X, Share, Plus, Bell, MoreHorizontal } from 'lucide-react';
import styles from './IOSInstallPrompt.module.css';
import { needsIOSInstallPrompt, dismissIOSPermanent } from '@/lib/pwa';

const CRITICAL_MODAL_VISIBILITY_EVENT = 'mysaju:critical-modal-visibility';

export default function IOSInstallPrompt() {
    const [isVisible, setIsVisible] = useState(false);
    const [isSuppressedForSession, setIsSuppressedForSession] = useState(false);

    useEffect(() => {
        if (isSuppressedForSession) {
            return;
        }

        // 약간의 딜레이 후 표시 (UX 개선)
        const timer = setTimeout(() => {
            if (needsIOSInstallPrompt()) {
                setIsVisible(true);
            }
        }, 3000);

        return () => clearTimeout(timer);
    }, [isSuppressedForSession]);

    useEffect(() => {
        const handleCriticalModalVisibility = (event: Event) => {
            const detail = (event as CustomEvent<{ isOpen?: boolean }>).detail;
            if (!detail?.isOpen) {
                return;
            }

            setIsVisible(false);
            setIsSuppressedForSession(true);
        };

        window.addEventListener(CRITICAL_MODAL_VISIBILITY_EVENT, handleCriticalModalVisibility as EventListener);

        return () => {
            window.removeEventListener(CRITICAL_MODAL_VISIBILITY_EVENT, handleCriticalModalVisibility as EventListener);
        };
    }, []);

    const handleClose = () => {
        setIsVisible(false);
    };

    const handlePermanentDismiss = () => {
        dismissIOSPermanent();
        setIsVisible(false);
    };

    if (!isVisible || isSuppressedForSession) return null;

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                <button type="button" className={styles.closeBtn} onClick={handleClose}>
                    <X size={20} />
                </button>

                <div className={styles.iconWrapper}>
                    <Bell size={40} className={styles.bellIcon} />
                </div>

                <h2 className={styles.title}>앱 설치하고 알림 받기</h2>

                <p className={styles.description}>
                    홈 화면에 추가하면 분석 완료 시<br />
                    <strong>푸시 알림</strong>을 받을 수 있어요!
                </p>

                <div className={styles.steps}>
                    <div className={styles.step}>
                        <div className={styles.stepNumber}>1</div>
                        <div className={styles.stepContent}>
                            <MoreHorizontal size={20} />
                            <span>브라우저 오른쪽 하단의 <strong>...</strong> 버튼</span>
                        </div>
                    </div>

                    <div className={styles.step}>
                        <div className={styles.stepNumber}>2</div>
                        <div className={styles.stepContent}>
                            <Share size={20} className={styles.shareIcon} />
                            <span><strong>공유</strong> 버튼 선택</span>
                        </div>
                    </div>

                    <div className={styles.step}>
                        <div className={styles.stepNumber}>3</div>
                        <div className={styles.stepContent}>
                            <MoreHorizontal size={20} />
                            <span><strong>더보기 (...)</strong> 선택</span>
                        </div>
                    </div>

                    <div className={styles.step}>
                        <div className={styles.stepNumber}>4</div>
                        <div className={styles.stepContent}>
                            <Plus size={20} />
                            <span><strong>홈 화면에 추가</strong> 선택</span>
                        </div>
                    </div>
                </div>

                <div className={styles.actions}>
                    <button type="button" className={styles.dontShowBtn} onClick={handlePermanentDismiss}>
                        다시 보지 않기
                    </button>
                    <button type="button" className={styles.laterBtn} onClick={handleClose}>
                        닫기
                    </button>
                </div>

                <p className={styles.note}>
                    * iOS 16.4 이상에서 지원됩니다
                </p>
            </div>
        </div>
    );
}
