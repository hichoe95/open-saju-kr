'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import styles from './steps.module.css';
import DosaSpeechBubble from '../DosaSpeechBubble';
import { DOSA_IMAGES, DOSA_MESSAGES, JIJI_HOURS, TOPICS, OnboardingFormData } from '@/types/onboarding';

interface StepConfirmProps {
  formData: OnboardingFormData;
  onUpdate: <K extends keyof OnboardingFormData>(field: K, value: OnboardingFormData[K]) => void;
  onStartAnalysis: () => void;
  onSkip: () => void;
}

export default function StepConfirm({ formData, onUpdate, onStartAnalysis, onSkip }: StepConfirmProps) {
  const [isAgreed, setIsAgreed] = useState(formData.isAgreed);

  const handleAgreementChange = (checked: boolean) => {
    setIsAgreed(checked);
    onUpdate('isAgreed', checked);
  };

  // 표시용 데이터 가공
  const selectedJiji = JIJI_HOURS.find(j => j.value === formData.birthJiji);
  const selectedTopic = TOPICS.find(t => t.value === formData.topic);
  const calendarLabel = formData.calendarType === 'solar' ? '양력' : '음력';
  const genderLabel = formData.gender === 'male' ? '남성' : '여성';

  return (
    <div className={styles.stepContainer}>
      <DosaSpeechBubble
        message={DOSA_MESSAGES.step6}
        imageSrc={DOSA_IMAGES.thumbsup}
      />

      <div className={styles.content}>
        <div className={styles.summaryCard}>
          <h4 className={styles.summaryTitle}>입력 정보 확인</h4>
          <ul className={styles.summaryList}>
            <li>
              <span className={styles.summaryLabel}>이름</span>
              <span className={styles.summaryValue}>{formData.name}</span>
            </li>
            <li>
              <span className={styles.summaryLabel}>성별</span>
              <span className={styles.summaryValue}>{genderLabel}</span>
            </li>
            <li>
              <span className={styles.summaryLabel}>생년월일</span>
              <span className={styles.summaryValue}>
                {formData.birthYear}년 {formData.birthMonth}월 {formData.birthDay}일 ({calendarLabel})
              </span>
            </li>
            <li>
              <span className={styles.summaryLabel}>출생시간</span>
              <span className={styles.summaryValue}>{selectedJiji?.label || '미상'}</span>
            </li>
            <li>
              <span className={styles.summaryLabel}>관심분야</span>
              <span className={styles.summaryValue}>{selectedTopic?.label}</span>
            </li>
          </ul>
        </div>

        <div className={styles.noticeBox}>
          <p className={styles.noticeItem}>
            <Image src="/icons/free.svg" alt="보너스" width={20} height={20} className={styles.noticeIcon} />
            그대의 첫 발걸음을 위해, 100엽전을 미리 얹어두었소
          </p>
          <p className={styles.noticeItem}>
            <Image src="/icons/timer.png" alt="시간" width={20} height={20} className={styles.noticeIcon} />
            최대 1분 정도 소요됩니다
          </p>
        </div>

        <div className={styles.agreementSection}>
          <label className={styles.agreementLabel}>
            <input
              type="checkbox"
              checked={isAgreed}
              onChange={(e) => handleAgreementChange(e.target.checked)}
              className={styles.checkbox}
            />
            <span>
              <Link href="/privacy" target="_blank" className={styles.link}>개인정보처리방침</Link> 및{' '}
              <Link href="/terms" target="_blank" className={styles.link}>이용약관</Link>에 동의합니다
            </span>
          </label>
        </div>

        <div className={styles.buttonGroup}>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonPrimary} ${styles.buttonFull}`}
            onClick={onStartAnalysis}
            disabled={!isAgreed}
          >
            심층 분석 시작하기
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonText}`}
            onClick={onSkip}
          >
            나중에 볼게요
          </button>
        </div>
      </div>
    </div>
  );
}
