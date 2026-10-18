import type { Page } from '@playwright/test';
import { completeMfaEnrollment, completeMfaVerify } from './complete-mfa-ui';
import { dismissAnnouncementModal } from './dismiss-announcements';

export { dismissAnnouncementModal, gotoAndDismissAnnouncements } from './dismiss-announcements';

/**
 * Sign in through whichever credentials form the app currently exposes.
 *
 * Two forms exist, and which one is reachable depends on the route:
 *  - `#login-email` / `#login-password` on the dedicated login page, where
 *    `/` lands after `RequireAuth` redirects a visitor with no stored session;
 *  - `#session-email` / `#session-password` in the compact form embedded in
 *    the application header, shown when the shell renders with no server session.
 *
 * SUPER_ADMIN always requires MFA. USER/AGENT normally land in the app shell
 * with no second factor. A forced password-change screen is a hard failure —
 * actors must already hold the configured password before UI specs run.
 */
const EMAIL_SELECTOR = '#session-email, #login-email';
const PASSWORD_SELECTOR = '#session-password, #login-password';

function appNavigation(page: Page) {
  return page.getByRole('navigation', {
    name: /Glavna navigacija|Main navigation/i,
  });
}

async function attemptSignIn(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto('/');
  if (await appNavigation(page).isVisible().catch(() => false)) {
    return;
  }
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

  const enrollSecret = page.getByTestId('mfa-secret');
  const enrollInput = page.locator('#mfa-enroll-code');
  const verifyInput = page.locator('#mfa-code');
  const changePassword = page.locator('#change-password-new');

  const next = await Promise.race([
    enrollSecret.waitFor({ state: 'visible', timeout: 20_000 }).then(() => 'enroll' as const),
    enrollInput.waitFor({ state: 'visible', timeout: 20_000 }).then(() => 'enroll' as const),
    verifyInput.waitFor({ state: 'visible', timeout: 20_000 }).then(() => 'verify' as const),
    appNavigation(page).waitFor({ state: 'visible', timeout: 20_000 }).then(() => 'signed-in' as const),
    changePassword.waitFor({ state: 'visible', timeout: 20_000 }).then(() => 'must-change' as const),
  ]).catch(() => null);

  if (next === 'enroll') {
    await completeMfaEnrollment(page, email, enrollSecret, enrollInput);
    return;
  }
  if (next === 'verify') {
    await completeMfaVerify(page, email, verifyInput);
    return;
  }
  if (next === 'signed-in') {
    return;
  }
  if (next === 'must-change') {
    throw new Error(
      `[e2e] ${email} must change password before UI sign-in — align actors ` +
        '(ensure-e2e-actors / restoreTestActorPassword) to the configured E2E_*_PASSWORD',
    );
  }

  const alertText = (await page.getByRole('alert').allTextContents())
    .map((text) => text.trim())
    .filter((text) => text.length > 0)
    .join(' / ');
  throw new Error(
    `[e2e] password accepted but neither MFA, app shell, nor change-password appeared` +
      (alertText ? ` — ${alertText}` : ''),
  );
}

/**
 * One clean retry around the whole flow. MFA verify can stall on a TOTP step
 * boundary; the retry starts from a fresh page and a freshly computed code.
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
  await dismissAnnouncementModal(page);
}
