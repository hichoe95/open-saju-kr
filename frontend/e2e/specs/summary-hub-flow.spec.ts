'use strict';

import { expect, test, type Page, type Route } from '@playwright/test';

import { expectAnalyticsEvent, installAnalyticsRecorder, type AnalyticsRecorder } from '../helpers/analytics';
import { fillReadingForm, startReading, waitForReadingResult } from '../helpers/reading';

const SUMMARY_HUB_CARD_EXPOSED_EVENT = 'summary_hub_card_exposed';
const SUMMARY_HUB_DETAIL_CTA_CLICKED_EVENT = 'summary_hub_detail_cta_clicked';
const SUMMARY_HUB_RESUME_OUTCOME_EVENT = 'summary_hub_resume_outcome';

function buildMockReadingResponse(
  readingId: string,
  options: { includeReadingId?: boolean } = {}
) {
  const { includeReadingId = true } = options;

  return {
    one_liner: '무료 요약 허브에 먼저 도착했어요. 핵심 흐름부터 가볍게 살펴보세요.',
    rendered_markdown: '## 요약\n무료 요약 허브 테스트 응답입니다.',
    pillars: {
      year: '壬申',
      month: '乙卯',
      day: '丁丑',
      hour_A: '時柱 미상',
      hour_B: '時柱 미상',
      hour_note: '태어난 시간이 없어 시주는 추정하지 않았습니다.',
    },
    card: {
      stats: { water: 25, wood: 20, fire: 22, metal: 18, earth: 15 },
      character: {
        summary: '요약 허브에서 성향과 흐름을 먼저 파악하는 타입입니다.',
      },
    },
    tabs: {
      love: {
        summary: '관계의 속도를 천천히 맞출수록 장점이 또렷해집니다.',
      },
      money: {
        summary: '큰 베팅보다 현금흐름을 잘게 관리할수록 안정감이 큽니다.',
      },
      career: {
        summary: '한 번에 크게 바꾸기보다 역할을 넓히는 방식이 유리합니다.',
      },
      study: {
        summary: '짧고 자주 몰입하는 학습 루틴과 잘 맞습니다.',
      },
      health: {
        summary: '리듬이 흔들릴 때 컨디션이 먼저 반응하는 편입니다.',
      },
      life_flow: {
        mechanism: ['지금은 기반을 넓히는 흐름이 우세합니다.'],
      },
      daeun: {
        summary: '지금 대운은 기반을 정리한 뒤 다음 기회를 받는 흐름입니다.',
      },
      lucky: {
        today_overview: '오늘은 정리와 선택이 잘 맞는 흐름입니다.',
      },
    },
    meta: {
      provider: 'openai',
      model_id: 'saju-deep',
      prompt_version: 'e2e',
      latency_ms: 1200,
      cache_id: `cache-${readingId}`,
      ...(includeReadingId ? { reading_id: readingId } : {}),
    },
  };
}

function buildDetailedReadingResponse(readingId: string) {
  const base = buildMockReadingResponse(readingId);

  return {
    ...base,
    card: {
      ...base.card,
      character: {
        ...base.card.character,
        buffs: ['판단이 빠름'],
        debuffs: ['과몰입 주의'],
      },
      tags: ['침착함', '직관형'],
    },
    tabs: {
      ...base.tabs,
      love: {
        ...base.tabs.love,
        timeline: { past: '관찰기', present: '정리기', future: '확장기' },
        dos: ['속도 조절'],
        donts: ['감정 과속'],
        scripts: ['조금 더 천천히 알아가 보고 싶어요.'],
        full_text: '테스트용 상세 연애 설명입니다.',
      },
      money: {
        ...base.tabs.money,
        timeline: { past: '정비기', present: '축적기', future: '확장기' },
        risk: ['충동 소비'],
        rules: ['예산 상한선 고정'],
      },
      career: {
        ...base.tabs.career,
        timeline: { past: '탐색기', present: '정착기', future: '확장기' },
        fit: ['기획'],
        avoid: ['과도한 즉흥성'],
        next_steps: ['강점이 드러나는 프로젝트 정리'],
      },
      study: {
        ...base.tabs.study,
        timeline: { past: '기초기', present: '흡수기', future: '응용기' },
        routine: ['25분 집중'],
        pitfalls: ['한 번에 많이 하려는 습관'],
      },
      health: {
        ...base.tabs.health,
        timeline: { past: '회복기', present: '관리기', future: '안정기' },
        routine: ['수면 리듬 고정'],
        warnings: ['야식'],
      },
      life_flow: {
        ...base.tabs.life_flow,
        years: [{ year: 2026, theme: '정리와 확장', risk: '무리한 속도전', tip: '우선순위 고정' }],
      },
      daeun: {
        ...base.tabs.daeun,
        full_text: '테스트용 상세 대운 설명입니다.',
        current_daeun: '2024-2033',
        next_daeun_change: '2034',
        sections: [],
        timeline: [],
      },
      lucky: {
        ...base.tabs.lucky,
        lucky_color: '푸른색',
        lucky_number: '8',
        lucky_direction: '동쪽',
        lucky_item: '노트',
        power_spot: '창가 자리',
        today_love: '대화를 짧고 명확하게 가져가세요.',
        today_money: '작은 지출부터 다시 점검해보세요.',
        today_work: '우선순위를 한 번 더 확인하면 속도가 붙습니다.',
        today_health: '수분 섭취를 먼저 챙기세요.',
        today_advice: '결정은 줄이고 정리는 늘리면 좋습니다.',
      },
    },
  };
}

