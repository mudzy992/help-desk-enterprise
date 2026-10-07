import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { assertDisposableTestAccount } from '../helpers/disposable-account';
import { readE2EEnvironment } from '../helpers/environment';
import { nextTotpCode } from '../helpers/mfa';

type MfaPendingLogin = {
  readonly status: 'MFA_REQUIRED' | 'MFA_ENROLLMENT_REQUIRED';
  readonly mfaToken: string;
};

type SessionResponse = { readonly accessToken: string };

/** Paket 5.2.1 M2: separate password buckets, keyed recovery codes, and revocation. */
test.describe('37 authentication security (5.2.1 M2 #3–#6)', () => {
  test('bad passwords add delay but never lock the correct password for that account', async () => {
    const env = readE2EEnvironment();
    const api = new ApiClient();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await api.request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: env.userEmail, password: 'definitely-not-the-password' }),
      });
      expect(response.status).toBe(401);
    }

    await expect(api.login(env.userEmail, env.userPassword)).resolves.toEqual(expect.any(String));
  });

  test('a recovery code is single-use and remaining-count reflects the keyed row', async () => {
    const env = readE2EEnvironment();
    const admin = new ApiClient();
    await admin.login(env.superAdminEmail, env.superAdminPassword);
    const generated = await admin.requestJson<{ recoveryCodes: string[] }>('/auth/mfa/recovery-codes', {
      method: 'POST',
      body: JSON.stringify({ code: await nextTotpCode(env.superAdminEmail) }),
    });
    if (generated.recoveryCodes.length !== 10) {
      throw new Error('Expected ten newly generated MFA recovery codes.');
    }
    const recoveryCode = generated.recoveryCodes[0];
    if (recoveryCode === undefined) throw new Error('A generated MFA recovery code was missing.');

    const firstSignIn = new ApiClient();
    const firstPending = await firstSignIn.requestJson<MfaPendingLogin>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: env.superAdminEmail, password: env.superAdminPassword }),
    });
    if (firstPending.status !== 'MFA_REQUIRED') throw new Error('Expected an MFA verification step.');
    const session = await firstSignIn.requestJson<SessionResponse>('/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ mfaToken: firstPending.mfaToken, code: recoveryCode }),
    });
    firstSignIn.setBearerToken(session.accessToken);
    const security = await firstSignIn.requestJson<{ mfa: { recoveryCodesRemaining: number } }>('/auth/security');
    expect(security.mfa.recoveryCodesRemaining).toBe(9);

    const secondPending = await firstSignIn.requestJson<MfaPendingLogin>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: env.superAdminEmail, password: env.superAdminPassword }),
    });
    if (secondPending.status !== 'MFA_REQUIRED') throw new Error('Expected a second MFA verification step.');
    const reused = await firstSignIn.request('/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ mfaToken: secondPending.mfaToken, code: recoveryCode }),
    });
    expect(reused.status).toBe(401);
    const failure = (await reused.json()) as { readonly code?: string };
    expect(failure.code).toBe('MFA_INVALID_CODE');
  });

  test('revoke-others keeps the caller, rejects old sessions, and permits a fresh same-window login', async () => {
    const env = readE2EEnvironment();
    const current = new ApiClient();
    const other = new ApiClient();
    await current.login(env.userEmail, env.userPassword);
    await other.login(env.userEmail, env.userPassword);

    const result = await current.requestJson<{ readonly revoked: number }>('/auth/sessions/revoke-others', {
      method: 'POST',
      body: '{}',
    });
    expect(result.revoked).toBeGreaterThan(0);
    expect((await current.request('/auth/security')).status).toBe(200);
    expect((await other.request('/auth/security')).status).toBe(401);

    const fresh = new ApiClient();
    await fresh.login(env.userEmail, env.userPassword);
    expect((await fresh.request('/auth/security')).status).toBe(200);
  });

  test('admin temporary-password reset revokes old sessions and the forced change restores sign-in', async () => {
    const env = readE2EEnvironment();
    assertDisposableTestAccount(env.userEmail, 'reset a test account password');
    if (!env.userEmail.trim().toLowerCase().endsWith('@example.com')) {
      throw new Error('This destructive reset E2E requires the reserved e2e.user@example.com test identity.');
    }
    const admin = new ApiClient();
    await admin.login(env.superAdminEmail, env.superAdminPassword);
    const users = await admin.requestJson<Array<{ readonly id: string; readonly email: string }>>(
      `/users?q=${encodeURIComponent(env.userEmail)}&take=10`,
    );
    const target = users.find((user) => user.email.toLowerCase() === env.userEmail.toLowerCase());
    if (target === undefined) throw new Error('Configured E2E user was not found through the users API.');

    const current = new ApiClient();
    const other = new ApiClient();
    await current.login(env.userEmail, env.userPassword);
    await other.login(env.userEmail, env.userPassword);

    const reset = await admin.requestJson<{
      readonly temporaryPassword: string | null;
      readonly temporaryPasswordDelivery: 'ui' | 'email';
    }>(`/users/${target.id}/reset-password`, { method: 'POST' });
    if (reset.temporaryPassword === null) {
      throw new Error(
        `[e2e] reset password was delivered by email (delivery=${reset.temporaryPasswordDelivery}); ` +
          'the server E2E account must use a reserved address that does not receive test mail.',
      );
    }

    let restored = false;
    const completeForcedChange = async () => {
      const temporaryLogin = await new ApiClient().requestJson<{
        readonly status?: string;
        readonly passwordChangeToken?: string;
      }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: env.userEmail, password: reset.temporaryPassword }),
      });
      if (
        temporaryLogin.status !== 'MUST_CHANGE_PASSWORD' ||
        temporaryLogin.passwordChangeToken === undefined
      ) {
        throw new Error(`Expected MUST_CHANGE_PASSWORD, received ${temporaryLogin.status ?? 'no status'}`);
      }
      const change = new ApiClient();
      change.setBearerToken(temporaryLogin.passwordChangeToken);
      await change.requestJson('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ newPassword: env.userPassword }),
      });
      restored = true;
    };

    try {
      expect((await current.request('/auth/security')).status).toBe(401);
      expect((await other.request('/auth/security')).status).toBe(401);
      await completeForcedChange();
      const fresh = new ApiClient();
      await fresh.login(env.userEmail, env.userPassword);
      expect((await fresh.request('/auth/security')).status).toBe(200);
    } finally {
      if (!restored) {
        try {
          await completeForcedChange();
        } catch (error) {
          console.error(`[e2e] could not restore the configured user password: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  });

  test('expired verify and enrollment steps explain re-sign-in and offer a retry path', async ({ page }) => {
    const env = readE2EEnvironment();
    let stage: 'verify' | 'enroll' = 'verify';
    await page.route('**/auth/login', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      const response = await route.fetch();
      const payload = (await response.json()) as Record<string, unknown>;
      await route.fulfill({
        response,
        json: {
          ...payload,
          status: stage === 'verify' ? 'MFA_REQUIRED' : 'MFA_ENROLLMENT_REQUIRED',
          mfaToken: 'expired-intermediate-token-from-e2e',
        },
      });
    });

    await page.goto('/login');
    const credentials = page.locator('form').filter({ has: page.locator('#login-email') });
    await credentials.locator('#login-email').fill(env.superAdminEmail);
    await credentials.locator('#login-password').fill(env.superAdminPassword);
    await credentials.locator('button[type="submit"]').click();

    const verifyForm = page.locator('form').filter({ has: page.locator('#mfa-code') });
    await expect(verifyForm).toBeVisible();
    await verifyForm.locator('#mfa-code').fill('123456');
    await verifyForm.locator('button[type="submit"]').click();
    await expect(page.getByRole('alert')).toContainText(/istekao|expired/i);
    await verifyForm.getByRole('button').last().click();
    await expect(page.locator('#login-email')).toBeVisible();

    stage = 'enroll';
    const retry = page.locator('form').filter({ has: page.locator('#login-email') });
    await retry.locator('#login-email').fill(env.superAdminEmail);
    await retry.locator('#login-password').fill(env.superAdminPassword);
    await retry.locator('button[type="submit"]').click();

    await expect(page.getByRole('alert')).toContainText(/istekao|expired/i);
    await page.getByRole('button', { name: /nazad na prijavu|back to sign in/i }).click();
    await expect(page.locator('#login-email')).toBeVisible();
  });
});
