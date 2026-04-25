'use client';

import { useState, useEffect, useCallback } from 'react';

interface UseTypingEffectOptions {
  speed?: number; // 타이핑 속도 (ms)
  delay?: number; // 시작 전 딜레이 (ms)
}

interface UseTypingEffectReturn {
  displayedText: string;
  isComplete: boolean;
  reset: () => void;
  skip: () => void;
}

export function useTypingEffect(
  text: string,
  options: UseTypingEffectOptions = {}
): UseTypingEffectReturn {
  const { speed = 30, delay = 0 } = options;

  const [displayedText, setDisplayedText] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const reset = useCallback(() => {
    setDisplayedText('');
    setIsComplete(false);
    setCurrentIndex(0);
  }, []);

  const skip = useCallback(() => {
    setDisplayedText(text);
    setIsComplete(true);
    setCurrentIndex(text.length);
  }, [text]);

  useEffect(() => {
    // 텍스트가 변경되면 리셋
    reset();
  }, [text, reset]);

  useEffect(() => {
    if (isComplete || currentIndex >= text.length) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;
    
    const startTimeout = setTimeout(() => {
      intervalId = setInterval(() => {
        setCurrentIndex(prev => {
          const nextIndex = prev + 1;
          if (nextIndex >= text.length) {
            setIsComplete(true);
            if (intervalId) clearInterval(intervalId);
          }
          return nextIndex;
        });
      }, speed);
    }, currentIndex === 0 ? delay : 0);

    return () => {
      clearTimeout(startTimeout);
      if (intervalId) clearInterval(intervalId);
    };
  }, [text.length, speed, delay, isComplete, currentIndex]);

  useEffect(() => {
    setDisplayedText(text.slice(0, currentIndex));
  }, [text, currentIndex]);

  return { displayedText, isComplete, reset, skip };
}

export default useTypingEffect;
