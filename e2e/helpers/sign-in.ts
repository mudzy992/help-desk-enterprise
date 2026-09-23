import type { Page } from '@playwright/test';

/**
 * Sign in through whichever credentials form the app currently exposes.
 *
 * Two forms exist, and which one is reachable depends on the route:
 *  - `#login-email` / `#login-password` on the dedicated login page, where
 *    `/` lands after `RequireAuth` redirects a visitor with no stored session;
 *  - `#session-email` / `#session-password` in the compact form embedded in the
 *    application header, shown when the shell renders with no server session.
 *
 * Matching both keeps this helper working no matter which surface the app
 * shows first.
 */
const EMAIL_SELECTOR = '#session-email, #login-email';
const PASSWORD_SELECTOR = '#session-password, #login-password';

export async function signIn(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto('/');
  const form = page
    .locator('form')
    .filter({ has: page.locator(EMAIL_SELECTOR) });
  await form.locator(EMAIL_SELECTOR).fill(email);
  await form.locator(PASSWORD_SELECTOR).fill(password);
  await form.locator('button[type="submit"]').click();
  await page.waitForSelector(EMAIL_SELECTOR, {
    state: 'detached',
    timeout: 20_000,
  });
}
