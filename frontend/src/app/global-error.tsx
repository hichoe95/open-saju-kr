'use client';

import { useEffect } from 'react';

import styles from './global-error.module.css';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="ko">
      <body>
        <div className={styles.container}>
          <h2 className={styles.heading}>서비스에 일시적인 문제가 발생했습니다</h2>
          <p className={styles.paragraph}>잠시 후 다시 시도해주세요.</p>
          <button type="button" onClick={reset} className={styles.button}>
            다시 시도
          </button>
        </div>
      </body>
    </html>
  );
}
