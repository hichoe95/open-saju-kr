'use client';

import { useEffect, useState, startTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { OnboardingContainer } from '@/components/onboarding';
import { ONBOARDING_STORAGE_KEY } from '@/types/onboarding';
import styles from './page.module.css';

const SIGNUP_COMPLETE_KEY = 'signup_complete_v1';

export default function SignupOnboardingPage() {
  const router = useRouter();
  const { isLoading, isAuthenticated, isFirstSignup, oauthProfile, completeOnboarding } = useAuth();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (isLoading) return;

    // 비로그인 상태 → 서비스 소개 온보딩으로
    if (!isAuthenticated) {
      router.replace('/onboarding');
      return;
    }

    // 첫 가입이 아닌데 접근한 경우
    // 단, 세션에 진행 중인 온보딩 데이터가 있으면 허용
    const savedData = sessionStorage.getItem(ONBOARDING_STORAGE_KEY);
    const signupComplete = sessionStorage.getItem(SIGNUP_COMPLETE_KEY);

    if (!isFirstSignup && !savedData && signupComplete !== 'true') {
      router.replace('/');
      return;
    }

    startTransition(() => {
      setIsReady(true);
    });
  }, [isLoading, isAuthenticated, isFirstSignup, router]);

  const handleComplete = () => {
    completeOnboarding();
    sessionStorage.removeItem(SIGNUP_COMPLETE_KEY);
  };

  // 로딩 중이거나 준비되지 않았으면 로딩 표시
  if (isLoading || !isReady) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <p>잠시만 기다려주세요...</p>
      </div>
    );
  }

  return (
    <OnboardingContainer
      oauthProfile={oauthProfile || undefined}
      onComplete={handleComplete}
    />
  );
}
