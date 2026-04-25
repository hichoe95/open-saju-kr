'use client';

import { useState } from 'react';
import { CardsIcon } from '@phosphor-icons/react/dist/csr/Cards';
import { UploadIcon } from '@phosphor-icons/react/dist/csr/Upload';
import styles from '../ResultTabs.module.css';

interface ActionButtonsProps {
    onPresentationOpen: () => void;
    onShareModalOpen: () => void;
    disabled?: boolean;
    showCompatibilityPrompt?: boolean;
    onCompatibilityPromptDismiss?: () => void;
    onCompatibilityPromptClick?: () => void;
}

export default function ActionButtons({
    onPresentationOpen,
    onShareModalOpen,
    disabled,
    showCompatibilityPrompt = false,
    onCompatibilityPromptDismiss,
    onCompatibilityPromptClick,
}: ActionButtonsProps) {
    const [isLoading, setIsLoading] = useState(false);

    const handleAction = (callback: () => void) => {
        if (isLoading || disabled) return;
        setIsLoading(true);
        callback();
        // Prevent double-click by keeping loading state for a short duration
        setTimeout(() => setIsLoading(false), 500);
    };

    return (
        <div className={styles.ctaContainer}>
            <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => handleAction(onShareModalOpen)}
                disabled={disabled || isLoading}
                data-testid="open-share-modal-button"
            >
                <UploadIcon size={18} />
                <span>친구에게 보내기</span>
            </button>
            <button
                type="button"
                className={styles.outlineButton}
                onClick={() => handleAction(onPresentationOpen)}
                disabled={disabled || isLoading}
                data-testid="open-presentation-button"
            >
                <CardsIcon size={18} />
                <span>카드 보기</span>
            </button>
            {showCompatibilityPrompt ? (
                <div className={styles.compatibilityPromptCard} data-testid="compatibility-prompt-inline">
                    <div className={styles.compatibilityPromptBody}>
                        <p className={styles.compatibilityPromptTitle}>벗에게 사주를 보내고, 함께 궁합도 살펴보시겠소?</p>
                        <p className={styles.compatibilityPromptText}>사주를 나눈 뒤 궁합까지 자연스럽게 이어볼 수 있소.</p>
                    </div>
                    <div className={styles.compatibilityPromptActions}>
                        <button
                            type="button"
                            className={styles.compatibilityPromptButton}
                            onClick={() => handleAction(() => {
                                if (onCompatibilityPromptClick) {
                                    onCompatibilityPromptClick();
                                } else {
                                    onShareModalOpen();
                                }
                            })}
                        >
                            사주 보내고 궁합 보기
                        </button>
                        <button
                            type="button"
                            className={styles.compatibilityPromptDismiss}
                            onClick={onCompatibilityPromptDismiss}
                        >
                            나중에
                        </button>
                    </div>
                </div>
            ) : (
                <p className={styles.shareHint}>혼자 보기 아쉽다면, 벗에게 보내 궁합도 함께 보시게</p>
            )}
        </div>
    );
}
