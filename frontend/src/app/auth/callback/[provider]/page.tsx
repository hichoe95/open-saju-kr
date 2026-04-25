'use client';

import { useEffect, useState, useRef, startTransition } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/lib/apiBase';
import { useAuth } from '@/contexts/AuthContext';
import { advanceActiveSummaryHubResume } from '@/lib/summaryHubResume';
const VALID_PROVIDERS = ['kakao', 'naver'] as const;
const SEEN_ABOUT_KEY = 'seen_about_before_signup';
type OAuthProvider = (typeof VALID_PROVIDERS)[number];

function extractErrorReason(message: string): string {
    if (message.includes('Invalid redirect_uri')) {
        return 'redirect_rejected';
    }
    if (message.includes('Invalid state')) {
        return 'state_rejected';
    }
    if (message.includes('카카오 인증에 실패했습니다')) {
        return 'kakao_exchange_failed';
    }
    if (message.includes('네이버 인증에 실패했습니다')) {
        return 'naver_exchange_failed';
    }
    return 'callback_request_failed';
}

export default function AuthCallbackPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();
    const { login } = useAuth();
    
    const provider = params?.provider as string;
    const code = searchParams?.get('code');
    const state = searchParams?.get('state');
    const [status, setStatus] = useState("로그인 처리 중...");
    const [isError, setIsError] = useState(false);
    const processedRef = useRef(false);

    useEffect(() => {
        if (processedRef.current) return;

        if (!provider || !code) {
            startTransition(() => {
                setIsError(true);
                setStatus('로그인에 실패했습니다. 다시 시도해주세요.');
            });
            return;
        }

        if (!VALID_PROVIDERS.includes(provider as OAuthProvider)) {
            startTransition(() => {
                setIsError(true);
                setStatus('로그인에 실패했습니다. 다시 시도해주세요.');
            });
            return;
        }

        if (!state) {
            startTransition(() => {
                setIsError(true);
                setStatus('로그인에 실패했습니다. 다시 시도해주세요.');
            });
            return;
        }

        processedRef.current = true;
        const redirectUri = `${window.location.origin}/auth/callback/${provider}`;
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => {
            controller.abort();
        }, 10000);

        fetch(`${API_BASE_URL}/api/auth/login/${provider}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ code, redirect_uri: redirectUri, state }),
            signal: controller.signal,
        })
            .then(async res => {
                if (!res.ok) {
                    const text = await res.text();
                    console.warn('[AUTH][callback]', {
                        reason: extractErrorReason(text),
                        provider,
                        status: res.status,
                    });
                    throw new Error(text);
                }
                return res.json();
            })
            .then(async data => {
                await login(data.access_token, {
                    is_new: data.is_new,
                    oauth_profile: {
                        ...data.oauth_profile,
                        provider: provider as OAuthProvider,
                    },
                });

                const resumeFlow = advanceActiveSummaryHubResume('auth_return');

                startTransition(() => {
                    if (data.is_new) {
                        if (resumeFlow) {
                            sessionStorage.setItem(SEEN_ABOUT_KEY, 'true');
                        }
                        setStatus("회원가입을 진행합니다...");
                        setTimeout(() => router.replace('/signup'), 800);
                    } else {
                        setStatus(resumeFlow ? "이전 흐름으로 복귀 중..." : "로그인 성공! 이동 중...");
                        setTimeout(() => router.replace('/'), 1000);
                    }
                });
            })
            .catch(err => {
                console.error("Login Failed:", err);
                console.warn('[AUTH][callback]', {
                    reason: err instanceof DOMException && err.name === 'AbortError'
                        ? 'callback_timeout'
                        : extractErrorReason(err instanceof Error ? err.message : ''),
                    provider,
                });
                startTransition(() => {
                    setIsError(true);
                    if (err instanceof DOMException && err.name === 'AbortError') {
                        setStatus('로그인 요청 시간이 초과되었습니다. 다시 시도해주세요.');
                        return;
                    }
                    setStatus('로그인에 실패했습니다. 다시 시도해주세요.');
                });
            })
            .finally(() => {
                window.clearTimeout(timeoutId);
            });
    }, [code, provider, router, login, state]);

    return (
        <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
            flexDirection: 'column',
            gap: '16px',
            background: 'var(--bg-page)',
        }}>
            {!isError && <div style={{
                width: '40px',
                height: '40px',
                border: '3px solid var(--border-light)',
                borderTopColor: 'var(--primary)',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
            }} />}
            <style jsx>{`
                @keyframes spin { 
                    to { transform: rotate(360deg); } 
                }
            `}</style>
            <h2 style={{
                fontSize: 'var(--text-lg)',
                fontWeight: 'var(--font-semibold)',
                color: 'var(--text-primary)',
            }}>{status}</h2>
            {isError && (
                <button
                    type="button"
                    onClick={() => router.replace('/onboarding')}
                    style={{
                        padding: '0.75rem 1.25rem',
                        border: 'none',
                        borderRadius: '0.5rem',
                        background: '#7c3aed',
                        color: '#ffffff',
                        fontWeight: 600,
                        cursor: 'pointer',
                    }}
                >
                    다시 시도하기
                </button>
            )}
        </div>
    );
}
