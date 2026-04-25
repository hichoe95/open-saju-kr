import fs from 'node:fs';

import { expect, Page, type BrowserContext } from '@playwright/test';

import { E2ERole, baseOrigin, e2eConfig, getRoleStorageState, getRoleToken } from './env';

interface StorageStateFile {
  cookies?: Array<Parameters<BrowserContext['addCookies']>[0][number]>;
  origins?: Array<{
    origin: string;
    localStorage?: Array<{ name: string; value: string }>;
  }>;
}

async function applyStorageState(page: Page, statePath: string): Promise<void> {
  const raw = fs.readFileSync(statePath, 'utf-8');
  const state = JSON.parse(raw) as StorageStateFile;

  if (state.cookies && state.cookies.length > 0) {
    await page.context().addCookies(state.cookies);
  }

  const originState =
    state.origins?.find((item) => item.origin === baseOrigin)
    ?? state.origins?.[0];

  if (originState?.localStorage && originState.localStorage.length > 0) {
    await page.addInitScript((entries: Array<{ name: string; value: string }>) => {
      for (const entry of entries) {
        window.localStorage.setItem(entry.name, entry.value);
      }
    }, originState.localStorage);
  }
}

async function applyTokenSession(page: Page, token: string): Promise<void> {
  await page.addInitScript(
    ({ storageKey, accessToken }: { storageKey: string; accessToken: string }) => {
      window.localStorage.setItem(storageKey, accessToken);
      window.localStorage.setItem('onboardingComplete', 'true');
    },
    {
      storageKey: e2eConfig.accessTokenStorageKey,
      accessToken: token,
    },
  );
}

export async function prepareRoleSession(page: Page, role: E2ERole): Promise<void> {
  const storageStatePath = getRoleStorageState(role);
  if (storageStatePath) {
    await applyStorageState(page, storageStatePath);
    return;
  }

  const token = getRoleToken(role);
  if (!token) {
    throw new Error(`E2E 인증 정보가 없습니다: ${role}`);
  }

  await applyTokenSession(page, token);
}

export async function openAsRole(page: Page, role: E2ERole, pathname = '/'): Promise<void> {
  await prepareRoleSession(page, role);
  await page.goto(pathname);
}

export async function loginWithReviewCode(page: Page, reviewCode: string): Promise<void> {
  await page.goto('/review-login');
  await page.getByTestId('review-login-code-input').fill(reviewCode);
  await page.getByTestId('review-login-submit-button').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('home-page')).toBeVisible();
}

export async function dismissOptionalWelcomeModal(page: Page): Promise<void> {
  const startButton = page.getByRole('button', { name: '시작하기' });
  const isVisible = await startButton.isVisible().catch(() => false);
  if (isVisible) {
    await startButton.click();
  }
}
