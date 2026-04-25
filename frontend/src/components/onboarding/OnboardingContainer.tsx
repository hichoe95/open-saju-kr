'use client';

import { useState, useEffect, useCallback, useRef, startTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import styles from './OnboardingContainer.module.css';
import OnboardingProgress from './OnboardingProgress';
import StepPrefill from './steps/StepPrefill';
import StepName from './steps/StepName';
import StepGender from './steps/StepGender';
import StepBirthDate from './steps/StepBirthDate';
import StepBirthTime from './steps/StepBirthTime';
import StepConcern from './steps/StepConcern';
import StepConfirm from './steps/StepConfirm';
import {
  OnboardingFormData,
  OnboardingStep,
  ONBOARDING_STORAGE_KEY,
  ONBOARDING_ANALYSIS_KEY,
  SIGNUP_PROFILE_KEY,
  SignupProfileData,
  INITIAL_FORM_DATA,
  JIJI_HOURS,
} from '@/types/onboarding';
import { BirthInput, ModelSelection, Provider } from '@/types';

interface OnboardingContainerProps {
  oauthProfile?: {
    provider?: 'kakao' | 'naver';
    name?: string;
    birthday?: string;
    birthyear?: string;
    gender?: string;
  };
  onComplete: () => void;
}

export default function OnboardingContainer({ oauthProfile, onComplete }: OnboardingContainerProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(0);
  const [formData, setFormData] = useState<OnboardingFormData>(INITIAL_FORM_DATA);
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [isInitialized, setIsInitialized] = useState(false);
  const didLoadRef = useRef(false);

  useEffect(() => {
    if (didLoadRef.current) return;
    didLoadRef.current = true;

     const signupProfileStr = sessionStorage.getItem(SIGNUP_PROFILE_KEY);
     if (signupProfileStr) {
       try {
         const profile: SignupProfileData = JSON.parse(signupProfileStr);
         startTransition(() => {
           setFormData(prev => ({
             ...prev,
             name: profile.name || prev.name,
             gender: profile.gender || prev.gender,
             birthYear: profile.birthYear || prev.birthYear,
             birthMonth: profile.birthMonth || prev.birthMonth,
             birthDay: profile.birthDay || prev.birthDay,
           }));
           setCurrentStep(1);
         });
         sessionStorage.removeItem(SIGNUP_PROFILE_KEY);
         sessionStorage.removeItem(ONBOARDING_STORAGE_KEY);
       } catch (e) {
         console.error('Failed to parse signup profile:', e);
       }
       startTransition(() => {
         setIsInitialized(true);
       });
       return;
     }

     const saved = sessionStorage.getItem(ONBOARDING_STORAGE_KEY);
     if (saved) {
       try {
         const { currentStep: savedStep, formData: savedData } = JSON.parse(saved);
         startTransition(() => {
           setCurrentStep(savedStep);
           setFormData(savedData);
         });
       } catch (e) {
         console.error('Failed to restore onboarding data:', e);
       }
     }
     startTransition(() => {
       setIsInitialized(true);
     });
  }, []);

  useEffect(() => {
    if (!isInitialized) return;
    sessionStorage.setItem(
      ONBOARDING_STORAGE_KEY,
      JSON.stringify({ currentStep, formData })
    );
  }, [currentStep, formData, isInitialized]);

   // OAuth 데이터 없으면 Step 0 건너뛰기
   useEffect(() => {
     if (currentStep === 0 && !oauthProfile?.name && !oauthProfile?.birthyear) {
       startTransition(() => {
         setCurrentStep(1);
       });
     }
   }, [currentStep, oauthProfile]);

  const updateFormData = useCallback(<K extends keyof OnboardingFormData>(
    field: K,
    value: OnboardingFormData[K]
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const goNext = useCallback(() => {
    setDirection('forward');
    setCurrentStep(prev => Math.min(prev + 1, 6) as OnboardingStep);
  }, []);

  const goPrev = useCallback(() => {
    setDirection('backward');
    setCurrentStep(prev => Math.max(prev - 1, 1) as OnboardingStep);
  }, []);

  const handleStartAnalysis = useCallback(() => {
    // BirthInput 형식으로 변환
    const birthDate = `${formData.birthYear}-${formData.birthMonth}-${formData.birthDay}`;
    const selectedJiji = JIJI_HOURS.find(j => j.value === formData.birthJiji);
    const actualBirthTime = selectedJiji?.time || '12:00';
    const jijiHanja = selectedJiji?.hanja || '';

    const input: BirthInput = {
      name: formData.name,
      birth_solar: birthDate,
      birth_time: actualBirthTime,
      birth_jiji: jijiHanja,
      timezone: 'Asia/Seoul',
      birth_place: '대한민국',
      calendar_type: formData.calendarType,
      gender: formData.gender!,
      context: {
        topic: formData.topic,
        details: formData.birthJiji === 'unknown' ? `[시간 미상] ${formData.details}` : formData.details,
      },
    };

    const model: ModelSelection = {
      provider: 'openai' as Provider,
      model_id: 'auto',
      temperature: 0.7,
    };

    // 분석 데이터를 세션에 저장
    sessionStorage.setItem(
      ONBOARDING_ANALYSIS_KEY,
      JSON.stringify({ input, model, shouldAutoStart: true })
    );

    // 온보딩 데이터 정리
    sessionStorage.removeItem(ONBOARDING_STORAGE_KEY);

    // 완료 콜백 호출 후 홈으로 이동 (자동 분석 시작 + 환영 모달)
    onComplete();
    router.push('/');
  }, [formData, router, onComplete]);

  const handleSkip = useCallback(() => {
    // 온보딩 데이터 정리
    sessionStorage.removeItem(ONBOARDING_STORAGE_KEY);
    onComplete();
    router.push('/');
  }, [router, onComplete]);

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <StepPrefill
            formData={formData}
            onUpdate={updateFormData}
            onNext={goNext}
            oauthProfile={oauthProfile}
          />
        );
      case 1:
        return (
          <StepName
            formData={formData}
            onUpdate={updateFormData}
            onNext={goNext}
          />
        );
      case 2:
        return (
          <StepGender
            formData={formData}
            onUpdate={updateFormData}
            onNext={goNext}
          />
        );
      case 3:
        return (
          <StepBirthDate
            formData={formData}
            onUpdate={updateFormData}
            onNext={goNext}
          />
        );
      case 4:
        return (
          <StepBirthTime
            formData={formData}
            onUpdate={updateFormData}
            onNext={goNext}
          />
        );
      case 5:
        return (
          <StepConcern
            formData={formData}
            onUpdate={updateFormData}
            onNext={goNext}
          />
        );
      case 6:
        return (
          <StepConfirm
            formData={formData}
            onUpdate={updateFormData}
            onStartAnalysis={handleStartAnalysis}
            onSkip={handleSkip}
          />
        );
      default:
        return null;
    }
  };

  // 총 스텝 수 (OAuth가 있으면 7, 없으면 6)
  const totalSteps = oauthProfile?.name || oauthProfile?.birthyear ? 7 : 6;
  const displayStep = oauthProfile?.name || oauthProfile?.birthyear ? currentStep : currentStep - 1;

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        {currentStep > 1 && (
          <button className={styles.backButton} onClick={goPrev}>
            <ChevronLeft size={24} />
          </button>
        )}
        <div className={styles.headerSpacer} />
      </header>

      {/* Content */}
      <main
        className={`${styles.main} ${
          direction === 'forward' ? styles.slideForward : styles.slideBackward
        }`}
        key={currentStep}
      >
        {renderStep()}
      </main>

      {/* Progress */}
      <footer className={styles.footer}>
        <OnboardingProgress currentStep={displayStep} totalSteps={totalSteps} />
      </footer>
    </div>
  );
}
