'use client';

import { useEffect } from 'react';

import styles from './error.module.css';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className={styles.container}>
      <h2 className={styles.heading}>문제가 발생했습니다</h2>
      <p className={styles.paragraph}>페이지를 불러오는 중 오류가 발생했습니다.</p>
      <button type="button" onClick={reset} className={styles.button}>
        다시 시도
      </button>
    </div>
  );
}
