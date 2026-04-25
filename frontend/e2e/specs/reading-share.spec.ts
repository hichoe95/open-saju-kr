import { expect, test } from '@playwright/test';

import { dismissOptionalWelcomeModal, openAsRole } from '../helpers/auth';
import { hasRoleAuth } from '../helpers/env';
import {
  assertPrimaryTabs,
  createShareLink,
  fillReadingForm,
  saveProfileIfNeeded,
  startReading,
  waitForReadingResult,
} from '../helpers/reading';

test.describe('핵심 분석/공유 스모크', () => {
  test('분석 생성 후 저장, 공유, 마이페이지 재조회가 동작한다', async ({ browser, page }) => {
    test.skip(!hasRoleAuth('new_user'), 'E2E new_user 인증 정보가 필요합니다.');

    const profileName = `E2E-${Date.now()}`;

    await openAsRole(page, 'new_user', '/');
    await expect(page.getByTestId('home-page')).toBeVisible();
    await dismissOptionalWelcomeModal(page);

    await fillReadingForm(page, {
      name: profileName,
      year: '1990',
      month: '01',
      day: '01',
      timeValue: 'unknown',
      persona: 'classic',
    });
    await startReading(page);
    await waitForReadingResult(page);
    await assertPrimaryTabs(page);

    await saveProfileIfNeeded(page);
    const shareUrl = await createShareLink(page);
    expect(shareUrl).toContain('/share/');

    const sharePage = await browser.newPage();
    await sharePage.goto(shareUrl);
    await expect(sharePage.getByTestId('shared-saju-page')).toBeVisible();
    await expect(sharePage.getByText(profileName)).toBeVisible();
    await sharePage.close();

    await page.goto('/mypage');
    await expect(page.getByTestId('mypage-page')).toBeVisible();
    await expect(page.getByText('저장된 사주')).toBeVisible();
    await expect(page.getByText(profileName)).toBeVisible({ timeout: 30_000 });
  });
});
