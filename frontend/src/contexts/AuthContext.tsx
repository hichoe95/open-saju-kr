'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { API_BASE_URL } from '@/lib/apiBase';
import {
    AUTH_MODE,
    authFetchWithRefresh,
    buildClientAuthHeaders,
    clearBootstrapAccessToken,
    getStoredAccessToken,
    isClientAccessTokenValid,
    persistAccessToken,
    setBootstrapAccessToken,
} from '@/utils/authToken';
const ONBOARDING_COMPLETE_KEY = 'onboardingComplete';
const PENDING_SIGNUP_KEY = 'pending_signup_v1';
const PENDING_SIGNUP_PROFILE_KEY = 'pending_signup_oauth_profile_v1';
const AUTH_ME_MAX_RETRY = 2;

export interface User {
    user_id: string;
    provider?: string;
    name?: string;
    email?: string;
    profile_image?: string;
}

export interface OAuthProfile {
    provider?: 'kakao' | 'naver';
    name?: string;
    email?: string;
    birthday?: string;
    birthyear?: string;
    gender?: string;
}

// 로그인 응답에서 첫 가입 정보
export interface AuthResponseData {
    is_new?: boolean;
    oauth_profile?: OAuthProfile;
}

function isTokenValid(token: string): boolean {
    return isClientAccessTokenValid(token);
}

interface AuthContextType {
    user: User | null;
    token: string | null;             // JWT 토큰 (API 호출용)
    isLoading: boolean;
    isAuthenticated: boolean;
    hasCompletedOnboarding: boolean;
    isFirstSignup: boolean;           // 이번 세션에서 첫 가입인지
    oauthProfile: OAuthProfile | null; // 첫 가입 시 OAuth 정보
    login: (token: string, authData?: AuthResponseData) => Promise<void>;
    logout: () => Promise<void>;
    withdraw: () => Promise<void>;
    completeOnboarding: () => void;
    refreshUser: () => Promise<void>;
    clearFirstSignupState: () => void; // 폼 제출 후 상태 초기화
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
    const [isFirstSignup, setIsFirstSignup] = useState(false);
    const [oauthProfile, setOAuthProfile] = useState<OAuthProfile | null>(null);
    const authRetryCountRef = useRef(0);
    const hasRedirectedToLoginRef = useRef(false);

    const logAuthClientEvent = useCallback((reason: string, extra?: Record<string, unknown>) => {
        console.warn('[AUTH][client]', { reason, ...extra });
    }, []);

    const redirectToLogin = useCallback(() => {
        if (hasRedirectedToLoginRef.current || typeof window === 'undefined') return;
        hasRedirectedToLoginRef.current = true;
        window.location.replace('/login');
    }, []);

    const clearAuthState = useCallback(() => {
        clearBootstrapAccessToken();
        persistAccessToken(null);
        localStorage.removeItem(ONBOARDING_COMPLETE_KEY);
        sessionStorage.removeItem(PENDING_SIGNUP_KEY);
        sessionStorage.removeItem(PENDING_SIGNUP_PROFILE_KEY);
        setUser(null);
        setToken(null);
        setHasCompletedOnboarding(false);
        setIsFirstSignup(false);
        setOAuthProfile(null);
    }, []);

