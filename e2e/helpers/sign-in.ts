import type { Page } from '@playwright/test';
import { dismissAnnouncementModal } from './dismiss-announcements';
import {
  currentStep,
  nextTotpCode,
  saveMfaSecret,
  totpForStep,
} from './mfa';

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
 * SUPER_ADMIN always requires MFA. A brand-new install hits forced enrollment
 * (`#mfa-enroll-code` + `data-testid="mfa-secret"`); later sign-ins use verify
 * (`#mfa-code`). Both paths have to succeed before this helper returns.
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

  const enrollSecret = page.getByTestId('mfa-secret');
  const enrollInput = page.locator('#mfa-enroll-code');
  const verifyInput = page.locator('#mfa-code');

  // SUPER_ADMIN always lands on MFA. Enrollment shows the manual key a moment
  // after the password form leaves (QR + secret load); verify shows `#mfa-code`.
  // Returning here without one of those used to look like a green sign-in while
  // the session was never issued (install wizard spec 51).
  const mfaKind = await Promise.race([
    enrollSecret.waitFor({ state: 'visible', timeout: 20_000 }).then(() => 'enroll' as const),
    enrollInput.waitFor({ state: 'visible', timeout: 20_000 }).then(() => 'enroll' as const),
    verifyInput.waitFor({ state: 'visible', timeout: 20_000 }).then(() => 'verify' as const),
  ]).catch(() => null);

  if (mfaKind === 'enroll') {
    await completeMfaEnrollment(page, email, enrollSecret, enrollInput);
    return;
  }
  if (mfaKind === 'verify') {
    await completeMfaVerify(page, email, verifyInput);
    return;
  }

  const alertText = (await page.getByRole('alert').allTextContents())
    .map((text) => text.trim())
    .filter((text) => text.length > 0)
    .join(' / ');
  throw new Error(
    `[e2e] password accepted but neither MFA enrollment nor MFA verify appeared` +
      (alertText ? ` — ${alertText}` : ''),
  );
}

async function completeMfaEnrollment(
  page: Page,
  email: string,
  secretLocator: ReturnType<Page['getByTestId']>,
  codeInput: ReturnType<Page['locator']>,
): Promise<void> {
  const grouped = ((await secretLocator.textContent()) ?? '').trim();
  const secret = grouped.replace(/\s+/g, '');
  if (secret.length < 16) {
    throw new Error(`[e2e] MFA enrollment secret missing or too short (${secret.length} chars).`);
  }
  const step = currentStep();
  saveMfaSecret(email, secret, step - 1);
  await codeInput.waitFor({ state: 'visible', timeout: 10_000 });
  await codeInput.fill(totpForStep(secret, step));
  saveMfaSecret(email, secret, step);

  const confirmResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith('/auth/mfa/enroll/confirm'),
    { timeout: 15_000 },
  );
  const [confirmResponse] = await Promise.all([
    confirmResponsePromise,
    page.locator('form').filter({ has: codeInput }).locator('button[type="submit"]').click(),
  ]);
  if (!confirmResponse.ok()) {
    const formError = await page.locator('#mfa-enroll-code-error').textContent().catch(() => null);
    throw new Error(
      `[e2e] MFA enrollment rejected (HTTP_${confirmResponse.status()})${
        formError ? `: ${formError.trim()}` : ''
      }.`,
    );
  }
  // Forced enrollment holds the session until recovery codes are acknowledged
  // (`confirmMfaEnrollment` → `finish()`). Leaving here after the code field
  // detaches used to look like a green sign-in with no cookie issued.
  await acknowledgeRecoveryCodes(page);
}

/** Checkbox + continue on the one-time recovery-codes panel after MFA enroll. */
async function acknowledgeRecoveryCodes(page: Page): Promise<void> {
  const panel = page.getByTestId('recovery-codes');
  await panel.waitFor({ state: 'visible', timeout: 20_000 });
  const saved = page.getByRole('checkbox', {
    name: /sačuvao\/la sam rezervne kodove|i (have )?saved (the )?recovery codes/i,
  });
  await saved.check();
  await page.getByRole('button', { name: /nastavi|continue/i }).click();
  await panel.waitFor({ state: 'detached', timeout: 20_000 });
}

async function completeMfaVerify(
  page: Page,
  email: string,
  mfaInput: ReturnType<Page['locator']>,
): Promise<void> {
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
  await dismissAnnouncementModal(page);
}
