'use client';

import { useState } from 'react';
import Image from 'next/image';
import styles from './SajuImage.module.css';
import { Palette, Image as ImageIcon, ZoomIn, ZoomOut, ChevronUp, ChevronDown, Download } from 'lucide-react';

interface SajuImageProps {
    imageBase64?: string;
    imagePrompt?: string;
}

export default function SajuImage({ imageBase64, imagePrompt }: SajuImageProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [showPrompt, setShowPrompt] = useState(false);

    // 이미지가 없으면 플레이스홀더 표시
    if (!imageBase64) {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <h3 className={styles.title}>
                        <Palette size={20} className={styles.icon} />
                        나의 사주 이미지
                </h3>
                <p className={styles.subtitle}>
                    AI가 당신의 운명을 시각화합니다
                </p>
            </div>
            <div className={styles.placeholder}>
                    <ImageIcon size={48} className={styles.placeholderIcon} />
                    <p>이미지 생성 기능 준비 중...</p>
                    <small>곧 당신만의 사주 이미지가 생성됩니다</small>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h3 className={styles.title}>
                    <Palette size={20} className={styles.icon} />
                    나의 사주 이미지
                </h3>
                <p className={styles.subtitle}>
                    AI가 당신의 운명을 시각화했습니다
                </p>
            </div>

            <div
                className={`${styles.imageWrapper} ${isExpanded ? styles.expanded : ''}`}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <Image
                    src={`data:image/png;base64,${imageBase64}`}
                    alt="나의 사주를 시각화한 이미지"
                    width={1200}
                    height={1200}
                    className={styles.image}
                    unoptimized
                />
                <div className={styles.overlay}>
                    <span className={styles.zoomIcon}>
                        {isExpanded ? <><ZoomOut size={16} /> 축소</> : <><ZoomIn size={16} /> 확대</>}
                    </span>
                </div>
            </div>

            {imagePrompt && (
                <div className={styles.promptSection}>
                    <button
                        className={styles.promptToggle}
                        onClick={() => setShowPrompt(!showPrompt)}
                    >
                        {showPrompt ? <><ChevronUp size={14} /> 생성 프롬프트 숨기기</> : <><ChevronDown size={14} /> 생성 프롬프트 보기</>}
                    </button>
                    {showPrompt && (
                        <p className={styles.promptText}>
                            {imagePrompt}
                        </p>
                    )}
                </div>
            )}

            <div className={styles.actions}>
                <a
                    href={`data:image/png;base64,${imageBase64}`}
                    download="my-saju-image.png"
                    className={styles.downloadButton}
                >
                    <Download size={16} /> 이미지 저장
                </a>
            </div>
        </div>
    );
}
