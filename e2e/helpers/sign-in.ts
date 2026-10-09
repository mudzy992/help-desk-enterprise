import type { Page } from '@playwright/test';
import { nextTotpCode } from './mfa';

/**
 * Sign in through whichever credentials form the app currently exposes.
 *
 * Two forms exist, and which one is reachable depends on the route:
 *  - `#login-email` / `#login-password` on the dedicated login page, where
 *    `/` lands after `RequireAuth` redirects a visitor with no stored session;
 *  - `#session-email` / `#session-password` in the compact form embedded in
 *    the application header, shown when the shell renders with no server session.
 *
 * Matching both keeps this helper working no matter which surface the app
 * shows first.
 */
const EMAIL_SELECTOR = '#session-email, #login-email';
const PASSWORD_SELECTOR = '#session-password, #login-password';

async function attemptSignIn(
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
  // Paket 2.1: accounts with two-step verification get a code step on /login.
  const mfaInput = page.locator('#mfa-code');
  const needsCode = await mfaInput
    .waitFor({ state: 'visible', timeout: 3_000 })
    .then(() => true)
    .catch(() => false);
  if (needsCode) {
    await mfaInput.fill(await nextTotpCode(email));
    const verifyResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname.endsWith('/auth/mfa/verify'),
      { timeout: 15_000 },
    );
    const [verifyResponse] = await Promise.all([
      verifyResponsePromise,
      page.locator('form').filter({ has: mfaInput }).locator('button[type="submit"]').click(),
    ]);
    if (!verifyResponse.ok()) {
      const responseBody = await verifyResponse.text();
      let errorCode = `HTTP_${verifyResponse.status()}`;
      try {
        const payload = JSON.parse(responseBody) as { readonly code?: unknown };
        if (typeof payload.code === 'string') {
          errorCode = payload.code;
        }
      } catch {
        // Keep the HTTP status when the server returned a non-JSON error body.
      }
      const formError = await page.locator('#mfa-code-error').textContent().catch(() => null);
      throw new Error(
        `[e2e] MFA verification rejected (${errorCode})${formError ? `: ${formError.trim()}` : ''}.`,
      );
    }
    await mfaInput.waitFor({ state: 'detached', timeout: 20_000 });
  }
}

/**
 * One clean retry around the whole flow. The MFA verify call has stalled
 * transiently more than once across runs (a dropped request or a TOTP step
 * boundary), while the identical flow passed on every following run. The
 * retry starts from a fresh page and a freshly computed code; if the problem
 * is real, the retry surfaces the same detailed error (status, API code and
 * the form's message) instead of masking it.
 */
export async function signIn(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  try {
    await attemptSignIn(page, email, password);
  } catch (caught) {
    const detail = caught instanceof Error ? caught.message : String(caught);
    console.warn(`[e2e] sign-in attempt failed, retrying once with a fresh code — ${detail}`);
    await attemptSignIn(page, email, password);
  }
}
