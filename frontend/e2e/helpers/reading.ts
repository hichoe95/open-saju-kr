import { expect, Page } from '@playwright/test';

export interface ReadingInputOverrides {
  name?: string;
  year?: string;
  month?: string;
  day?: string;
  timeValue?: string;
  persona?: 'classic' | 'mz' | 'warm' | 'witty';
  details?: string;
}

export async function fillReadingForm(page: Page, overrides: ReadingInputOverrides = {}): Promise<void> {
  const {
    name = `E2E-${Date.now()}`,
    year = '1990',
    month = '01',
    day = '01',
    timeValue = 'unknown',
    persona = 'classic',
    details = '',
  } = overrides;

  await expect(page.getByTestId('reading-input-form')).toBeVisible();

  await page.getByTestId('birth-name-input').fill(name);
  await page.getByTestId('gender-male').check();
  await page.getByTestId('calendar-solar').check();
  await page.getByTestId('birth-year-select').selectOption(year);
  await page.getByTestId('birth-month-select').selectOption(month);
  await page.getByTestId('birth-day-select').selectOption(day);
  await page.getByTestId('birth-time-select').selectOption(timeValue);
  await page.getByTestId(`persona-${persona}`).click();

  if (details) {
    await page.getByTestId('concern-details-input').fill(details);
  }

  await page.getByTestId('analysis-agreement-checkbox').check();
}

export async function startReading(page: Page): Promise<void> {
  await page.getByTestId('analysis-submit-button').click();
}

export async function waitForReadingResult(page: Page): Promise<void> {
  await expect(page.getByTestId('analysis-result-container')).toBeVisible({ timeout: 180_000 });
  await expect(page.getByTestId('result-tabs')).toBeVisible({ timeout: 180_000 });
}

export async function assertPrimaryTabs(page: Page): Promise<void> {
  const tabs = ['summary', 'lucky', 'daeun', 'life'] as const;

  for (const tab of tabs) {
    await page.getByTestId(`primary-tab-${tab}`).click();
    await expect(page.getByTestId(`result-tab-panel-${tab}`)).toBeVisible();
  }
}

export async function saveProfileIfNeeded(page: Page): Promise<void> {
  const saveButton = page.getByTestId('save-profile-button');
  await expect(saveButton).toBeVisible();
  await saveButton.click();

  const consentModal = page.getByTestId('consent-modal');
  const consentVisible = await consentModal
    .waitFor({ state: 'visible', timeout: 3_000 })
    .then(() => true)
    .catch(() => false);

  if (consentVisible) {
    await page.getByTestId('consent-confirm-button').click();
  }

  await expect(page.getByText('저장 완료!')).toBeVisible({ timeout: 30_000 });
}

export async function createShareLink(page: Page): Promise<string> {
  await page.getByTestId('open-share-modal-button').click();
  await expect(page.getByTestId('share-modal')).toBeVisible();
  await page.getByTestId('share-tab-link').click();
  await page.getByTestId('create-share-link-button').click();
  const shareInput = page.getByTestId('share-url-input');
  await expect(shareInput).toBeVisible({ timeout: 30_000 });
  return shareInput.inputValue();
}
