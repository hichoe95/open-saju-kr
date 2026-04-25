'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Download, Share2, RefreshCw } from 'lucide-react';
import styles from './ImageHero.module.css';

interface ImageHeroProps {
  imageBase64?: string | null;
  onSave?: () => void;
  onShare?: () => void;
  onRegenerate?: () => void;
}

export default function ImageHero({ imageBase64, onSave, onShare, onRegenerate }: ImageHeroProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!imageBase64) return null;

  const src = imageBase64.startsWith('data:') ? imageBase64 : `data:image/png;base64,${imageBase64}`;

  return (
    <div className={styles.heroContainer}>
      <div className={styles.imageWrapper} onClick={() => setIsExpanded(true)}>
        <Image
          src={src}
          alt="사주 이미지"
          fill
          className={styles.heroImage}
          unoptimized
        />
        <div className={styles.overlay}>
          <span className={styles.label}>AI가 그린 나의 사주</span>
          <div className={styles.actionButtons}>
            {onSave && (
              <button
                className={styles.actionBtn}
                onClick={e => { e.stopPropagation(); onSave(); }}
                aria-label="이미지 저장"
              >
                <Download size={16} />
                <span>저장</span>
              </button>
            )}
            {onShare && (
              <button
                className={styles.actionBtn}
                onClick={e => { e.stopPropagation(); onShare(); }}
                aria-label="이미지 공유"
              >
                <Share2 size={16} />
                <span>공유</span>
              </button>
            )}
            {onRegenerate && (
              <button
                className={styles.actionBtn}
                onClick={e => { e.stopPropagation(); onRegenerate(); }}
                aria-label="이미지 다시 만들기"
              >
                <RefreshCw size={16} />
                <span>다시 만들기</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 풀스크린 모달 */}
      {isExpanded && (
        <div className={styles.fullscreenModal} onClick={() => setIsExpanded(false)}>
          <Image
            src={src}
            alt="사주 이미지 (확대)"
            fill
            className={styles.fullscreenImage}
            unoptimized
          />
        </div>
      )}
    </div>
  );
}
