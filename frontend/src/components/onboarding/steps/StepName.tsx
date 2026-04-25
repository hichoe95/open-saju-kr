'use client';

import { useState, useEffect, startTransition } from 'react';
import Image from 'next/image';
import { Lock } from 'lucide-react';
import styles from './steps.module.css';
import DosaSpeechBubble from '../DosaSpeechBubble';
import { DOSA_IMAGES, DOSA_MESSAGES, OnboardingFormData } from '@/types/onboarding';

interface StepNameProps {
  formData: OnboardingFormData;
  onUpdate: <K extends keyof OnboardingFormData>(field: K, value: OnboardingFormData[K]) => void;
  onNext: () => void;
}

const PROVIDER_LABELS: Record<string, string> = {
  kakao: '카카오',
  naver: '네이버',
};

export default function StepName({ formData, onUpdate, onNext }: StepNameProps) {
  const isReadonly = !!formData.oauthName;
  const provider = formData.oauthProvider;
  
  const [localName, setLocalName] = useState(formData.name);

  useEffect(() => {
    if (formData.name !== localName) {
      startTransition(() => {
        setLocalName(formData.name);
      });
    }
  }, [formData.name, localName]);

  const handleNext = () => {
    onUpdate('name', localName.trim() || '익명');
    onNext();
  };

  const isValid = localName.trim().length > 0;

  return (
    <div className={styles.stepContainer}>
      <DosaSpeechBubble
        message={DOSA_MESSAGES.step1}
        imageSrc={DOSA_IMAGES.listening}
      />

      <div className={styles.content}>
        <div className={styles.inputWrapper}>
          {isReadonly ? (
            <>
              <div className={styles.inputWithBadge}>
                <input
                  type="text"
                  className={styles.readonlyInput}
                  value={localName}
                  readOnly
                />
                {provider && (
                  <span className={`${styles.socialBadge} ${styles.inputBadge}`}>
                    <Image
                      src={`/icons/social/${provider}.svg`}
                      alt={provider}
                      width={16}
                      height={16}
                    />
                    {PROVIDER_LABELS[provider]}
                  </span>
                )}
              </div>
              <p className={styles.readonlyHint}>
                <Lock size={14} />
                소셜 계정에서 가져온 정보예요
              </p>
            </>
          ) : (
            <>
              <input
                type="text"
                className={styles.textInput}
                placeholder="이름 또는 별명을 입력하세요"
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                autoFocus
                maxLength={20}
              />
              <p className={styles.hint}>
                분석 결과에 표시되는 호칭이에요
              </p>
            </>
          )}
        </div>

        <button
          type="button"
          className={`${styles.button} ${styles.buttonPrimary} ${styles.buttonFull}`}
          onClick={handleNext}
          disabled={!isValid}
        >
          다음으로
        </button>
      </div>
    </div>
  );
}
