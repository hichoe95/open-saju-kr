import { expect, test } from '@playwright/test';

import { dismissOptionalWelcomeModal, loginWithReviewCode } from '../helpers/auth';
import { e2eConfig } from '../helpers/env';

test.describe('인증 진입 스모크', () => {
  test('온보딩과 로그인 페이지가 열린다', async ({ page }) => {
    await page.goto('/onboarding');
    await expect(page.getByTestId('onboarding-page')).toBeVisible();
    await expect(page.getByTestId('onboarding-next')).toBeVisible();
    await page.getByTestId('onboarding-next').click();
    await expect(page.getByTestId('onboarding-slide-1')).toBeVisible();

    await page.goto('/login');
    await expect(page.getByTestId('login-page')).toBeVisible();
    await expect(page.getByTestId('login-kakao-button')).toBeVisible();
    await expect(page.getByTestId('login-naver-button')).toBeVisible();
  });

  test('review-login으로 홈에 진입할 수 있다', async ({ page }) => {
    test.skip(!e2eConfig.reviewCode, 'E2E_REVIEW_CODE가 필요합니다.');

    await loginWithReviewCode(page, e2eConfig.reviewCode);
    await dismissOptionalWelcomeModal(page);
    await expect(page.getByTestId('analysis-form-card')).toBeVisible();
  });
});
