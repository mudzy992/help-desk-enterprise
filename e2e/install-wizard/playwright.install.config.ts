import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

/*
  F6 — the install wizard, end to end.

  This config is deliberately separate from `e2e/playwright.config.ts`:

  * its `globalSetup` is `waitForStack` only. The shared setup calls
    `ensureInstall`, which completes the installation through the API before any
    spec runs — the exact thing these two specs exist to prove through the UI;
  * the specs need an installation that is **not** finished (an empty database,
    or one whose wizard was reopened with `INSTALL_ALLOW_RERUN`/
    `npm run cli:install-rerun`).

  The spec **files** live in `e2e/tests/` (they continue the shared sequence:
  …, 50, 51, 52, 53), so nobody has to guess where they are; the shared config keeps
  them out with a `testIgnore` glob and this config picks exactly those three. The
  helpers, this config and the wait-for-stack setup stay here, next to the
  artifacts they produce.

  Run it against a clean stack:

    cd e2e
    E2E_INSTALL_TOKEN=<at least 16 characters> \
      npx playwright test -c install-wizard/playwright.install.config.ts

  The token is the deployment's `INSTALL_TOKEN` (`.env.example`), and the wizard
  asks for it on `/install` before the first step. `E2E_CLEAN_STACK=1` is the
  promise the operator makes that the database is empty; without it the specs run
  anyway and fail on the first step that needs an unsaved wizard state.
*/

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

export default defineConfig({
  // The specs live in the shared `tests/` directory; the helpers and the setup
  // stay here, so the specs import from `../install-wizard/…` and the artifacts
  // stay out of the shared `test-results/`.
  testDir: path.join(__dirname, '..', 'tests'),
  testMatch: ['5[1-3]-install-wizard-*.spec.ts'],
  // Playwright resolves both paths against the config's own directory, so the
  // wizard run never mixes its traces into the shared suite's `test-results/`.
  outputDir: path.join(__dirname, 'test-results'),
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.E2E_RETRIES !== undefined ? Number(process.env.E2E_RETRIES) : 0,
  // One worker: the specs walk the same wizard and finish the same installation.
  workers: 1,
  timeout: 240_000,
  expect: { timeout: 20_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: path.join(__dirname, 'playwright-report') }]],
  globalSetup: path.join(__dirname, 'playwright.install-global-setup.ts'),
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'install-wizard', use: { ...devices['Desktop Chrome'] } }],
});
