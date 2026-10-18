import type { Page } from '@playwright/test';
import {
  currentStep,
  nextTotpCode,
  saveMfaSecret,
  totpForStep,
} from './mfa';

export async function completeMfaEnrollment(
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
  await acknowledgeRecoveryCodes(page);
}

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

export async function completeMfaVerify(
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
