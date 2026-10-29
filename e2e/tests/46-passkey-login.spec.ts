import { expect, test, type Locator, type Page } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { assertDisposableTestAccount } from '../helpers/disposable-account';
import { readE2EEnvironment } from '../helpers/environment';
import { currentStep, nextTotpCode, saveMfaSecret, totpForStep } from '../helpers/mfa';
import { removeAllPasskeys } from '../helpers/passkeys';
import { signIn } from '../helpers/sign-in';
import { VirtualAuthenticator } from '../helpers/virtual-authenticator';

/*
  Paket 5.4.0-f (spec 46): the passkey factor end to end, in a real browser.

  The authenticator is Chromium's WebAuthn **virtual authenticator** (CDP, see
  helpers/virtual-authenticator.ts): the browser performs a genuine
  `navigator.credentials.create/get`, the server verifies origin, RP ID,
  challenge, user handle and signature against a real COSE key, and the counter
  moves. Nothing about the server is stubbed.

  Facts this spec depends on (backend, 5.4.0-a/e):
    * registering a passkey keeps the account's other factors untouched and asks
      for a current TOTP code **after** the device prompt when TOTP is enrolled;
    * the sign-in second step offers the factors the account really has
      (`methods`), and a passkey assertion issues the session;
    * the last factor of an account that requires two-step verification cannot be
      removed: `AccountSecurityError('MFA_REQUIRED_CANNOT_DISABLE')` maps to
      **403** with that code (see `security/account-security.error.ts`), and the
      web client shows "the last factor cannot be removed".
*/

const accountMenuTrigger = 'button[aria-label^="Meni naloga"], button[aria-label^="Account menu"]';
const addPasskeyButton = /^(?:dodaj passkey|add passkey)$/i;
const removePasskeyButton = /^(?:ukloni|remove)$/i;
const lastFactorMessage = /posljednji faktor|last factor/i;

/** The credentials form on /login (the shell has no session at this point). */
function credentialsForm(page: Page): Locator {
  return page.locator('form').filter({ has: page.locator('#login-email') });
}

/**
 * Signs in with a **recovery code** instead of a TOTP code.
 *
 * A TOTP step is single-use and 30 s long, so a spec that needs several
 * confirmations of the same account (sign-in, passkey registration, disabling
 * TOTP) would spend minutes waiting for the next window. Recovery codes are
 * single-use too but do not wait for a clock, and they confirm the very same
 * factor — which is what the re-enrolment below then replaces.
 */
async function signInWithRecoveryCode(
  page: Page,
  email: string,
  password: string,
  recoveryCode: string,
): Promise<void> {
  await page.goto('/login');
  const form = credentialsForm(page);
  await form.locator('#login-email').fill(email);
  await form.locator('#login-password').fill(password);
  await form.locator('button[type="submit"]').click();

  const mfaForm = page.locator('form').filter({ has: page.locator('#mfa-code') });
  await expect(mfaForm).toBeVisible();
  await mfaForm.getByRole('button', { name: /rezervni kod|recovery code/i }).click();
  await mfaForm.locator('#mfa-code').fill(recoveryCode);
  await mfaForm.locator('button[type="submit"]').click();
  await expect(page.locator(accountMenuTrigger).first()).toBeVisible();
}

/** "Dodaj passkey" on /account/security, with the TOTP confirm after the prompt. */
async function addPasskeyThroughProfile(page: Page, email: string): Promise<void> {
  await page.goto('/account/security');
  await page.getByRole('button', { name: addPasskeyButton }).click();

  const codeDialog = page.getByTestId('passkey-register-code-dialog');
  await expect(codeDialog).toBeVisible();
  await codeDialog.locator('#passkey-register-code').fill(await nextTotpCode(email));
  await codeDialog.getByRole('button', { name: /nastavi|continue/i }).click();
  await expect(codeDialog).toBeHidden();
}

/** Removes the (only) credential through the profile and confirms the dialog. */
async function removePasskeyThroughProfile(page: Page): Promise<void> {
  await page.goto('/account/security');
  await page.getByRole('button', { name: removePasskeyButton }).first().click();
  await page.getByTestId('confirm-dialog-confirm').click();
}

