'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/lib/apiBase';
import { useAuth } from '@/contexts/AuthContext';
import styles from './page.module.css';

export default function ReviewLoginPage() {
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();
    const { login } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/review-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ review_code: code }),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.detail || '로그인에 실패했습니다');
            }

            const data = await response.json();
            await login(data.access_token, {
                is_new: data.is_new,
                oauth_profile: data.oauth_profile,
            });

            router.push('/');
        } catch (err) {
            setError(err instanceof Error ? err.message : '로그인에 실패했습니다');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className={styles.container} data-testid="review-login-page">
            <div className={styles.card}>
                <h1 className={styles.title}>심사용 로그인</h1>
                <p className={styles.subtitle}>심사 코드를 입력해주세요</p>

                <form onSubmit={handleSubmit} className={styles.form}>
                    <input
                        type="text"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="심사 코드 입력"
                        className={styles.input}
                        disabled={isLoading}
                        autoComplete="off"
                        data-testid="review-login-code-input"
                    />
                    
                    {error && <p className={styles.error}>{error}</p>}
                    
                    <button
                        type="submit"
                        className={styles.button}
                        disabled={isLoading || !code.trim()}
                        data-testid="review-login-submit-button"
                    >
                        {isLoading ? '로그인 중...' : '로그인'}
                    </button>
                </form>
            </div>
        </div>
    );
}
