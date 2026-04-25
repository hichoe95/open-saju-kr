'use client';

import styles from './steps.module.css';
import DosaSpeechBubble from '../DosaSpeechBubble';
import { DOSA_IMAGES, DOSA_MESSAGES, JIJI_HOURS, OnboardingFormData } from '@/types/onboarding';

interface StepBirthTimeProps {
  formData: OnboardingFormData;
  onUpdate: <K extends keyof OnboardingFormData>(field: K, value: OnboardingFormData[K]) => void;
  onNext: () => void;
}

export default function StepBirthTime({ formData, onUpdate, onNext }: StepBirthTimeProps) {
  const handleSelect = (value: string) => {
    onUpdate('birthJiji', value);
  };

  return (
    <div className={styles.stepContainer}>
      <DosaSpeechBubble
        message={DOSA_MESSAGES.step4}
        imageSrc={DOSA_IMAGES.time}
      />

      <div className={styles.content}>
        <select
          className={`${styles.select} ${styles.selectFull}`}
          value={formData.birthJiji}
          onChange={(e) => handleSelect(e.target.value)}
        >
          {JIJI_HOURS.map(jiji => (
            <option key={jiji.value} value={jiji.value}>
              {jiji.label}
            </option>
          ))}
        </select>

        <p className={styles.hintCenter}>
          12지지: 하루를 12등분한 전통 시간 단위예요
        </p>

        <button
          type="button"
          className={`${styles.button} ${styles.buttonPrimary} ${styles.buttonFull}`}
          onClick={onNext}
        >
          다음으로
        </button>
      </div>
    </div>
  );
}