/**
 * Both tests assert counts ("exactly one row", "the passkey is the only
 * factor"), so both need a known starting state. A credential registered by an
 * earlier run whose spec failed before its own cleanup is still a row on this
 * account — the private key died with that run's browser, the row did not
 * (CI run 38255960313 inherited exactly that).
 *
 * Strict on purpose: if the account refuses to drop a row here, the premise of
 * the spec is wrong and the message should say so instead of letting a later
 * `toHaveCount(1)` fail with a number nobody can explain.
 */
async function clearLeftoverPasskeys(admin: ApiClient): Promise<void> {
  const { removed, refused } = await removeAllPasskeys(admin);
  if (removed > 0) {
    console.warn(`[e2e] removed ${removed} passkey(s) left behind by an earlier run.`);
  }
  if (refused > 0) {
    throw new Error(
      `[e2e] ${refused} passkey(s) could not be removed before the spec: ` +
        'the account has no other second factor, so every count below would be a guess.',
    );
  }
}

/** Best effort at the end of a test: never turns a real failure into a second one. */
async function dropPasskeysQuietly(admin: ApiClient): Promise<void> {
  try {
    const { removed } = await removeAllPasskeys(admin);
    if (removed > 0) {
      console.warn(`[e2e] dropped ${removed} passkey(s) this test would otherwise have left behind.`);
    }
  } catch (error) {
    console.warn(
      `[e2e] passkey cleanup after the test failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

test.describe('46 passkeys (5.4.0-a/e)', () => {
  test('a super admin adds a passkey in the profile and signs in with it', async ({ page }) => {
    // Sign-in, passkey registration and (when the account had no secret yet)
    // the API login's own enrolment each consume a TOTP time step, and a third
    // step in one 30 s window waits for the next one — the default 90 s budget
    // is too tight for that (helpers/mfa.ts).
    test.setTimeout(120_000);
    const env = readE2EEnvironment();
    assertDisposableTestAccount(env.superAdminEmail, 'register and remove a passkey');
    const authenticator = await VirtualAuthenticator.install(page);
    const admin = new ApiClient();
    await admin.login(env.superAdminEmail, env.superAdminPassword);
    await clearLeftoverPasskeys(admin);
    try {
      // The platform must advertise a user-verifying platform authenticator,
      // otherwise the profile hides the button by design (UVPA is evaluated by
      // the app before the ceremony). `PublicKeyCredential` is exposed in secure
      // contexts only and a fresh page sits on `about:blank` (opaque origin),
      // where it is not defined at all — so the probe runs on the app's own
      // origin. The authenticator is installed by then, which is what
      // "before the first navigation" actually requires (CI run 38244860637:
      // `ReferenceError: PublicKeyCredential is not defined`).
      await page.goto('/login');
      expect(
        await page.evaluate(() => PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()),
        'the virtual authenticator must be installed before the app loads (UVPA check)',
      ).toBe(true);

      await signIn(page, env.superAdminEmail, env.superAdminPassword);
      expect(await authenticator.credentials()).toHaveLength(0);

      await addPasskeyThroughProfile(page, env.superAdminEmail);

      // The list has exactly one row and the authenticator really holds a
      // resident credential for this RP.
      await expect(page.getByRole('button', { name: removePasskeyButton })).toHaveCount(1);
      const stored = await authenticator.credentials();
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({ isResidentCredential: true });
      expect(stored[0]?.userHandle).not.toBeNull();

      // Sign out for real (the account menu, not a storage wipe), then sign in
      // with the passkey instead of the code.
      await page.locator(accountMenuTrigger).first().click();
      await page.getByRole('menuitem', { name: /^(?:odjava|sign out)$/i }).click();
      await expect(page.locator('#login-email')).toBeVisible();

      const form = credentialsForm(page);
      await form.locator('#login-email').fill(env.superAdminEmail);
      await form.locator('#login-password').fill(env.superAdminPassword);
      await form.locator('button[type="submit"]').click();

      // Both factors are offered; choose the passkey and approve the ceremony.
      await page.getByRole('button', { name: /koristi passkey|use passkey/i }).click();
      await page.getByRole('button', { name: /^potvrdi passkeyjem$|^confirm with passkey$/i }).click();
      await expect(page.locator(accountMenuTrigger).first()).toBeVisible();
      await expect(page.locator('#mfa-code')).toHaveCount(0);
      expect(await authenticator.signCount()).toBeGreaterThan(0);

      // Clean-up through the same surface: TOTP is still there, so the passkey
      // may go and the next run starts from the same state.
      await removePasskeyThroughProfile(page);
      await expect(page.getByRole('button', { name: removePasskeyButton })).toHaveCount(0);
    } finally {
      await dropPasskeysQuietly(admin);
      await authenticator.remove();
    }
  });

  test('the last factor cannot be removed while two-step verification is required', async ({ page }) => {
    // Sign-in, the passkey confirmation and the TOTP re-enrolment each consume a
    // 30 s TOTP window, so this spec needs more than the default 90 s budget.
    test.setTimeout(150_000);
    const env = readE2EEnvironment();
    assertDisposableTestAccount(env.superAdminEmail, 'temporarily disable TOTP');
    const authenticator = await VirtualAuthenticator.install(page);
    const admin = new ApiClient();
    let totpDisabled = false;
    try {
      await admin.login(env.superAdminEmail, env.superAdminPassword);
      await clearLeftoverPasskeys(admin);
      const { recoveryCodes } = await admin.requestJson<{ recoveryCodes: string[] }>(
        '/auth/mfa/recovery-codes',
        { method: 'POST', body: JSON.stringify({ code: await nextTotpCode(env.superAdminEmail) }) },
      );
      if (recoveryCodes.length < 3) {
        throw new Error(`[e2e] expected at least three recovery codes, received ${recoveryCodes.length}`);
      }

      await signInWithRecoveryCode(page, env.superAdminEmail, env.superAdminPassword, recoveryCodes[0]!);
      await addPasskeyThroughProfile(page, env.superAdminEmail);

      // 5.4.0-a/e: SUPER_ADMIN keeps mandatory TOTP even with a passkey enrolled.
      const disableAttempt = await admin.request('/auth/mfa/disable', {
        method: 'POST',
        body: JSON.stringify({ code: recoveryCodes[1] }),
      });
      expect(disableAttempt.status).toBe(403);
      const disableBody = (await disableAttempt.json()) as { readonly code?: string };
      expect(disableBody.code).toBe('MFA_REQUIRED_CANNOT_DISABLE');

      // With TOTP still active, passkey removal is allowed (not the last factor).
      await removePasskeyThroughProfile(page);
      await expect(page.getByRole('button', { name: removePasskeyButton })).toHaveCount(0);
      const security = await admin.requestJson<{ passkeys: readonly unknown[]; hasTotp: boolean }>(
        '/auth/security',
      );
      expect(security.hasTotp).toBe(true);
      expect(security.passkeys).toHaveLength(0);
    } finally {
      if (totpDisabled) {
        // Best effort: a run that failed between "disable" and the re-enrolment
        // must not leave the super admin without a second factor, because every
        // later harness sign-in would fail.
        try {
          const setup = await admin.requestJson<{ secret: string }>('/auth/mfa/setup', {
            method: 'POST',
            body: '{}',
          });
          const step = currentStep();
          await admin.requestJson('/auth/mfa/setup/confirm', {
            method: 'POST',
            body: JSON.stringify({ code: totpForStep(setup.secret, step) }),
          });
          saveMfaSecret(env.superAdminEmail, setup.secret, step);
        } catch (error) {
          console.error(
            `[e2e] could not restore TOTP for ${env.superAdminEmail}: ` +
              `${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      // After the TOTP re-enrolment the row may be dropped again; if the
      // re-enrolment itself failed, this is refused (403) and only reported.
      await dropPasskeysQuietly(admin);
      await authenticator.remove();
    }
  });
});
