'use client';

import styles from './page.module.css';
import { useAuthUrls } from '@/hooks/useAuthUrls';

export default function LoginPage() {
    const { urls, isLoading, error, retry } = useAuthUrls();

    const handleLogin = (provider: string) => {
        if (!urls[provider]) {
            return;
        }

        const redirectUri = `${window.location.origin}/auth/callback/${provider}`;
        const targetUrl = `${urls[provider]}&redirect_uri=${encodeURIComponent(redirectUri)}`;

        window.location.href = targetUrl;
    };

    return (
        <div className={styles.container} data-testid="login-page">
            <div className={styles.card}>
                <h1 className={styles.title}>로그인</h1>
                <p className={styles.subtitle}>간편하게 로그인하고 사주를 저장하세요</p>

                {error && (
                    <div className={styles.errorBox}>
                        <p className={styles.errorMessage}>{error}</p>
                        <button
                            type="button"
                            className={styles.retryButton}
                            onClick={retry}
                            disabled={isLoading}
                            data-testid="login-retry-button"
                        >
                            {isLoading ? '다시 시도 중...' : '다시 시도'}
                        </button>
                    </div>
                )}

                {!error && (
                    <div className={styles.buttonGroup}>
                        <button
                            type="button"
                            className={`${styles.socialButton} ${styles.kakao}`}
                            onClick={() => handleLogin('kakao')}
                            disabled={isLoading}
                            data-testid="login-kakao-button"
                        >
                            카카오로 시작하기
                        </button>
                        <button
                            type="button"
                            className={`${styles.socialButton} ${styles.naver}`}
                            onClick={() => handleLogin('naver')}
                            disabled={isLoading}
                            data-testid="login-naver-button"
                        >
                            네이버로 시작하기
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
