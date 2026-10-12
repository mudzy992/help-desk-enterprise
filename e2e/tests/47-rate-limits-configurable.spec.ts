import { expect, test, type Locator, type Page } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { assertDisposableTestAccount } from '../helpers/disposable-account';
import { readE2EEnvironment } from '../helpers/environment';
import { nextTotpCode } from '../helpers/mfa';
import { signIn } from '../helpers/sign-in';

/*
  Paket 5.4.0-f (spec 47): the login rate limits are configuration, not code.

  5.4.0-b moved the eight scalars from `passwordLoginLimits`/`loginAttemptLimits`
  into `private.security.rateLimits.*` settings; the limiter reads them through
  `SecurityRateLimitConfigLoader` **per request**, so an administrator's change
  takes effect on the next attempt without a restart or a redeploy. 5.4.0-e put
  the same values on Admin → Sigurnost ("Ograničenja prijava"), edited through a
  dialog with one reason and a fresh proof of identity.

  The observable effect a spec can assert without waiting minutes is the
  **per-IP block**: `ipMaxFailures` is the only limit that answers 429 (the
  account bucket only adds a bounded delay, by design — "the account is never
  locked"). With the minimum window (10 s) the block is also temporary, so the
  test can prove the 429 and then leave the stack the way it found it.
*/

const rateLimitsCard = 'admin-rate-limits-card';
const rateLimitsDialog = 'admin-rate-limits-dialog';
const identityDialog = 'identity-confirm-dialog';

type RateLimitConfig = {
  readonly accountWindowSeconds: number;
  readonly accountDelayStartsAfterFailures: number;
  readonly accountDelayBaseMilliseconds: number;
  readonly accountDelayMaxMilliseconds: number;
  readonly ipMaxFailures: number;
  readonly ipWindowSeconds: number;
  readonly otherMaxFailures: number;
  readonly otherWindowSeconds: number;
};

type RateLimitsSnapshot = {
  readonly config: RateLimitConfig;
  readonly bounds: Readonly<Record<keyof RateLimitConfig, { readonly min: number; readonly max: number }>>;
};

type MetricsSnapshot = {
  readonly metrics: Readonly<Record<string, { readonly total: number }>>;
};

/**
 * A fresh account per failed attempt: the *account* bucket delays a repeated
 * failure (250 ms, then 500 ms, …) while the *IP* bucket is the one under test.
 * Distinct unknown addresses keep the IP counter counting at full speed.
 */
function rateLimitProbeEmail(index: number): string {
  return `e2e.rate-limit-probe-${index}@example.com`;
}

async function snapshot(admin: ApiClient): Promise<RateLimitsSnapshot> {
  return admin.requestJson<RateLimitsSnapshot>('/security/rate-limits');
}

async function putConfig(
  admin: ApiClient,
  config: RateLimitConfig,
  reason: string,
  code: string,
): Promise<RateLimitsSnapshot> {
  return admin.requestJson<RateLimitsSnapshot>('/security/rate-limits', {
    method: 'PUT',
    body: JSON.stringify({ config, reason, code }),
  });
}

/**
 * Regenerates the super admin's recovery codes and uses them where the API and
 * the identity dialog accept a code: a TOTP step is single-use and 30 s long, so
 * a spec that needs several confirmations would otherwise wait minutes.
 */
async function freshRecoveryCodes(admin: ApiClient, email: string): Promise<readonly string[]> {
  const { recoveryCodes } = await admin.requestJson<{ recoveryCodes: string[] }>(
    '/auth/mfa/recovery-codes',
    { method: 'POST', body: JSON.stringify({ code: await nextTotpCode(email) }) },
  );
  if (recoveryCodes.length < 4) {
    throw new Error(`[e2e] expected at least four recovery codes, received ${recoveryCodes.length}`);
  }
  return recoveryCodes;
}

/** Signs in on the page with a recovery code (the TOTP input is 6-7 digits only). */
async function signInWithRecoveryCode(
  page: Page,
  email: string,
  password: string,
  recoveryCode: string,
): Promise<void> {
  await page.goto('/login');
  const form = page.locator('form').filter({ has: page.locator('#login-email') });
  await form.locator('#login-email').fill(email);
  await form.locator('#login-password').fill(password);
  await form.locator('button[type="submit"]').click();

  const mfaForm = page.locator('form').filter({ has: page.locator('#mfa-code') });
  await expect(mfaForm).toBeVisible();
  await mfaForm.getByRole('button', { name: /rezervni kod|recovery code/i }).click();
  await mfaForm.locator('#mfa-code').fill(recoveryCode);
  await mfaForm.locator('button[type="submit"]').click();
  await expect(page.locator('button[aria-label^="Meni naloga"], button[aria-label^="Account menu"]').first()).toBeVisible();
}

