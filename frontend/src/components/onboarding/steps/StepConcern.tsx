'use client';

import { useState } from 'react';
import Image from 'next/image';
import styles from './steps.module.css';
import DosaSpeechBubble from '../DosaSpeechBubble';
import { DOSA_IMAGES, DOSA_MESSAGES, TOPICS, OnboardingFormData } from '@/types/onboarding';
import { ContextTopic } from '@/types';

interface StepConcernProps {
  formData: OnboardingFormData;
  onUpdate: <K extends keyof OnboardingFormData>(field: K, value: OnboardingFormData[K]) => void;
  onNext: () => void;
}

export default function StepConcern({ formData, onUpdate, onNext }: StepConcernProps) {
  const [localDetails, setLocalDetails] = useState(formData.details);

  const handleTopicSelect = (topic: ContextTopic) => {
    onUpdate('topic', topic);
  };

  const handleNext = () => {
    onUpdate('details', localDetails);
    onNext();
  };

  return (
    <div className={styles.stepContainer}>
      <DosaSpeechBubble
        message={DOSA_MESSAGES.step5}
        imageSrc={DOSA_IMAGES.thinking}
      />

      <div className={styles.content}>
        <div className={styles.topicGrid}>
          {TOPICS.map(topic => (
            <button
              key={topic.value}
              type="button"
              className={`${styles.topicCard} ${formData.topic === topic.value ? styles.selected : ''}`}
              onClick={() => handleTopicSelect(topic.value)}
            >
              <Image
                src={topic.image}
                alt={topic.label}
                width={32}
                height={32}
                className={styles.topicImage}
              />
              <span className={styles.topicLabel}>{topic.label}</span>
            </button>
          ))}
        </div>

        <div className={styles.textareaWrapper}>
          <label className={styles.textareaLabel}>상세 내용 (선택)</label>
          <textarea
            className={styles.textarea}
            placeholder="구체적인 상황을 적어주시면 더 정확한 분석이 가능해요!"
            value={localDetails}
            onChange={(e) => setLocalDetails(e.target.value)}
            rows={3}
          />
        </div>

        <button
          type="button"
          className={`${styles.button} ${styles.buttonPrimary} ${styles.buttonFull}`}
          onClick={handleNext}
        >
          다음으로
        </button>
      </div>
    </div>
  );
}
