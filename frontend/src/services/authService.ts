import { API_BASE_URL as API_URL } from '@/lib/apiBase';
import { AUTH_MODE, buildClientAuthHeaders } from '@/utils/authToken';

function getAuthHeaders(token?: string): Record<string, string> {
    if (token) {
        return buildClientAuthHeaders(token);
    }
    if (AUTH_MODE === 'cookie') {
        return {};
    }
    return buildClientAuthHeaders(token);
}

interface ProfileData {
    label: string;
    birth_date: string;
    hour_branch: string;
    calendar_type: string;
    gender: string;
}

interface AuthUrls {
    kakao: string;
    naver: string;
}

interface LoginResponse {
    access_token: string;
    token_type: string;
    user_id: string;
    is_new: boolean;
    oauth_profile?: {
        name?: string;
        email?: string;
    };
}

interface SavedProfile {
    id: string;
    label: string;
    birth_date: string;
    hour_branch: string;
    calendar_type: string;
    gender: string;
    persona?: string;
    created_at: string;
}

export const authService = {
    getUrls: async (): Promise<AuthUrls> => {
        const res = await fetch(`${API_URL}/api/auth/urls`);
        if (!res.ok) {
            throw new Error('인증 URL을 가져오는데 실패했습니다');
        }
        return res.json();
    },

    login: async (provider: string, code: string, redirectUri: string): Promise<LoginResponse> => {
        const res = await fetch(`${API_URL}/api/auth/login/${provider}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ code, redirect_uri: redirectUri })
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },

    grantConsent: async (token: string, consentType: string, version: string): Promise<void> => {
        const res = await fetch(`${API_URL}/api/consents/grant`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders(token)
            },
            credentials: 'include',
            body: JSON.stringify({
                consent_type: consentType,
                version,
                is_granted: true
            })
        });
        if (!res.ok) throw new Error("동의 저장에 실패했습니다");
    },

    saveProfile: async (token: string, data: ProfileData): Promise<{ id: string; status: string }> => {
        const res = await fetch(`${API_URL}/api/saju/profiles`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders(token)
            },
            credentials: 'include',
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },

    getProfiles: async (token: string): Promise<SavedProfile[]> => {
        const res = await fetch(`${API_URL}/api/saju/profiles`, {
            method: 'GET',
            headers: getAuthHeaders(token),
            credentials: 'include',
        });
        if (!res.ok) return [];
        return res.json();
    }
};
