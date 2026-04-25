import { API_BASE_URL } from '@/lib/apiBase';

export type AuthMode = 'cookie' | 'dual';

function resolveAuthMode(): AuthMode {
  const rawAuthMode = process.env.NEXT_PUBLIC_AUTH_MODE?.trim().toLowerCase();
  if (rawAuthMode === 'cookie' || rawAuthMode === 'dual') {
    return rawAuthMode;
  }

  if (typeof window !== 'undefined' && typeof console !== 'undefined') {
    const log = process.env.NODE_ENV === 'production' ? console.error : console.warn;
    log('[AUTH] NEXT_PUBLIC_AUTH_MODE is missing or invalid. Falling back to cookie mode.');
  }

  return 'cookie';
}

export const AUTH_MODE = resolveAuthMode();
const TOKEN_KEY = 'accessToken';
const TOKEN_EXPIRY_SKEW_MS = 30 * 1000;

let refreshPromise: Promise<string | null> | null = null;
let bootstrapAccessToken: string | null = null;

function parseJwt(token: string): { exp?: number } | null {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((char) => `%${(`00${char.charCodeAt(0).toString(16)}`).slice(-2)}`)
        .join('')
    );

    return JSON.parse(jsonPayload) as { exp?: number };
  } catch {
    return null;
  }
}

export function isClientAccessTokenValid(token: string | null | undefined): boolean {
  if (!token) {
    return false;
  }

  const payload = parseJwt(token);
  if (!payload?.exp) {
    return false;
  }

  return payload.exp * 1000 > Date.now() + TOKEN_EXPIRY_SKEW_MS;
}

export function getStoredAccessToken(): string | null {
  if (typeof window === 'undefined' || AUTH_MODE === 'cookie') {
    return null;
  }

  return localStorage.getItem(TOKEN_KEY);
}

export function persistAccessToken(token: string | null): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (AUTH_MODE === 'cookie') {
    localStorage.removeItem(TOKEN_KEY);
    return;
  }

  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    return;
  }

  localStorage.removeItem(TOKEN_KEY);
}

export function setBootstrapAccessToken(token: string | null): void {
  bootstrapAccessToken = isClientAccessTokenValid(token) ? token : null;
}

export function clearBootstrapAccessToken(): void {
  bootstrapAccessToken = null;
}

export function getClientAccessToken(token?: string): string | null {
  if (isClientAccessTokenValid(token)) {
    return token ?? null;
  }

  if (isClientAccessTokenValid(bootstrapAccessToken)) {
    return bootstrapAccessToken;
  }

  if (AUTH_MODE === 'cookie') {
    return null;
  }

  const storedToken = getStoredAccessToken();
  return isClientAccessTokenValid(storedToken) ? storedToken : null;
}

function mergeAuthHeaders(headers?: HeadersInit, token?: string): Headers {
  const merged = new Headers(headers);
  const resolvedToken = getClientAccessToken(token);

  if (resolvedToken) {
    merged.set('Authorization', `Bearer ${resolvedToken}`);
  } else {
    merged.delete('Authorization');
  }

  return merged;
}

export function buildClientAuthHeaders(token?: string): Record<string, string> {
  const resolvedToken = getClientAccessToken(token);
  return resolvedToken ? { Authorization: `Bearer ${resolvedToken}` } : {};
}

export async function refreshClientAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        clearBootstrapAccessToken();
        persistAccessToken(null);
        return null;
      }

      const data = await response.json().catch(() => null) as { access_token?: string } | null;
      const nextToken = typeof data?.access_token === 'string' ? data.access_token : null;

      setBootstrapAccessToken(nextToken);
      persistAccessToken(nextToken);
      return nextToken;
    } catch {
      clearBootstrapAccessToken();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function authFetchWithRefresh(
  url: string,
  init: RequestInit = {},
  retryOnUnauthorized: boolean = true,
): Promise<Response> {
  const executeFetch = (token?: string) => fetch(url, {
    ...init,
    headers: mergeAuthHeaders(init.headers, token),
    credentials: init.credentials ?? 'include',
  });

  const response = await executeFetch();
  if (!retryOnUnauthorized || response.status !== 401 || url.endsWith('/api/auth/refresh')) {
    return response;
  }

  const refreshedToken = await refreshClientAccessToken();
  if (!refreshedToken) {
    return response;
  }

  return executeFetch(refreshedToken);
}
