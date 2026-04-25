'use client';

import styles from './OnboardingProgress.module.css';

interface OnboardingProgressProps {
  currentStep: number;
  totalSteps: number;
}

export default function OnboardingProgress({ currentStep, totalSteps }: OnboardingProgressProps) {
  return (
    <div className={styles.container}>
      <div className={styles.dots}>
        {Array.from({ length: totalSteps }, (_, index) => (
          <div
            key={index}
            className={`${styles.dot} ${
              index < currentStep ? styles.completed : ''
            } ${index === currentStep ? styles.active : ''}`}
          />
        ))}
      </div>
      <p className={styles.label}>
        {currentStep + 1} / {totalSteps}
      </p>
    </div>
  );
}
