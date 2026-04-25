import fs from 'node:fs';
import path from 'node:path';

import { defineConfig, devices } from '@playwright/test';

function loadDotEnvFile(fileName: string): void {
  const envPath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(envPath)) {
    return;
  }

  const raw = fs.readFileSync(envPath, 'utf-8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnvFile('.env.e2e');

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './e2e/specs',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 4 * 60 * 1000,
  expect: {
    timeout: 20_000,
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'output/playwright/report', open: 'never' }],
  ],
  outputDir: 'output/playwright/test-results',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1200 },
      },
    },
    {
      name: 'iphone-safari',
      use: {
        ...devices['iPhone 14'],
      },
    },
    {
      name: 'android-chrome',
      use: {
        ...devices['Pixel 7'],
      },
    },
  ],
});