async function mockSharedShell(
  page: Page,
  options: {
    balance?: number;
    includeProfiles?: boolean;
  } = {}
) {
  const { balance = 300, includeProfiles = true } = options;

  await page.route('**/api/config/features', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.route('**/api/payment/prices', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ reading_reanalyze: 150 }),
    });
  });

  await page.route('**/api/payment/wallet', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ balance, total_charged: balance, total_spent: 0 }),
    });
  });

  await page.route('**/api/payment/products', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 'prod-1', name: '100엽전', price: 1000, coin_amount: 100, bonus_amount: 0 },
      ]),
    });
  });

  if (includeProfiles) {
    await page.route('**/api/saju/profiles', async (route: Route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'profile-e2e' }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
  }
}

async function mockAnonymousReading(page: Page, readingId: string) {
  await page.route('**/api/reading', async (route: Route) => {
    await route.fulfill({
      status: 504,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'home summary flow should not use sync reading route' }),
    });
  });

  await page.route('**/api/reading/start', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        job_id: `job-${readingId}`,
        status: 'pending',
        message: '분석이 시작되었습니다.',
      }),
    });
  });

  await page.route('**/api/reading/status/**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        job_id: `job-${readingId}`,
        status: 'completed',
        progress: 100,
        completed_tabs: 11,
        total_tabs: 11,
        result: buildMockReadingResponse(readingId, { includeReadingId: false }),
        error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
  });
}

async function mockAuthenticatedReading(page: Page, readingId: string) {
  await page.route('**/api/reading', async (route: Route) => {
    await route.fulfill({
      status: 504,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'home summary flow should not use sync reading route' }),
    });
  });

  await page.route('**/api/reading/start', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        job_id: `job-${readingId}`,
        status: 'pending',
        message: '분석이 시작되었습니다.',
      }),
    });
  });

  await page.route('**/api/reading/status/**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        job_id: `job-${readingId}`,
        status: 'completed',
        progress: 100,
        completed_tabs: 11,
        total_tabs: 11,
        result: buildMockReadingResponse(readingId),
        error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
  });
}

async function mockAuthenticatedSession(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('accessToken', 'e2e-auth-token');
    window.localStorage.setItem('onboardingComplete', 'true');
  });

  await page.route('**/api/auth/me', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user_id: 'e2e-user',
        provider: 'review',
        name: 'E2E User',
        email: 'e2e@example.com',
      }),
    });
  });
}

async function mockReadingDetail(page: Page, readingId: string, mode: 'success' | 'forbidden') {
  await page.route(`**/api/reading/${readingId}`, async (route: Route) => {
    if (mode === 'forbidden') {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ detail: '상세 리딩 접근 권한이 없습니다.' }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildDetailedReadingResponse(readingId)),
    });
  });
}

