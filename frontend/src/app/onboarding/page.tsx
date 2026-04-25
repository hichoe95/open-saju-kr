'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, PanInfo } from 'framer-motion';
import styles from './page.module.css';
import { useAuth } from '@/contexts/AuthContext';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useAuthUrls } from '@/hooks/useAuthUrls';
import { 
  slideVariants, 
  slideTransition, 
  SWIPE_CONFIDENCE_THRESHOLD, 
  swipePower,
  useAnimationConfig 
} from './animations/variants';

import SlideIntro from './components/slides/SlideIntro';
import SlideCore from './components/slides/SlideCore';
import SlideFeatures from './components/slides/SlideFeatures';
import SlideTimeline from './components/slides/SlideTimeline';
import SlideCompatibility from './components/slides/SlideCompatibility';
import SlideChat from './components/slides/SlideChat';
import SlideCTA from './components/slides/SlideCTA';

function detectInAppBrowser(): string | null {
  if (typeof window === 'undefined') return null;
  const ua = navigator.userAgent || '';
  if (/KAKAOTALK/i.test(ua)) return '카카오톡';
  if (/Instagram/i.test(ua)) return '인스타그램';
  if (/FBAN|FBAV/i.test(ua)) return '페이스북';
  if (/NAVER\(/i.test(ua)) return '네이버앱';
  if (/Line\//i.test(ua)) return '라인';
  if (/wv\)/.test(ua)) return '인앱 브라우저';
  if (/iPhone/.test(ua) && !/Safari/.test(ua)) return '인앱 브라우저';
  return null;
}

const TOTAL_SLIDES = 7;

export default function OnboardingPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, completeOnboarding } = useAuth();
  useAnalytics({ autoTrackPageView: true, pageName: 'onboarding' });
  const [[currentSlide, direction], setSlide] = useState([0, 0]);
  const { urls: authUrls, isLoading: isUrlsLoading, error: urlsError, retry: fetchAuthUrls } = useAuthUrls();
  const { shouldReduceMotion } = useAnimationConfig();
  const [showBrowserWarning, setShowBrowserWarning] = useState(true);
  const [inAppBrowserName] = useState<string | null>(() => detectInAppBrowser());

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      completeOnboarding();
      router.replace('/');
    }
  }, [isLoading, isAuthenticated, router, completeOnboarding]);

  const paginate = (newDirection: number) => {
    const nextSlide = currentSlide + newDirection;
    if (nextSlide >= 0 && nextSlide < TOTAL_SLIDES) {
      setSlide([nextSlide, newDirection]);
    }
  };

  const handleDragEnd = (
    _: MouseEvent | TouchEvent | PointerEvent,
    { offset, velocity }: PanInfo
  ) => {
    if (shouldReduceMotion) return;
    
    const swipe = swipePower(offset.x, velocity.x);

    if (swipe < -SWIPE_CONFIDENCE_THRESHOLD && currentSlide < TOTAL_SLIDES - 1) {
      paginate(1);
    } else if (swipe > SWIPE_CONFIDENCE_THRESHOLD && currentSlide > 0) {
      paginate(-1);
    }
  };

  const handleLogin = (provider: string) => {
    if (!authUrls[provider]) return;
    
    const redirectUri = `${window.location.origin}/auth/callback/${provider}`;
    const targetUrl = `${authUrls[provider]}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    window.location.href = targetUrl;
  };

  const isLastSlide = currentSlide === TOTAL_SLIDES - 1;

  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner} />
      </div>
    );
  }

  const renderSlide = () => {
    switch (currentSlide) {
      case 0:
        return <SlideIntro onGoToLogin={() => setSlide([TOTAL_SLIDES - 1, 1])} />;
      case 1:
        return <SlideCore />;
      case 2:
        return <SlideFeatures />;
      case 3:
        return <SlideTimeline />;
      case 4:
        return <SlideCompatibility />;
      case 5:
        return <SlideChat />;
      case 6:
         return (
           <SlideCTA 
             authUrls={authUrls}
             isUrlsLoading={isUrlsLoading}
             onLogin={handleLogin}
             urlsError={urlsError}
             onRetry={fetchAuthUrls}
           />
         );
       default:
         return <SlideIntro onGoToLogin={() => setSlide([TOTAL_SLIDES - 1, 1])} />;
    }
  };

  return (
    <div className={styles.container} data-testid="onboarding-page">
      {showBrowserWarning && inAppBrowserName && (
        <div className={styles.browserWarning} data-testid="inapp-browser-warning">
          <div className={styles.warningContent}>
            <p className={styles.warningText}>
              <strong>{inAppBrowserName}</strong>에서는 화면이 깨질 수 있어요.{' '}
              <strong>Safari</strong> 또는 <strong>Chrome</strong>에서 열어주세요!
            </p>
            <button 
              className={styles.warningCopyButton}
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                alert('URL이 복사되었어요!\nSafari 또는 Chrome에 붙여넣기 해주세요.');
              }}
            >
              URL 복사
            </button>
          </div>
          <button 
            className={styles.warningClose} 
            onClick={() => setShowBrowserWarning(false)}
            aria-label="경고 닫기"
          >
            ×
          </button>
        </div>
      )}
      <div className={styles.slideContainer}>
        <div className={styles.sliderContainer} data-testid="onboarding-slide-container">
          <AnimatePresence initial={false} custom={direction} mode="popLayout">
            <motion.div
              key={currentSlide}
              custom={direction}
              variants={shouldReduceMotion ? {} : slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={shouldReduceMotion ? { duration: 0 } : slideTransition}
              drag={shouldReduceMotion ? false : 'x'}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={1}
              onDragEnd={handleDragEnd}
              className={styles.slideWrapper}
              data-testid={`onboarding-slide-${currentSlide}`}
            >
              {renderSlide()}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className={styles.indicators}>
          {Array.from({ length: TOTAL_SLIDES }).map((_, index) => (
            <button
              key={index}
              className={`${styles.indicator} ${index === currentSlide ? styles.active : ''}`}
              onClick={() => setSlide([index, index > currentSlide ? 1 : -1])}
              aria-label={`슬라이드 ${index + 1}로 이동`}
              data-testid={`onboarding-indicator-${index}`}
            />
          ))}
        </div>

        {!isLastSlide && (
          <div className={styles.navigation}>
            {currentSlide > 0 && (
              <button
                className={styles.prevButton}
                onClick={() => paginate(-1)}
                data-testid="onboarding-prev"
              >
                이전
              </button>
            )}
            <button
              className={styles.nextButton}
              onClick={() => paginate(1)}
              data-testid="onboarding-next"
            >
              다음
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
