'use client';

import { useEffect } from 'react';
import styles from './steps.module.css';
import DosaSpeechBubble from '../DosaSpeechBubble';
import { DOSA_IMAGES, DOSA_MESSAGES, OnboardingFormData } from '@/types/onboarding';

interface StepPrefillProps {
  formData: OnboardingFormData;
  onUpdate: <K extends keyof OnboardingFormData>(field: K, value: OnboardingFormData[K]) => void;
  onNext: () => void;
  oauthProfile?: {
    provider?: 'kakao' | 'naver';
    name?: string;
    birthday?: string;
    birthyear?: string;
    gender?: string;
  };
}

export default function StepPrefill({ onUpdate, onNext, oauthProfile }: StepPrefillProps) {
  const hasOAuthData = oauthProfile && (oauthProfile.name || oauthProfile.birthyear);

  // OAuth 데이터가 없으면 마운트 후 다음 단계로 이동
  useEffect(() => {
    if (!hasOAuthData) {
      onNext();
    }
  }, [hasOAuthData, onNext]);

  const handleUsePrefill = (usePrefill: boolean) => {
    onUpdate('usePrefill', usePrefill);

    if (usePrefill && oauthProfile) {
      if (oauthProfile.provider) {
        onUpdate('oauthProvider', oauthProfile.provider);
      }
      if (oauthProfile.name) {
        onUpdate('name', oauthProfile.name);
        onUpdate('oauthName', oauthProfile.name);
      }
      if (oauthProfile.birthyear) {
        onUpdate('birthYear', oauthProfile.birthyear);
        onUpdate('oauthBirthYear', oauthProfile.birthyear);
      }
      if (oauthProfile.birthday) {
        const birthday = oauthProfile.birthday.replace('-', '');
        if (birthday.length >= 4) {
          onUpdate('birthMonth', birthday.substring(0, 2));
          onUpdate('birthDay', birthday.substring(2, 4));
          onUpdate('oauthBirthMonth', birthday.substring(0, 2));
          onUpdate('oauthBirthDay', birthday.substring(2, 4));
        }
      }
      if (oauthProfile.gender) {
        const gender = oauthProfile.gender.toLowerCase() === 'male' ? 'male' : 'female';
        onUpdate('gender', gender);
        onUpdate('oauthGender', gender);
      }
    }

    onNext();
  };

  // OAuth 데이터가 없으면 로딩 상태 표시 (useEffect에서 처리)
  if (!hasOAuthData) {
    return null;
  }

  return (
    <div className={styles.stepContainer}>
      <DosaSpeechBubble
        message={DOSA_MESSAGES.step0}
        imageSrc={DOSA_IMAGES.welcome}
      />

      <div className={styles.content}>
        <div className={styles.oauthCard}>
          <h4 className={styles.oauthTitle}>가져온 정보</h4>
          <ul className={styles.oauthList}>
            {oauthProfile?.name && (
              <li>이름: <strong>{oauthProfile.name}</strong></li>
            )}
            {oauthProfile?.birthyear && (
              <li>출생년도: <strong>{oauthProfile.birthyear}년</strong></li>
            )}
            {oauthProfile?.birthday && (
              <li>생일: <strong>{oauthProfile.birthday.substring(0, 2)}월 {oauthProfile.birthday.substring(2, 4)}일</strong></li>
            )}
            {oauthProfile?.gender && (
              <li>성별: <strong>{oauthProfile.gender === 'male' ? '남성' : '여성'}</strong></li>
            )}
          </ul>
        </div>

        <div className={styles.buttonGroup}>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonPrimary}`}
            onClick={() => handleUsePrefill(true)}
          >
            이 정보로 시작할게요
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonSecondary}`}
            onClick={() => handleUsePrefill(false)}
          >
            직접 입력할게요
          </button>
        </div>
      </div>
    </div>
  );
}
