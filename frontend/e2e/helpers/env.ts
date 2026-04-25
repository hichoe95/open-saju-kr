import path from 'node:path';

export type E2ERole = 'new_user' | 'returning_user' | 'paid_user' | 'admin';

const tokenEnvMap: Record<E2ERole, string> = {
  new_user: 'E2E_NEW_USER_ACCESS_TOKEN',
  returning_user: 'E2E_RETURNING_USER_ACCESS_TOKEN',
  paid_user: 'E2E_PAID_USER_ACCESS_TOKEN',
  admin: 'E2E_ADMIN_ACCESS_TOKEN',
};

const storageStateEnvMap: Record<E2ERole, string> = {
  new_user: 'E2E_NEW_USER_STORAGE_STATE',
  returning_user: 'E2E_RETURNING_USER_STORAGE_STATE',
  paid_user: 'E2E_PAID_USER_STORAGE_STATE',
  admin: 'E2E_ADMIN_STORAGE_STATE',
};

export const e2eConfig = {
  baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:3000',
  authMode: process.env.E2E_AUTH_MODE || 'dual',
  accessTokenStorageKey: process.env.E2E_ACCESS_TOKEN_STORAGE_KEY || 'accessToken',
  reviewCode: process.env.E2E_REVIEW_CODE?.trim() || '',
};

export const baseOrigin = new URL(e2eConfig.baseURL).origin;

export function getRoleToken(role: E2ERole): string | undefined {
  const value = process.env[tokenEnvMap[role]]?.trim();
  return value || undefined;
}

export function getRoleStorageState(role: E2ERole): string | undefined {
  const value = process.env[storageStateEnvMap[role]]?.trim();
  if (!value) return undefined;
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}

export function hasRoleAuth(role: E2ERole): boolean {
  return Boolean(getRoleToken(role) || getRoleStorageState(role));
}
