'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import { Lock } from 'lucide-react';
import styles from './steps.module.css';
import DosaSpeechBubble from '../DosaSpeechBubble';
import { DOSA_IMAGES, DOSA_MESSAGES, OnboardingFormData } from '@/types/onboarding';

interface StepGenderProps {
  formData: OnboardingFormData;
  onUpdate: <K extends keyof OnboardingFormData>(field: K, value: OnboardingFormData[K]) => void;
  onNext: () => void;
}

const PROVIDER_LABELS: Record<string, string> = {
  kakao: '카카오',
  naver: '네이버',
};

export default function StepGender({ formData, onUpdate, onNext }: StepGenderProps) {
  const isReadonly = !!formData.oauthGender;
  const provider = formData.oauthProvider;

  useEffect(() => {
    if (isReadonly && formData.gender) {
      const timer = setTimeout(onNext, 800);
      return () => clearTimeout(timer);
    }
  }, [isReadonly, formData.gender, onNext]);

  const handleSelect = (gender: 'male' | 'female') => {
    if (isReadonly) return;
    onUpdate('gender', gender);
    setTimeout(onNext, 300);
  };

  const renderCard = (gender: 'male' | 'female', icon: string, label: string, sub: string) => {
    const isSelected = formData.gender === gender;
    const cardClass = isReadonly
      ? `${styles.readonlyCard} ${isSelected ? styles.selected : ''}`
      : `${styles.genderCard} ${isSelected ? styles.selected : ''}`;

    return (
      <button
        type="button"
        className={cardClass}
        onClick={() => handleSelect(gender)}
        disabled={isReadonly}
      >
        <span className={styles.genderIcon}>{icon}</span>
        <span className={styles.genderLabel}>{label}</span>
        <span className={styles.genderSub}>{sub}</span>
        {isReadonly && isSelected && provider && (
          <span className={styles.socialBadge}>
            <Image
              src={`/icons/social/${provider}.svg`}
              alt={provider}
              width={16}
              height={16}
            />
            {PROVIDER_LABELS[provider]}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className={styles.stepContainer}>
      <DosaSpeechBubble
        message={DOSA_MESSAGES.step2}
        imageSrc={DOSA_IMAGES.yinyang}
      />

      <div className={styles.content}>
        <div className={styles.genderCards}>
          {renderCard('male', '남', '남성', '순행 대운')}
          {renderCard('female', '여', '여성', '역행 대운')}
        </div>

        {isReadonly ? (
          <p className={styles.readonlyHint} style={{ justifyContent: 'center' }}>
            <Lock size={14} />
            소셜 계정에서 가져온 정보예요
          </p>
        ) : (
          <p className={styles.hintCenter}>
            대운(大運): 10년 주기로 바뀌는 인생의 큰 흐름
          </p>
        )}
      </div>
    </div>
  );
}
