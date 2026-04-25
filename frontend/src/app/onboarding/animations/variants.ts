'use client';

import { Variants, Transition, useReducedMotion } from 'framer-motion';

// ============================================
// Timing Constants
// ============================================
export const TIMING = {
  slide: 300,      // 슬라이드 전환
  dosa: 600,       // 도사 등장
  stagger: 100,    // 순차 등장 간격
  element: 400,    // 개별 요소
} as const;

// ============================================
// Easing Functions
// ============================================
export const EASING = {
  // 부드러운 탄성 (도사 등장)
  bounce: [0.34, 1.56, 0.64, 1],
  // 자연스러운 ease-out
  smooth: [0.25, 0.1, 0.25, 1],
  // 빠른 시작, 부드러운 끝
  decelerate: [0, 0, 0.2, 1],
} as const;

// ============================================
// Slide Transition Variants (Direction-Aware)
// ============================================
export const slideVariants: Variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? '100%' : '-100%',
    opacity: 0,
  }),
  center: {
    zIndex: 1,
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    zIndex: 0,
    x: direction < 0 ? '100%' : '-100%',
    opacity: 0,
  }),
};

export const slideTransition: Transition = {
  x: { type: 'spring', stiffness: 300, damping: 30 },
  opacity: { duration: 0.2 },
};

// ============================================
// Dosa Character Variants
// ============================================
export const dosaVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.9,
    y: 30,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: TIMING.dosa / 1000,
      ease: EASING.bounce,
    },
  },
  tap: {
    scale: 1.05,
    transition: {
      duration: 0.2,
      ease: EASING.smooth,
    },
  },
  hover: {
    y: -5,
    transition: {
      duration: 0.3,
      ease: EASING.smooth,
    },
  },
};

// "살아있는" 도사 - 호버 & 숨쉬기 효과
export const dosaFloatVariants: Variants = {
  float: {
    y: [0, -10, 0],
    scale: [1, 1.02, 1],
    transition: {
      duration: 4,
      ease: 'easeInOut',
      repeat: Infinity,
    },
  },
};

// ============================================
// Compatibility Slide - 두 도사 만남
// ============================================
export const dosaLeftVariants: Variants = {
  hidden: { x: -80, opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: {
      duration: 0.5,
      ease: EASING.bounce,
    },
  },
};

export const dosaRightVariants: Variants = {
  hidden: { x: 80, opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: {
      duration: 0.5,
      delay: 0.15,
      ease: EASING.bounce,
    },
  },
};

export const heartBurstVariants: Variants = {
  hidden: { scale: 0, opacity: 0 },
  visible: (i: number) => ({
    scale: 1,
    opacity: 1,
    transition: {
      delay: 0.7 + i * 0.1,
      duration: 0.3,
      ease: EASING.bounce,
    },
  }),
};

// ============================================
// Element Stagger Variants (오행, 타임라인 등)
// ============================================
export const staggerContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: TIMING.stagger / 1000,
      delayChildren: 0.2,
    },
  },
};

export const staggerItemVariants: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.9 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: TIMING.element / 1000,
      ease: EASING.smooth,
    },
  },
};

// ============================================
// Text Fade-In Variants
// ============================================
export const textVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      delay: 0.2,
      ease: EASING.decelerate,
    },
  },
};

// ============================================
// Login Button Variants (CTA 슬라이드)
// ============================================
export const loginButtonVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: 0.3 + i * 0.1,
      duration: 0.5,
      ease: EASING.smooth,
    },
  }),
  hover: {
    y: -2,
    boxShadow: '0 12px 24px rgba(79, 70, 229, 0.25)',
    transition: { duration: 0.2 },
  },
  tap: {
    scale: 0.98,
    transition: { duration: 0.1 },
  },
};

// ============================================
// Swipe Gesture Helpers
// ============================================
export const SWIPE_CONFIDENCE_THRESHOLD = 10000;

export const swipePower = (offset: number, velocity: number): number => {
  return Math.abs(offset) * velocity;
};

// ============================================
// Accessibility Hook Helper
// ============================================
export const useAnimationConfig = () => {
  const shouldReduceMotion = useReducedMotion();
  
  return {
    shouldReduceMotion,
    // 애니메이션 비활성화 시 즉시 완료되는 transition
    transition: shouldReduceMotion 
      ? { duration: 0 } 
      : undefined,
    // 애니메이션 비활성화 시 움직임 없는 variants
    getVariants: <T extends Variants>(variants: T): T | undefined =>
      shouldReduceMotion ? undefined : variants,
  };
};

// ============================================
// Background Particle Positions (CSS로 사용)
// ============================================
export const PARTICLE_POSITIONS = [
  { left: '10%', top: '20%', delay: 0 },
  { left: '25%', top: '15%', delay: 0.5 },
  { left: '75%', top: '25%', delay: 1 },
  { left: '85%', top: '10%', delay: 1.5 },
  { left: '15%', top: '80%', delay: 2 },
  { left: '90%', top: '70%', delay: 2.5 },
] as const;
