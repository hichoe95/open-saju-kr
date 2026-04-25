'use client';

import Image from 'next/image';
import { Lock } from 'lucide-react';
import styles from './steps.module.css';
import DosaSpeechBubble from '../DosaSpeechBubble';
import { DOSA_IMAGES, DOSA_MESSAGES, OnboardingFormData } from '@/types/onboarding';

interface StepBirthDateProps {
  formData: OnboardingFormData;
  onUpdate: <K extends keyof OnboardingFormData>(field: K, value: OnboardingFormData[K]) => void;
  onNext: () => void;
}

const PROVIDER_LABELS: Record<string, string> = {
  kakao: '카카오',
  naver: '네이버',
};

export default function StepBirthDate({ formData, onUpdate, onNext }: StepBirthDateProps) {
  const hasOauthBirthDate = !!(formData.oauthBirthYear && formData.oauthBirthMonth && formData.oauthBirthDay);
  const provider = formData.oauthProvider;

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1940 + 1 }, (_, i) => String(currentYear - i));
  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const days = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));

  const isValid = formData.birthYear && formData.birthMonth && formData.birthDay;

  return (
    <div className={styles.stepContainer}>
      <DosaSpeechBubble
        message={DOSA_MESSAGES.step3}
        imageSrc={DOSA_IMAGES.calendar}
      />

      <div className={styles.content}>
        <div className={styles.calendarToggle}>
          <button
            type="button"
            className={`${styles.toggleBtn} ${formData.calendarType === 'solar' ? styles.active : ''}`}
            onClick={() => !hasOauthBirthDate && onUpdate('calendarType', 'solar')}
            disabled={hasOauthBirthDate}
          >
            양력
          </button>
          <button
            type="button"
            className={`${styles.toggleBtn} ${formData.calendarType === 'lunar' ? styles.active : ''}`}
            onClick={() => !hasOauthBirthDate && onUpdate('calendarType', 'lunar')}
            disabled={hasOauthBirthDate}
          >
            음력
          </button>
        </div>

        <div className={styles.dateSelects}>
          <select
            className={hasOauthBirthDate ? styles.readonlySelect : styles.select}
            value={formData.birthYear}
            onChange={(e) => onUpdate('birthYear', e.target.value)}
            disabled={hasOauthBirthDate}
          >
            {years.map(y => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>

          <select
            className={hasOauthBirthDate ? styles.readonlySelect : styles.select}
            value={formData.birthMonth}
            onChange={(e) => onUpdate('birthMonth', e.target.value)}
            disabled={hasOauthBirthDate}
          >
            {months.map(m => (
              <option key={m} value={m}>{m}월</option>
            ))}
          </select>

          <select
            className={hasOauthBirthDate ? styles.readonlySelect : styles.select}
            value={formData.birthDay}
            onChange={(e) => onUpdate('birthDay', e.target.value)}
            disabled={hasOauthBirthDate}
          >
            {days.map(d => (
              <option key={d} value={d}>{d}일</option>
            ))}
          </select>
        </div>

        {hasOauthBirthDate && provider ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <span className={styles.socialBadge}>
              <Image
                src={`/icons/social/${provider}.svg`}
                alt={provider}
                width={16}
                height={16}
              />
              {PROVIDER_LABELS[provider]}
            </span>
            <p className={styles.readonlyHint} style={{ marginTop: 0 }}>
              <Lock size={14} />
              소셜 계정에서 가져온 정보예요
            </p>
          </div>
        ) : (
          <p className={styles.hintCenter}>
            사주의 네 기둥(四柱) 중 년주·월주·일주가 결정돼요
          </p>
        )}

        <button
          type="button"
          className={`${styles.button} ${styles.buttonPrimary} ${styles.buttonFull}`}
          onClick={onNext}
          disabled={!isValid}
        >
          다음으로
        </button>
      </div>
    </div>
  );
}
