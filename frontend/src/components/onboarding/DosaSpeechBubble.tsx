'use client';

import Image from 'next/image';
import { useTypingEffect } from '@/hooks/useTypingEffect';
import styles from './DosaSpeechBubble.module.css';

interface DosaSpeechBubbleProps {
  message: string;
  imageSrc: string;
  onTypingComplete?: () => void;
  typingSpeed?: number;
}

// **텍스트** 마크다운을 파싱하여 강조 처리
function parseHighlightedText(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const highlightedText = part.slice(2, -2);
      return (
        <span key={index} className={styles.highlight}>
          {highlightedText}
        </span>
      );
    }
    return part;
  });
}

export default function DosaSpeechBubble({
  message,
  imageSrc,
  onTypingComplete,
  typingSpeed = 30,
}: DosaSpeechBubbleProps) {
  const { displayedText, isComplete, skip } = useTypingEffect(message, {
    speed: typingSpeed,
    delay: 200,
  });

  // 타이핑 완료 시 콜백 호출
  if (isComplete && onTypingComplete) {
    onTypingComplete();
  }

  return (
    <div className={styles.container}>
      <div className={styles.dosaWrapper}>
        <Image
          src={imageSrc}
          alt="AI 도사"
          width={160}
          height={160}
          className={styles.dosaImage}
          priority
        />
      </div>
      <div className={styles.bubbleWrapper} onClick={skip}>
        <div className={styles.bubble}>
          <p className={styles.message}>
            {parseHighlightedText(displayedText)}
            {!isComplete && <span className={styles.cursor}>|</span>}
          </p>
        </div>
        {!isComplete && (
          <p className={styles.skipHint}>탭하여 건너뛰기</p>
        )}
      </div>
    </div>
  );
}