    const fetchUser = useCallback(async (
        authToken?: string,
        retryCount = 0,
        redirectOnUnauthorized = true,
        reasonContext = 'unknown',
    ): Promise<User | null> => {
        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                ...buildClientAuthHeaders(authToken),
            };

            const response = await authFetchWithRefresh(`${API_BASE_URL}/api/auth/me`, {
                headers,
                credentials: 'include',
            });

            if (!response.ok) {
                if (response.status === 401) {
                    authRetryCountRef.current += 1;
                    if (retryCount < AUTH_ME_MAX_RETRY) {
                        const backoffMs = 300 * (retryCount + 1);
                        await new Promise(resolve => setTimeout(resolve, backoffMs));
                        return fetchUser(authToken, retryCount + 1, redirectOnUnauthorized, reasonContext);
                    }

                    logAuthClientEvent('auth_me_unauthorized', {
                        context: reasonContext,
                        retryCount,
                        redirectOnUnauthorized,
                        usedBearerBootstrap: Boolean(authToken),
                    });

                    if (redirectOnUnauthorized) {
                        clearAuthState();
                        redirectToLogin();
                    }
                    return null;
                }
                throw new Error('Failed to fetch user');
            }

            authRetryCountRef.current = 0;
            clearBootstrapAccessToken();
            return await response.json();
        } catch (error) {
            console.error('Error fetching user:', error);
            logAuthClientEvent('auth_me_request_failed', {
                context: reasonContext,
                retryCount,
                message: error instanceof Error ? error.message : 'unknown_error',
            });
            throw error;
        }
    }, [clearAuthState, logAuthClientEvent, redirectToLogin]);

    const initAuth = useCallback(async () => {
        setIsLoading(true);
        hasRedirectedToLoginRef.current = false;
        authRetryCountRef.current = 0;
        clearBootstrapAccessToken();

        try {
            const storedToken = getStoredAccessToken();
            const onboardingComplete = localStorage.getItem(ONBOARDING_COMPLETE_KEY) === 'true';

            setHasCompletedOnboarding(onboardingComplete);

            if (storedToken) {
                if (!isTokenValid(storedToken)) {
                    clearAuthState();
                    redirectToLogin();
                } else {
                    setToken(storedToken);

                    // 새로고침/이동 등으로 세션 상태가 사라져도, 진행 중인 회원가입 플로우는 복구
                    try {
                        const pendingSignup = sessionStorage.getItem(PENDING_SIGNUP_KEY) === 'true';
                        if (pendingSignup) {
                            setIsFirstSignup(true);
                            // Don't restore oauth_profile from sessionStorage — it's no longer stored
                        }
                    } catch {
                        // ignore
                    }

                    try {
                        const userData = await fetchUser(storedToken, 0, true, 'init_stored_token');
                        if (userData) {
                            setUser(userData);
                            setHasCompletedOnboarding(true);
                            localStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
                        }
                    } catch (error) {
                        console.error('Stored-token auth bootstrap failed:', error);
                        logAuthClientEvent('auth_init_stored_token_failed', {
                            message: error instanceof Error ? error.message : 'unknown_error',
                        });
                        // 네트워크/일시 장애는 인증 만료로 취급하지 않는다.
                        // 저장 토큰은 유지하고, 이후 재시도나 수동 로그인 흐름으로 복구한다.
                    }
                }
            } else {
                try {
                    const userData = await fetchUser(undefined, 0, false, 'init_cookie_session');
                    if (userData) {
                        setUser(userData);
                        setHasCompletedOnboarding(true);
                        localStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
                    }
                } catch (error) {
                    console.error('Cookie-session auth bootstrap failed:', error);
                    logAuthClientEvent('auth_init_cookie_session_failed', {
                        message: error instanceof Error ? error.message : 'unknown_error',
                    });
                }
            }
        } catch (error) {
            console.error('Auth initialization error:', error);
            logAuthClientEvent('auth_init_failed', {
                message: error instanceof Error ? error.message : 'unknown_error',
            });
        } finally {
            setIsLoading(false);
        }
    }, [clearAuthState, fetchUser, logAuthClientEvent, redirectToLogin]);

    useEffect(() => {
        initAuth();
    }, [initAuth]);

    const login = useCallback(async (newToken: string, authData?: AuthResponseData) => {
        persistAccessToken(newToken);
        if (AUTH_MODE === 'cookie') {
            setBootstrapAccessToken(newToken);
        }

        const tokenForRequests = newToken;
        setToken(AUTH_MODE === 'cookie' ? null : tokenForRequests);

        // 첫 가입 시 OAuth 프로필 정보 저장
        if (authData?.is_new) {
            setIsFirstSignup(true);
            setOAuthProfile(authData.oauth_profile || null);

            // 회원가입 플로우 복구용(새로고침 대비)
            try {
                sessionStorage.setItem(PENDING_SIGNUP_KEY, 'true');
                // Only store minimal non-PII flag
                sessionStorage.setItem(PENDING_SIGNUP_PROFILE_KEY, 'pending');
            } catch {
                // ignore
            }
        }

        try {
            const userData = await fetchUser(tokenForRequests, 0, false, 'login_bootstrap');
            if (!userData) {
                logAuthClientEvent('login_bootstrap_failed', {
                    authMode: AUTH_MODE,
                });
                clearAuthState();
                throw new Error('로그인 세션을 확인하지 못했습니다. 다시 시도해주세요.');
            }

            setUser(userData);
            setHasCompletedOnboarding(true);
            localStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');

            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('wallet:refresh-needed'));
            }

            // 첫 가입 시 OAuth 프로필이 없으면 fetchUser 결과에서 채우기
            if (authData?.is_new && !authData.oauth_profile) {
                setOAuthProfile({
                    name: userData.name,
                    email: userData.email,
                });
            }
        } catch (error) {
            clearAuthState();
            console.error('Failed to fetch user details:', error);
            logAuthClientEvent('login_failed_after_callback', {
                authMode: AUTH_MODE,
                message: error instanceof Error ? error.message : 'unknown_error',
            });
            throw error;
        }
    }, [clearAuthState, fetchUser, logAuthClientEvent]);

    const logout = useCallback(async () => {
        // P2-4: 서버에 로그아웃 알림 (refresh token 무효화)
        const currentToken = token ?? getStoredAccessToken();
        try {
            await fetch(`${API_BASE_URL}/api/auth/logout`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    ...buildClientAuthHeaders(currentToken || undefined),
                    'Content-Type': 'application/json',
                },
            });
        } catch {
            // 서버 로그아웃 실패해도 로컬 상태는 정리
        }

        persistAccessToken(null);
        localStorage.removeItem(ONBOARDING_COMPLETE_KEY);
        setUser(null);
        setToken(null);
        setHasCompletedOnboarding(false);
    }, [token]);

    const withdraw = useCallback(async () => {
        const currentToken = token ?? getStoredAccessToken();

        const response = await fetch(`${API_BASE_URL}/api/auth/withdraw`, {
            method: 'DELETE',
            credentials: 'include',
            headers: {
                ...buildClientAuthHeaders(currentToken || undefined),
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || '탈퇴 처리 중 오류가 발생했습니다.');
        }

        persistAccessToken(null);
        localStorage.removeItem(ONBOARDING_COMPLETE_KEY);
        setUser(null);
        setToken(null);
        setHasCompletedOnboarding(false);
    }, [token]);

    const completeOnboarding = useCallback(() => {
        setHasCompletedOnboarding(true);
        localStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
    }, []);

    const refreshUser = useCallback(async () => {
        const bearerToken = token ?? getStoredAccessToken() ?? undefined;
        const userData = await fetchUser(bearerToken, 0, false, 'manual_refresh');
        setUser(userData);
    }, [fetchUser, token]);

    const clearFirstSignupState = useCallback(() => {
        setIsFirstSignup(false);
        setOAuthProfile(null);

        try {
            sessionStorage.removeItem(PENDING_SIGNUP_KEY);
            sessionStorage.removeItem(PENDING_SIGNUP_PROFILE_KEY);
        } catch {
            // ignore
        }
    }, []);

    const value: AuthContextType = {
        user,
        token,
        isLoading,
        isAuthenticated: !!user,
        hasCompletedOnboarding,
        isFirstSignup,
        oauthProfile,
        login,
        logout,
        withdraw,
        completeOnboarding,
        refreshUser,
        clearFirstSignupState,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextType {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
