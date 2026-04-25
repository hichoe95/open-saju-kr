import { expect, test } from '@playwright/test';

import { openAsRole } from '../helpers/auth';
import { hasRoleAuth } from '../helpers/env';

const adminPages = [
  { path: '/admin', pageTestId: 'admin-dashboard-page', readyTestId: 'admin-dashboard-ready' },
  { path: '/admin/users', pageTestId: 'admin-users-page', readyTestId: 'admin-users-ready' },
  { path: '/admin/payments', pageTestId: 'admin-payments-page', readyTestId: 'admin-payments-ready' },
  { path: '/admin/config', pageTestId: 'admin-config-page', readyTestId: 'admin-config-ready' },
  { path: '/admin/activity', pageTestId: 'admin-activity-page', readyTestId: 'admin-activity-ready' },
  { path: '/admin/feedbacks', pageTestId: 'admin-feedbacks-page', readyTestId: 'admin-feedbacks-ready' },
  { path: '/admin/audit', pageTestId: 'admin-audit-page', readyTestId: 'admin-audit-ready' },
] as const;

test.describe('관리자 스모크', () => {
  for (const pageInfo of adminPages) {
    test(`${pageInfo.path} 가 로드된다`, async ({ page }) => {
      test.skip(!hasRoleAuth('admin'), 'admin 인증 정보가 필요합니다.');

      await openAsRole(page, 'admin', pageInfo.path);
      await expect(page.getByTestId('admin-layout')).toBeVisible();
      await expect(page.getByTestId(pageInfo.pageTestId)).toBeVisible();
      await expect(page.getByTestId(pageInfo.readyTestId)).toBeVisible({ timeout: 30_000 });
    });
  }
});
