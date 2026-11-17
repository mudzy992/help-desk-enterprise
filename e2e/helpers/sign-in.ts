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

/**
 * Every route is gated on `GET /install/status`; when that request fails the app
 * renders `GateStatusError` ("Status instalacije nije moguće provjeriti") instead
 * of the credentials form — on purpose, it never guesses where the user belongs.
 *
 * Nightly run 44049572740 (2026-11-17): during the outage spec 43 spent 20 s on
 * `locator.fill` and reported a timeout, which reads like a broken login form.
 * A gate error while signing in is an availability problem, never a credentials
 * problem, so it is waited out (the screen has its own "Pokušaj ponovo") and then
 * named explicitly.
 */
const GATE_STATUS_ERROR_SELECTOR = '[data-testid="gate-status-error"]';

function appNavigation(page: Page) {
  return page.getByRole('navigation', {
    name: /Glavna navigacija|Main navigation/i,
  });
}

/**
 * Click through the gate error while the stack is coming back. Returns once the
 * screen is gone; throws `STACK_UNAVAILABLE` when the budget runs out, so the
 * failure summary can classify it instead of blaming the login form.
 */
async function waitThroughGateStatusError(page: Page, budgetMs = 30_000): Promise<void> {
  const gate = page.locator(GATE_STATUS_ERROR_SELECTOR);
  const started = Date.now();
  let attempts = 0;
  while (Date.now() - started < budgetMs) {
    await page.waitForLoadState('domcontentloaded').catch(() => undefined);
    if (!(await gate.first().isVisible().catch(() => false))) {
      return;
    }
    attempts += 1;
    const retry = gate.getByRole('button').first();
    if (await retry.isVisible().catch(() => false)) {
      await retry.click().catch(() => undefined);
    } else {
      await page.reload().catch(() => undefined);
    }
    await page.waitForTimeout(2_000);
  }
  const alertText = (await page.getByRole('alert').allTextContents())
    .map((text) => text.trim())
    .filter((text) => text.length > 0)
    .join(' / ');
  throw new Error(
    `STACK_UNAVAILABLE: GET /install/status never answered (${attempts} retries in ${budgetMs / 1_000}s) — ` +
      'the app shows its install-status gate error instead of the sign-in form, so this is the stack, not the account' +
      (alertText.length > 0 ? `: ${alertText}` : '.'),
  );
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
  const surface = await Promise.race([
    form.first().waitFor({ state: 'visible', timeout: 20_000 }).then(() => 'form' as const),
    page
      .locator(GATE_STATUS_ERROR_SELECTOR)
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => 'gate-status-error' as const),
  ]).catch(() => 'none' as const);
  if (surface === 'gate-status-error') {
    await waitThroughGateStatusError(page);
    await page.goto('/');
  }
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
