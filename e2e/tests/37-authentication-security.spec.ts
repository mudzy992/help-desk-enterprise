import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { assertDisposableTestAccount } from '../helpers/disposable-account';
import { readE2EEnvironment } from '../helpers/environment';
import { nextTotpCode } from '../helpers/mfa';
import { restoreTestActorPassword } from '../helpers/provision-test-actors';

type MfaPendingLogin = {
  readonly status: 'MFA_REQUIRED' | 'MFA_ENROLLMENT_REQUIRED';
  readonly mfaToken: string;
};

type SessionResponse = { readonly expiresInSeconds: number };

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
    expect(session.expiresInSeconds).toBeGreaterThan(0);
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
    await current.login(env.userEmail, env.userPassword, { newSession: true });
    await other.login(env.userEmail, env.userPassword, { newSession: true });

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
        // The configured password may be refused (Pwned Passwords); the admin
        // restore path falls back to a generated value for the rest of the run.
        try {
          await restoreTestActorPassword(admin, {
            userId: target.id,
            email: env.userEmail,
            password: env.userPassword,
          });
        } catch (error) {
          console.error(
            `[e2e] could not restore the configured user password: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
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
    // The last button toggles recovery-code input; select the cancel action explicitly.
    await verifyForm.getByRole('button', { name: /^(?:odustani|cancel)$/i }).click();
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

/**
 * Paket 5.4.0-f (spec 37 extension): the two 5.4 authentication behaviours a
 * browser cannot show on its own.
 *
 *  * **"Zapamti me" (5.4.0-c)**: a remembered session lasts 30 days, the choice
 *    travels through the MFA intermediate step, is stored on the session row and
 *    survives a refresh. A SUPER_ADMIN is break-glass and never gets it.
 *  * **Bulk password reset (5.4.0-d)**: one SuperAdmin action raises
 *    `mustChangePassword` for every local account the application manages (never
 *    for a SuperAdmin), revokes their sessions without touching a single
 *    password, and reports counts; a repeat call keeps revoking and honestly
 *    reports zero changed accounts.
 */
type SessionTtl = {
  readonly expiresInSeconds: number;
};

/**
 * Signs in with an explicit remember-me choice, following the MFA step when the
 * account has a second factor. The choice travels inside the MFA token claims,
 * which is what this spec is about.
 */
async function signInWithRememberMe(
  api: ApiClient,
  email: string,
  password: string,
  rememberMe: boolean,
): Promise<SessionTtl> {
  const body = await api.requestJson<SessionTtl & { status?: string; mfaToken?: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, rememberMe }),
  });
  if (body.status === 'MFA_REQUIRED' && body.mfaToken !== undefined) {
    const verified = await api.requestJson<SessionTtl>('/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ mfaToken: body.mfaToken, code: await nextTotpCode(email) }),
    });
    return verified;
  }
  if (body.status !== undefined) throw new Error(`[e2e] login requires ${body.status}`);
  if (body.expiresInSeconds === undefined) throw new Error('[e2e] login answer carried no session lifetime');
  return body;
}

type BulkPasswordResetResult = {
  readonly eligibleUsers: number;
  readonly changedUsers: number;
  readonly revokedSessions: number;
  readonly failedUsers: number;
};

test.describe('37 authentication security extensions (5.4.0-c/d)', () => {
  test('remember me lasts 30 days, survives a refresh, and never applies to a super admin', async () => {
    test.setTimeout(120_000);
    const env = readE2EEnvironment();
    const normal = await signInWithRememberMe(new ApiClient(), env.userEmail, env.userPassword, false);
    const rememberedClient = new ApiClient();
    const remembered = await signInWithRememberMe(rememberedClient, env.userEmail, env.userPassword, true);

    // 30 days against the 1 h default; asserting the relation keeps the spec
    // honest even if the deployment tunes `session.*` (5.4.0-c).
    expect(remembered.expiresInSeconds).toBeGreaterThan(normal.expiresInSeconds * 24);
    const refreshed = await rememberedClient.requestJson<SessionTtl>('/auth/refresh', { method: 'POST' });
    expect(refreshed.expiresInSeconds).toBe(remembered.expiresInSeconds);

    // Break-glass: asking for 30 days as a SuperAdmin yields the plain 1 h again
    // — and a refresh re-derives the same answer from the session row.
    const adminClient = new ApiClient();
    const admin = await signInWithRememberMe(adminClient, env.superAdminEmail, env.superAdminPassword, true);
    expect(admin.expiresInSeconds).toBe(normal.expiresInSeconds);
    expect(admin.expiresInSeconds).toBeLessThan(remembered.expiresInSeconds);
    const adminRefreshed = await adminClient.requestJson<SessionTtl>('/auth/refresh', { method: 'POST' });
    expect(adminRefreshed.expiresInSeconds).toBe(admin.expiresInSeconds);
  });

  test('the bulk password reset flags every local account, revokes their sessions and can be repeated', async () => {
    // Two SuperAdmin TOTP steps (sign-in and the identity proof) walk the 30 s
    // window, so this spec asks for more than the default 90 s budget.
    test.setTimeout(180_000);
    const env = readE2EEnvironment();
    assertDisposableTestAccount(env.userEmail, 'flag every local account');
    assertDisposableTestAccount(env.agentEmail, 'flag every local account');

    const admin = new ApiClient();
    await admin.login(env.superAdminEmail, env.superAdminPassword);
    const user = new ApiClient();
    await user.login(env.userEmail, env.userPassword);

    let first: BulkPasswordResetResult | null = null;
    try {
      first = await admin.requestJson<BulkPasswordResetResult>('/security/bulk-password-reset', {
        method: 'POST',
        body: JSON.stringify({ code: await nextTotpCode(env.superAdminEmail) }),
      });

      // Counts only, and honest ones: every targeted account could be flagged
      // and every session revoked.
      expect(first.changedUsers).toBeGreaterThan(0);
      expect(first.eligibleUsers).toBeGreaterThanOrEqual(first.changedUsers);
      expect(first.failedUsers).toBe(0);

      // The password itself is untouched, but the next sign-in is forced through
      // the change screen; the live session of the affected account is gone.
      expect((await user.request('/auth/security')).status).toBe(401);
      const forced = await new ApiClient().requestJson<{ status?: string; passwordChangeToken?: string }>(
        '/auth/login',
        { method: 'POST', body: JSON.stringify({ email: env.userEmail, password: env.userPassword }) },
      );
      expect(forced.status).toBe('MUST_CHANGE_PASSWORD');
      expect(forced.passwordChangeToken).toEqual(expect.any(String));

      // A SuperAdmin is never a target — the acting session keeps working.
      expect((await admin.request('/auth/security')).status).toBe(200);

      // Repeated action: nothing left to flag, and it says so instead of
      // reporting the first result again.
      const second = await admin.requestJson<BulkPasswordResetResult>('/security/bulk-password-reset', {
        method: 'POST',
        body: JSON.stringify({ code: await nextTotpCode(env.superAdminEmail) }),
      });
      expect(second.changedUsers).toBe(0);
      expect(second.failedUsers).toBe(0);
    } finally {
      // Put the actors back through the documented admin path (temporary
      // password + forced change): the bulk reset changed no password, and
      // "change to the password it already has" is refused as PASSWORD_REUSED.
      await restoreTestActorPassword(admin, { email: env.userEmail, password: env.userPassword });
      await restoreTestActorPassword(admin, { email: env.agentEmail, password: env.agentPassword });
    }

    // Both actors sign in with their configured passwords again, so every later
    // spec finds the stack as this one did.
    await expect(new ApiClient().login(env.userEmail, env.userPassword)).resolves.toEqual(expect.any(String));
    await expect(new ApiClient().login(env.agentEmail, env.agentPassword)).resolves.toEqual(expect.any(String));
    expect(first?.revokedSessions).toBeGreaterThan(0);
  });
});
