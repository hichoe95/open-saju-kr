'use client';

import { useState, ReactNode } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { 
  slideVariants, 
  slideTransition, 
  SWIPE_CONFIDENCE_THRESHOLD, 
  swipePower,
  useAnimationConfig 
} from '../animations/variants';
import styles from '../page.module.css';

interface OnboardingSliderProps {
  children: ReactNode[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
}

export default function OnboardingSlider({
  children,
  currentIndex,
  onIndexChange,
}: OnboardingSliderProps) {
  const [[page, direction], setPage] = useState([currentIndex, 0]);
  const { shouldReduceMotion, getVariants } = useAnimationConfig();

  const paginate = (newDirection: number) => {
    const nextIndex = page + newDirection;
    if (nextIndex >= 0 && nextIndex < children.length) {
      setPage([nextIndex, newDirection]);
      onIndexChange(nextIndex);
    }
  };

  const handleDragEnd = (
    _: MouseEvent | TouchEvent | PointerEvent,
    { offset, velocity }: PanInfo
  ) => {
    if (shouldReduceMotion) return;
    
    const swipe = swipePower(offset.x, velocity.x);

    if (swipe < -SWIPE_CONFIDENCE_THRESHOLD && page < children.length - 1) {
      paginate(1);
    } else if (swipe > SWIPE_CONFIDENCE_THRESHOLD && page > 0) {
      paginate(-1);
    }
  };

  if (page !== currentIndex) {
    const newDirection = currentIndex > page ? 1 : -1;
    setPage([currentIndex, newDirection]);
  }

  return (
    <div className={styles.sliderContainer}>
      <AnimatePresence initial={false} custom={direction} mode="popLayout">
        <motion.div
          key={page}
          custom={direction}
          variants={getVariants(slideVariants)}
          initial="enter"
          animate="center"
          exit="exit"
          transition={shouldReduceMotion ? { duration: 0 } : slideTransition}
          drag={shouldReduceMotion ? false : 'x'}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={1}
          onDragEnd={handleDragEnd}
          className={styles.slideWrapper}
        >
          {children[page]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