function buildSavedProfile(profileId: string) {
  return {
    id: profileId,
    label: '이미 해제된 저장 사주',
    birth_date: '1992-03-17',
    hour_branch: '',
    calendar_type: 'solar',
    gender: 'female',
    persona: 'classic',
    created_at: new Date().toISOString(),
  };
}

async function mockMyPageDependencies(page: Page) {
  await page.route('**/api/admin/check', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ is_admin: false }),
    });
  });

  await page.route('**/api/payment/transactions?**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/api/payment/wallet/expiration', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(null),
    });
  });

  await page.route('**/api/feedback/my', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/api/profile/received', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });
}

async function mockNewUserOAuthAndPayment(page: Page, readingId: string) {
  let isAuthenticated = false;

  await page.route('**/api/auth/login/kakao', async (route: Route) => {
    isAuthenticated = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'new-user-token',
        is_new: true,
        oauth_profile: {
          provider: 'kakao',
          name: '새 유저',
          gender: 'female',
          birthyear: '1992',
          birthday: '0317',
        },
      }),
    });
  });

  await page.route('**/api/auth/me', async (route: Route) => {
    if (!isAuthenticated) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'AUTH_REQUIRED' }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user_id: 'new-user-id',
        provider: 'kakao',
        name: '새 유저',
        email: 'new-user@example.com',
      }),
    });
  });

  await page.route('**/api/auth/signup/complete', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.route('**/api/payment/confirm', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, balance: 500, charged: 100 }),
    });
  });

  await page.route('**/api/payment/spend', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, balance: 350, spent: 150, transaction_id: 'tx-e2e' }),
    });
  });

  await page.route('**/api/reading/bootstrap', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        reading_id: readingId,
        cache_id: `cache-${readingId}`,
        reused_existing: false,
      }),
    });
  });

  await mockReadingDetail(page, readingId, 'success');
}

async function fillSignupForm(page: Page) {
  await page.getByLabel('연령대 (필수)').selectOption('20-29');
  await page.locator('input[type="checkbox"]').nth(0).evaluate((element) => {
    (element as HTMLInputElement).click();
  });
  await page.locator('input[type="checkbox"]').nth(1).evaluate((element) => {
    (element as HTMLInputElement).click();
  });
  await page.getByRole('button', { name: '회원가입 완료' }).evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
}

async function completeReading(page: Page, namePrefix: string) {
  await fillReadingForm(page, {
    name: `${namePrefix}-${Date.now()}`,
    year: '1992',
    month: '03',
    day: '17',
    timeValue: 'unknown',
    persona: 'classic',
  });
  await startReading(page);
  await waitForReadingResult(page);
}

async function expectSummaryHubExposure(recorder: AnalyticsRecorder, domain: string, priority: number) {
  return expectAnalyticsEvent(
    recorder,
    SUMMARY_HUB_CARD_EXPOSED_EVENT,
    (event) => event.eventData.domain === domain && event.eventData.priority === priority,
  );
}

