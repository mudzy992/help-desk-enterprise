import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: './tests',
  // The install-wizard specs live in this very directory (they continue the
  // 01…50 sequence), but they must never run with the shared suite: the
  // `globalSetup` below calls `ensureInstall`, which finishes the installation
  // through the API — the exact thing specs 51–53 prove through the UI. They have
  // their own config and their own (wait-for-stack only) setup in
  // `install-wizard/`; the glob keeps this list honest even if one is renamed.
  testIgnore: ['5[1-3]-install-wizard-*.spec.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // CI triage (2026-10-05): `E2E_RETRIES=0` skips the retry of a failing test,
  // which halves the time of a red run while the failures are being triaged.
  retries: process.env.E2E_RETRIES !== undefined
    ? Number(process.env.E2E_RETRIES)
    : process.env.CI
      ? 1
      : 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: path.join(__dirname, 'global-setup.ts'),
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