/** The dialog asks for a code before a sensitive write; pass a recovery code. */
async function confirmIdentity(page: Page, code: string): Promise<void> {
  const dialog = page.getByTestId(identityDialog);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /rezervni kod|recovery code/i }).click();
  await dialog.locator('#identity-confirm-code').fill(code);
  await dialog.locator('button[type="submit"]').click();
}

function rateLimitField(dialog: Locator, field: 'ipMaxFailures' | 'ipWindowSeconds'): Locator {
  const label = field === 'ipMaxFailures'
    ? /IP blokada — neuspjesi prije blokade|IP block — failures before the block/i
    : /IP blokada — trajanje|IP block — duration/i;
  return dialog.locator('label').filter({ hasText: label }).locator('input');
}

test.describe('47 configurable login rate limits (5.4.0-b/e)', () => {
  test('a super admin retunes a threshold in the admin card with a reason and the API reflects it', async ({ page }) => {
    // Two SuperAdmin TOTP steps (sign-in and the recovery-code regeneration)
    // walk the 30 s window.
    test.setTimeout(150_000);
    const env = readE2EEnvironment();
    assertDisposableTestAccount(env.superAdminEmail, 'change the login rate limits');
    const admin = new ApiClient();
    await admin.login(env.superAdminEmail, env.superAdminPassword);
    const original = await snapshot(admin);
    const recoveryCodes = await freshRecoveryCodes(admin, env.superAdminEmail);
    const retuned: RateLimitConfig = { ...original.config, ipMaxFailures: 12, ipWindowSeconds: 20 };

    await signInWithRecoveryCode(page, env.superAdminEmail, env.superAdminPassword, recoveryCodes[0]!);
    // Remembered so the restore in `finally` can never paint over the real
    // cause: CI run 38244860637 reported only the `VALIDATION` error thrown by
    // that restore while the assertion that actually failed stayed invisible.
    let bodyFailure: unknown = null;
    try {
      await page.goto('/admin?tab=security');
      const card = page.getByTestId(rateLimitsCard);
      await expect(card).toBeVisible();
      // The three groups are rows, not inline forms: a row opens the dialog.
      await expect(page.getByTestId('admin-rate-limit-group-account')).toBeVisible();
      const ipRow = page.getByTestId('admin-rate-limit-group-ip');
      await expect(ipRow).toContainText(String(original.config.ipMaxFailures));

      await ipRow.click();
      const dialog = page.getByTestId(rateLimitsDialog);
      await expect(dialog).toBeVisible();
      const failures = rateLimitField(dialog, 'ipMaxFailures');
      // The form states the bound the server enforces.
      await expect(failures).toHaveAttribute('min', String(original.bounds.ipMaxFailures.min));
      await expect(failures).toHaveAttribute('max', String(original.bounds.ipMaxFailures.max));

      // Below the bound the save button stays disabled — a bound, not a hint.
      await failures.fill(String(original.bounds.ipMaxFailures.min - 1));
      await rateLimitField(dialog, 'ipWindowSeconds').fill(String(retuned.ipWindowSeconds));
      const save = dialog.getByRole('button', { name: /sačuvaj ograničenja|save the limits/i });
      await expect(save).toBeDisabled();

      await failures.fill(String(retuned.ipMaxFailures));
      const reason = dialog.locator('input[type="text"]');
      // Four characters: the reason needs **five** (the card's own
      // `minimumReasonLength = 5`, mirroring the server's `@MinLength(5)`).
      // Review 2026-10-12 (CI run 38255960313): this used a nine-character word,
      // so the button was legitimately enabled and the assertion failed — the
      // previous run had hidden it behind a `finally` that threw first.
      await reason.fill('krat');
      await expect(save).toBeDisabled();

      await reason.fill('E2E: kalibracija IP blokade kroz administratorsku karticu');
      await expect(save).toBeEnabled();
      await save.click();

      // Arm the response probe before the code is submitted: the card sends the
      // PUT only after the identity dialog confirms, and a refused save must
      // report the status instead of a bare "success message not visible".
      const saved = page.waitForResponse(
        (response) =>
          response.request().method() === 'PUT' &&
          new URL(response.url()).pathname.endsWith('/security/rate-limits'),
      );
      await confirmIdentity(page, recoveryCodes[1]!);
      expect((await saved).status()).toBe(200);
      await expect(page.getByTestId(rateLimitsDialog)).toBeHidden();
      await expect(page.getByText(/sačuvana i primjenjuju se odmah|saved and apply immediately/i)).toBeVisible();

      const stored = await snapshot(admin);
      expect(stored.config.ipMaxFailures).toBe(retuned.ipMaxFailures);
      expect(stored.config.ipWindowSeconds).toBe(retuned.ipWindowSeconds);
      expect(stored.config.accountDelayStartsAfterFailures).toBe(original.config.accountDelayStartsAfterFailures);
      // The card now shows the new value without a reload of the API.
      await expect(page.getByTestId('admin-rate-limit-group-ip')).toContainText(String(retuned.ipMaxFailures));
    } catch (error) {
      bodyFailure = error;
      throw error;
    } finally {
      // Always put the installation back the way it was found.
      try {
        await putConfig(
          admin,
          original.config,
          'E2E: vraćanje izvornih ograničenja nakon provjere',
          recoveryCodes[2] ?? (await nextTotpCode(env.superAdminEmail)),
        );
        const restored = await snapshot(admin);
        expect(restored.config).toEqual(original.config);
      } catch (restoreError) {
        if (bodyFailure === null) throw restoreError;
        console.error(
          `[e2e] the restore of the original rate limits also failed: ` +
            `${restoreError instanceof Error ? restoreError.message : String(restoreError)}`,
        );
      }
    }
  });

  test('a retuned per-IP limit answers 429 on the next attempt, without a restart, and the metric records it', async () => {
    // The 429 block is proven with the smallest allowed window (10 s), which the
    // trailing "temporary" check has to wait out.
    test.setTimeout(150_000);
    const env = readE2EEnvironment();
    assertDisposableTestAccount(env.superAdminEmail, 'change the login rate limits');
    const admin = new ApiClient();
    await admin.login(env.superAdminEmail, env.superAdminPassword);
    const original = await snapshot(admin);
    const recoveryCodes = await freshRecoveryCodes(admin, env.superAdminEmail);

    // Ten failures, ten seconds: the smallest window the bounds allow, so the
    // block is provable inside one test and expires by itself.
    const retuned: RateLimitConfig = { ...original.config, ipMaxFailures: 10, ipWindowSeconds: 10 };
    const applied = await putConfig(
      admin,
      retuned,
      'E2E: provjera da izmijenjeni prag stupa na snagu bez restarta',
      recoveryCodes[0]!,
    );
    expect(applied.config).toMatchObject({ ipMaxFailures: 10, ipWindowSeconds: 10 });

    // Same rule as the first test: the restore below must not hide the cause.
    let bodyFailure: unknown = null;
    try {
      const metricsBefore = await admin.requestJson<MetricsSnapshot>('/security/metrics/last-hour');

      // Sanity: the retuned limit did not break a normal sign-in.
      const normal = new ApiClient();
      await expect(normal.login(env.userEmail, env.userPassword)).resolves.toEqual(expect.any(String));

      for (let attempt = 0; attempt < retuned.ipMaxFailures; attempt += 1) {
        const response = await admin.request('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: rateLimitProbeEmail(attempt), password: 'not-the-password' }),
        });
        expect(response.status, `failure ${attempt + 1} of ${retuned.ipMaxFailures} must not be blocked yet`).toBe(401);
      }

      const blocked = await admin.request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: rateLimitProbeEmail(retuned.ipMaxFailures), password: 'not-the-password' }),
      });
      expect(blocked.status).toBe(429);
      const body = (await blocked.json()) as {
        readonly code?: string;
        readonly details?: { readonly retryAfterSeconds?: number };
      };
      expect(body.code).toBe('TOO_MANY_LOGIN_ATTEMPTS');
      // The window the administrator just set is the one the answer reports.
      expect(body.details?.retryAfterSeconds).toBe(retuned.ipWindowSeconds);

      const metrics = await admin.requestJson<MetricsSnapshot>('/security/metrics/last-hour');
      expect(
        (metrics.metrics['login-429']?.total ?? 0) - (metricsBefore.metrics['login-429']?.total ?? 0),
      ).toBeGreaterThan(0);
    } catch (error) {
      bodyFailure = error;
      throw error;
    } finally {
      try {
        const restored = await putConfig(
          admin,
          original.config,
          'E2E: vraćanje izvornih ograničenja nakon provjere blokade',
          recoveryCodes[1] ?? (await nextTotpCode(env.superAdminEmail)),
        );
        expect(restored.config).toEqual(original.config);
      } catch (restoreError) {
        if (bodyFailure === null) throw restoreError;
        console.error(
          `[e2e] the restore of the original rate limits also failed: ` +
            `${restoreError instanceof Error ? restoreError.message : String(restoreError)}`,
        );
      }
    }

    // A 429 is a temporary answer, not a lock: with the original (wider) policy
    // a correct sign-in is accepted again as soon as the short window expires.
    await expect(async () => {
      const fresh = new ApiClient();
      await fresh.login(env.userEmail, env.userPassword);
    }).toPass({ timeout: 20_000 });
  });
});
