'use client';

import { useState, useRef } from 'react';
import { toPng } from 'html-to-image';
import styles from './ShareModal.module.css';
import { CompatibilityResponse, BirthInput, CompatibilityScenario } from '@/types';
import ModalHeader from './ModalHeader';
import { useModalClose } from '@/hooks/useModalBack';
import CompatibilityShareCard, { CardTheme } from './CompatibilityShareCard';
import {
    AlertCircle,
    Download, Share2, ChevronLeft, ChevronRight
} from 'lucide-react';

interface CompatibilityShareModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: CompatibilityResponse;
    userA: BirthInput;
    userB: BirthInput;
    scenario?: CompatibilityScenario;
}

const THEMES: { value: CardTheme; label: string; iconPath: string }[] = [
    { value: 'romantic', label: '로맨틱', iconPath: '/icons/emoji-replacements/themes/romantic.png' },
    { value: 'minimal', label: '미니멀', iconPath: '/icons/emoji-replacements/themes/minimal.png' },
    { value: 'dark', label: '다크', iconPath: '/icons/emoji-replacements/themes/dark.png' },
    { value: 'cute', label: '큐트', iconPath: '/icons/emoji-replacements/themes/cute.png' },
];

export default function CompatibilityShareModal({
    isOpen,
    onClose,
    data,
    userA,
    userB,
    scenario = 'lover'
}: CompatibilityShareModalProps) {
    const [error, setError] = useState<string | null>(null);

    const [selectedTheme, setSelectedTheme] = useState<CardTheme>('romantic');
    const [isSavingCard, setIsSavingCard] = useState(false);
    const cardRef = useRef<HTMLDivElement>(null);

    useModalClose(isOpen, onClose);

    if (!isOpen) return null;

    const handleSaveCard = async () => {
        if (!cardRef.current || isSavingCard) return;

        setIsSavingCard(true);
        try {
            await new Promise(resolve => setTimeout(resolve, 100));

            const dataUrl = await toPng(cardRef.current, {
                cacheBust: true,
                pixelRatio: 2,
                backgroundColor: '#ffffff',
            });

            const link = document.createElement('a');
            link.download = `compatibility_card_${Date.now()}.png`;
            link.href = dataUrl;
            link.click();
        } catch (err) {
            console.error('카드 저장 오류:', err);
            setError('이미지 저장에 실패했습니다');
        } finally {
            setIsSavingCard(false);
        }
    };

    const handleShareToSNS = async () => {
        if (!cardRef.current) return;

        try {
            const dataUrl = await toPng(cardRef.current, {
                cacheBust: true,
                pixelRatio: 2,
                backgroundColor: '#ffffff',
            });

            const response = await fetch(dataUrl);
            const blob = await response.blob();
            const file = new File([blob], 'compatibility_card.png', { type: 'image/png' });

            if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: '우리의 궁합',
                    text: `${userA.name || 'A'}님과 ${userB.name || 'B'}님의 궁합 결과입니다`,
                });
            } else {
                handleSaveCard();
            }
        } catch (err) {
            if ((err as Error).name !== 'AbortError') {
                console.error('공유 오류:', err);
                handleSaveCard();
            }
        }
    };

    const handleThemePrev = () => {
        const idx = THEMES.findIndex(t => t.value === selectedTheme);
        const newIdx = idx > 0 ? idx - 1 : THEMES.length - 1;
        setSelectedTheme(THEMES[newIdx].value);
    };

    const handleThemeNext = () => {
        const idx = THEMES.findIndex(t => t.value === selectedTheme);
        const newIdx = idx < THEMES.length - 1 ? idx + 1 : 0;
        setSelectedTheme(THEMES[newIdx].value);
    };

    const currentTheme = THEMES.find(t => t.value === selectedTheme)!;

    return (
        <div className={styles.overlay}>
            <button
                type="button"
                className={styles.overlayCloseButton}
                onClick={onClose}
                aria-label="공유 모달 닫기"
            />
            <div className={styles.modal}>
                <ModalHeader title="궁합 공유하기" onClose={onClose} />

                <div className={styles.content}>
                    <div className={styles.cardSection}>
                        <div className={styles.themeSelector}>
                            <button type="button" className={styles.themeNavBtn} onClick={handleThemePrev}>
                                <ChevronLeft size={20} />
                            </button>
                            <div className={styles.themeLabel}>
                                <span className={styles.themeEmoji}>
                                    <img
                                        src={currentTheme.iconPath}
                                        alt=""
                                        width={18}
                                        height={18}
                                        loading="eager"
                                    />
                                </span>
                                <span>{currentTheme.label}</span>
                            </div>
                            <button type="button" className={styles.themeNavBtn} onClick={handleThemeNext}>
                                <ChevronRight size={20} />
                            </button>
                        </div>

                        <div className={styles.themeDots}>
                            {THEMES.map((theme) => (
                                <button
                                    type="button"
                                    key={theme.value}
                                    className={`${styles.themeDot} ${selectedTheme === theme.value ? styles.themeDotActive : ''}`}
                                    onClick={() => setSelectedTheme(theme.value)}
                                    title={theme.label}
                                />
                            ))}
                        </div>

                        <div className={styles.cardPreview}>
                            <div className={styles.cardScaler}>
                                <CompatibilityShareCard
                                    ref={cardRef}
                                    data={data}
                                    userA={userA}
                                    userB={userB}
                                    scenario={scenario}
                                    theme={selectedTheme}
                                />
                            </div>
                        </div>

                        <div className={styles.cardActions}>
                            <button
                                type="button"
                                className={styles.downloadButton}
                                onClick={handleSaveCard}
                                disabled={isSavingCard}
                            >
                                <Download size={18} />
                                {isSavingCard ? '저장 중...' : '이미지 저장'}
                            </button>
                            <button
                                type="button"
                                className={styles.shareButton}
                                onClick={handleShareToSNS}
                            >
                                <Share2 size={18} />
                                SNS 공유
                            </button>
                        </div>

                        {error && (
                            <div className={styles.error}>
                                <AlertCircle size={14} />
                                {error}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