test.describe('summary hub regression flow', () => {
  test('guest summary hub journey restores detail through signup and payment', async ({ page }) => {
    const readingId = 'reading-e2e-anonymous';
    const recorder = await installAnalyticsRecorder(page);

    await mockSharedShell(page, { balance: 0 });
    await mockAnonymousReading(page, readingId);
    await mockNewUserOAuthAndPayment(page, readingId);

    await page.goto('/');
    await expect(page.getByTestId('home-page')).toBeVisible();
    await expect(page.getByTestId('summary-hub-entry-notice')).toBeVisible();

    await completeReading(page, 'Anon');

    await expect(page).not.toHaveURL(/\/onboarding/);
    await expect(page.getByTestId('summary-hub')).toBeVisible();
    await expect(page.getByTestId('summary-card-love')).toContainText('관계의 속도');
    await expect(page.getByTestId('summary-card-money')).toContainText('현금흐름');
    await expect(page.getByTestId('summary-card-career')).toContainText('역할을 넓히');
    await expect(page.getByTestId('summary-card-lucky')).toContainText('오늘은 정리와 선택이 잘 맞는 흐름입니다.');
    await expect(page.getByTestId('summary-card-life')).toContainText('기반을 넓히는 흐름');

    await expectSummaryHubExposure(recorder, 'love', 1);
    await expectSummaryHubExposure(recorder, 'money', 2);
    await expectSummaryHubExposure(recorder, 'career', 3);

    await page.getByTestId('summary-card-detail-cta-love').click();
    await expect(page).toHaveURL(/\/login$/);

    const resumeKeys = await page.evaluate(() => {
      const keys = Object.keys(window.localStorage).filter((key) => key.startsWith('summary-hub-resume:v1:'));
      return {
        keys,
        active: window.localStorage.getItem('summary-hub-resume:v1:active'),
      };
    });

    expect(resumeKeys.active).toBe('anon-cache:cache-reading-e2e-anonymous');
    expect(resumeKeys.keys).toContain('summary-hub-resume:v1:active');
    expect(resumeKeys.keys).toContain('summary-hub-resume:v1:anon-cache:cache-reading-e2e-anonymous');

    await expectAnalyticsEvent(
      recorder,
      SUMMARY_HUB_DETAIL_CTA_CLICKED_EVENT,
      (event) => event.eventData.cta_origin_surface === 'summary_hub_card'
        && event.eventData.cta_origin_domain === 'love'
        && event.eventData.is_authenticated === false,
    );

    await page.evaluate(() => {
      window.sessionStorage.setItem('seen_about_before_signup', 'true');
    });

    await page.goto('/auth/callback/kakao?code=mock-code&state=mock-state');
    await expect(page).toHaveURL(/\/signup$/);

    await fillSignupForm(page);

    await expect(page).not.toHaveURL(/\/signup\/onboarding/);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('payment-confirm-modal')).toBeVisible();

    await expectAnalyticsEvent(
      recorder,
      SUMMARY_HUB_RESUME_OUTCOME_EVENT,
      (event) => event.eventData.resume_outcome === 'signup_complete'
        && event.eventData.cta_origin_domain === 'love'
        && event.eventData.destination_focus === 'payment_gate',
    );

    await page.getByTestId('payment-confirm-charge').click();
    await expect(page).toHaveURL(/\/charge$/);

    await page.goto('/charge/success?paymentKey=payment_key_12345678&orderId=SAJU_TEST1234&amount=1000');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('result-tab-panel')).toBeVisible();
    await expect(page.getByText('테스트용 상세 연애 설명입니다.')).toBeVisible();

    await expectAnalyticsEvent(
      recorder,
      SUMMARY_HUB_RESUME_OUTCOME_EVENT,
      (event) => event.eventData.resume_outcome === 'payment_success'
        && event.eventData.cta_origin_domain === 'love'
        && event.eventData.destination_focus === 'paid_detail'
        && event.eventData.detail_unlocked === true,
    );
  });

  for (const scenario of [
    { label: 'cancel', code: 'PAY_PROCESS_CANCELED', outcome: 'payment_cancel' },
    { label: 'failure', code: 'REJECT_CARD_COMPANY', outcome: 'payment_failure' },
  ] as const) {
    test(`payment ${scenario.label} resumes locked detail context`, async ({ page }) => {
      const readingId = 'reading-e2e-authenticated';
      const recorder = await installAnalyticsRecorder(page);

      await mockSharedShell(page, { balance: 0 });
      await mockAuthenticatedSession(page);
      await mockAuthenticatedReading(page, readingId);
      await mockReadingDetail(page, readingId, 'forbidden');

      await page.goto('/');
      await completeReading(page, 'Unpaid');

      await expect(page.getByTestId('summary-hub')).toBeVisible();
      await page.getByTestId('summary-card-detail-cta-love').click();

      await expect(page.getByTestId('payment-confirm-modal')).toBeVisible();
      await page.getByTestId('payment-confirm-charge').click();
      await expect(page).toHaveURL(/\/charge$/);

      await page.goto(`/charge/fail?code=${scenario.code}`);

      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByTestId('summary-hub')).toBeVisible();
      await expect(page.getByTestId('summary-card-love')).toContainText('관계의 속도를 천천히 맞출수록 장점이 또렷해집니다.');
      await expect(page.getByTestId('summary-card-detail-cta-love')).toBeVisible();
      await expect(page.getByText('테스트용 상세 연애 설명입니다.')).not.toBeVisible();

      await expectAnalyticsEvent(
        recorder,
        SUMMARY_HUB_RESUME_OUTCOME_EVENT,
        (event) => event.eventData.resume_outcome === scenario.outcome
          && event.eventData.cta_origin_domain === 'love'
          && event.eventData.destination_focus === 'payment_retry'
          && event.eventData.detail_unlocked === false,
      );
    });
  }

  test('already-paid reopen skips payment and records resume outcome', async ({ page }) => {
    const readingId = 'reading-e2e-authenticated';
    const recorder = await installAnalyticsRecorder(page);

    await mockSharedShell(page, { balance: 500 });
    await mockAuthenticatedSession(page);
    await mockAuthenticatedReading(page, readingId);
    await mockReadingDetail(page, readingId, 'success');

    await page.goto('/');
    await completeReading(page, 'Paid');

    await expect(page.getByTestId('summary-hub')).toBeVisible();
    await page.getByTestId('summary-card-detail-cta-love').click();

    await expect(page.getByTestId('result-tab-panel')).toBeVisible();
    await expect(page.getByTestId('payment-confirm-modal')).not.toBeVisible();
    await expect(page.getByText('테스트용 상세 연애 설명입니다.')).toBeVisible();

    await expectAnalyticsEvent(
      recorder,
      SUMMARY_HUB_DETAIL_CTA_CLICKED_EVENT,
      (event) => event.eventData.cta_origin_surface === 'summary_hub_card'
        && event.eventData.cta_origin_domain === 'love'
        && event.eventData.is_authenticated === true,
    );

    await expectAnalyticsEvent(
      recorder,
      SUMMARY_HUB_RESUME_OUTCOME_EVENT,
      (event) => event.eventData.resume_outcome === 'already_entitled_reopen'
        && event.eventData.cta_origin_domain === 'love'
        && event.eventData.destination_focus === 'paid_detail'
        && event.eventData.detail_unlocked === true,
    );
  });

  test('mypage saved-profile reopen hydrates already-unlocked detail without relock', async ({ page }) => {
    const readingId = 'reading-e2e-mypage-reopen';
    const profileId = 'profile-e2e-mypage-reopen';
    const savedProfile = buildSavedProfile(profileId);
    let profileSaved = false;
    let detailRequestCount = 0;
    let spendCallCount = 0;

    await mockSharedShell(page, { balance: 500, includeProfiles: false });
    await mockAuthenticatedSession(page);
    await mockAuthenticatedReading(page, readingId);
    await mockMyPageDependencies(page);

    await page.route('**/api/saju/profiles', async (route: Route) => {
      if (route.request().method() === 'POST') {
        profileSaved = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: profileId }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(profileSaved ? [savedProfile] : []),
      });
    });

    await page.route(`**/api/cache/by-profile/${profileId}`, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildMockReadingResponse(readingId)),
      });
    });

    await page.route('**/api/payment/spend', async (route: Route) => {
      spendCallCount += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, balance: 350, spent: 150, transaction_id: 'tx-e2e' }),
      });
    });

    await page.route(`**/api/reading/${readingId}`, async (route: Route) => {
      detailRequestCount += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildDetailedReadingResponse(readingId)),
      });
    });

    await page.goto('/');
    await completeReading(page, 'SavedPaid');
    await expect(page.getByTestId('summary-hub')).toBeVisible();

    await page.getByTestId('summary-card-detail-cta-love').click();
    await expect(page.getByText('테스트용 상세 연애 설명입니다.')).toBeVisible();
    await expect.poll(() => detailRequestCount).toBe(1);
    expect(spendCallCount).toBe(0);

    await page.goto('/mypage');
    await expect(page.getByTestId('mypage-page')).toBeVisible();
    await expect(page.getByTestId(`saved-profile-open-${profileId}`)).toBeVisible();

    await page.getByTestId(`saved-profile-open-${profileId}`).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('result-tabs')).toBeVisible();
    await expect.poll(() => detailRequestCount).toBe(2);

    if (await page.getByTestId('summary-card-love').count()) {
      await page.getByTestId('summary-card-love').click();
    }
    await expect(page.getByText('테스트용 상세 연애 설명입니다.')).toBeVisible();
    await expect(page.getByTestId('detail-unlock-panel-love')).not.toBeVisible();
    await expect(page.getByTestId('payment-confirm-modal')).not.toBeVisible();
    expect(spendCallCount).toBe(0);
  });
});
