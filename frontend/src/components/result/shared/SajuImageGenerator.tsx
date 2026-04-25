'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Download, Image as ImageIcon, RefreshCw } from 'lucide-react';
import { SparkleIcon as PhosphorSparkleIcon } from '@phosphor-icons/react/dist/csr/Sparkle';
import styles from './SajuImageGenerator.module.css';
import { useAuth } from '@/contexts/AuthContext';
import { generateSajuImage } from '@/lib/api';
import { IMAGE_STYLES, ImageStyleKey } from '@/types';
import ModalHeader from '@/components/ModalHeader';
import { useModalClose } from '@/hooks/useModalBack';
import { usePayment } from '@/contexts/PaymentContext';

interface SajuImageGeneratorProps {
  data: {
    one_liner?: string | null;
    saju_image_base64?: string | null;
    card?: {
      character?: { summary?: string };
      tags?: string[];
    } | null;
  };
  birthInput?: { gender?: string };
  profileId?: string;
  readingId?: string;
  onImageGenerated?: (imageBase64: string) => void;
}

type GeneratorState = 'idle' | 'modal_open' | 'generating' | 'done';

export default function SajuImageGenerator({
  data,
  birthInput,
  profileId,
  readingId,
  onImageGenerated
}: SajuImageGeneratorProps) {
  const { token, isAuthenticated } = useAuth();
  const { canUseFeature } = usePayment();
  const [state, setState] = useState<GeneratorState>('idle');
  const [selectedStyle, setSelectedStyle] = useState<ImageStyleKey>('ink_wash');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const storageKey = `saju_image_${profileId || readingId || 'default'}`;
  const { price: imagePrice } = canUseFeature('saju_image');

  useEffect(() => {
    if (data.saju_image_base64) {
      setGeneratedImage(data.saju_image_base64);
      setState('done');
      return;
    }

    const storedImage = sessionStorage.getItem(storageKey);
    if (storedImage) {
      setGeneratedImage(storedImage);
      setState('done');
    }
  }, [data.saju_image_base64, storageKey]);

  useModalClose(state === 'modal_open', () => setState('idle'));

  const handleGenerate = async () => {
    if (!isAuthenticated) {
      setError('로그인이 필요합니다.');
      return;
    }

    setState('generating');
    setError(null);

    try {
      const request = {
        one_liner: data.one_liner || '',
        character_summary: data.card?.character?.summary || '',
        tags: data.card?.tags || [],
        gender: birthInput?.gender || 'male',
        style: selectedStyle
      };

      const response = await generateSajuImage(request, token ?? undefined);

      if (response.image_base64) {
        setGeneratedImage(response.image_base64);
        sessionStorage.setItem(storageKey, response.image_base64);
        setState('done');
        if (onImageGenerated) {
          onImageGenerated(response.image_base64);
        }
      } else {
        throw new Error('이미지 데이터가 없습니다.');
      }
    } catch (err) {
      console.error('Image generation error:', err);
      const errorMessage = err instanceof Error ? err.message : '알 수 없는 오류';
      
      if (errorMessage.includes('400') || errorMessage.includes('부족')) {
        setError('엽전이 부족합니다. 충전 후 다시 시도해주세요.');
      } else {
        setError('이미지 생성에 실패했습니다. 엽전은 자동 환불됩니다.');
      }
      setState('modal_open');
    }
  };

  const handleDownload = () => {
    if (!generatedImage) return;
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${generatedImage}`;
    link.download = `saju-image-${Date.now()}.png`;
    link.click();
  };

  if (state === 'idle') {
    return (
      <button
        type="button"
        className={styles.ctaBtn}
        onClick={() => setState('modal_open')}
      >
        <ImageIcon size={18} />
        <span>내 사주 이미지로 보기!</span>
      </button>
    );
  }

  if (state === 'done' && generatedImage) {
    return (
      <div className={styles.resultContainer}>
        <div className={styles.imageWrapper}>
          <Image
            src={`data:image/png;base64,${generatedImage}`}
            alt="AI 사주 이미지"
            fill
            className={styles.generatedImage}
            unoptimized
          />
        </div>
        <div className={styles.resultActions}>
          <button
            type="button"
            className={styles.downloadBtn}
            onClick={handleDownload}
          >
            <Download size={18} />
            <span>이미지 저장</span>
          </button>
          <button
            type="button"
            className={styles.retryBtn}
            onClick={() => setState('modal_open')}
          >
            <RefreshCw size={18} />
            <span>다시 생성</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <ModalHeader title="나의 사주 이미지 생성" onClose={() => state !== 'generating' && setState('idle')} />
        
        <div className={styles.content}>
          {state === 'generating' ? (
            <div className={styles.loadingContainer}>
              <div className={styles.spinner} />
              <p className={styles.loadingText}>
                이미지를 그리고 있습니다...<br />
                잠시만 기다려주세요
              </p>
            </div>
          ) : (
            <>
              <div className={styles.header}>
                <p className={styles.subtitle}>{imagePrice}엽전으로 나만의 AI 사주 이미지를 생성합니다</p>
              </div>

              <div className={styles.grid}>
                {IMAGE_STYLES.map((style) => (
                  <button
                    type="button"
                    key={style.key}
                    className={`${styles.card} ${selectedStyle === style.key ? styles.cardSelected : ''}`}
                    onClick={() => setSelectedStyle(style.key)}
                  >
                    {style.iconPath ? (
                      <img src={style.iconPath} alt={style.label} className={styles.emoji} loading="eager" />
                    ) : (
                      <span className={styles.emoji}><PhosphorSparkleIcon size={18} /></span>
                    )}
                    <span className={styles.label}>{style.label}</span>
                    <span className={styles.description}>{style.description}</span>
                  </button>
                ))}
              </div>

              <div className={styles.warning}>
                저장하지 않으면 탭을 닫을 때 사라집니다
              </div>

              {error && <div className={styles.error}>{error}</div>}

              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setState('idle')}
                >
                  취소
                </button>
                <button
                  type="button"
                  className={styles.generateBtn}
                  onClick={handleGenerate}
                >
                  <ImageIcon size={18} />
                  생성하기 ({imagePrice}엽전)
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
