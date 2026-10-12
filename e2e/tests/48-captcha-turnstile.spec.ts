import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { readE2EEnvironment } from '../helpers/environment';
import { readSetting, setSetting } from '../helpers/assets';

/*
  Paket 5.4.1 (spec 48): the CAPTCHA gate in front of a password sign-in.

  `private.security.captcha.provider` is `none` by default, and then nothing
  changes: no challenge, no request to Cloudflare, the rate limits do the work.
  With `turnstile` configured, the *server* starts asking for a solved challenge
  from the fifth failed attempt of one IP on — the widget itself only exists
  because the server asked (`CAPTCHA_REQUIRED`).

  What this spec asserts without reaching Cloudflare:

    1. default `none`: even after a burst of failed sign-ins the API never
       answers `CAPTCHA_REQUIRED`;
    2. `turnstile` configured with a site key: the very next attempt after that
       burst gets `CAPTCHA_REQUIRED`, and the sign-in form then shows the
       challenge (the block is ours — it renders whether or not Cloudflare's
       script loads, which keeps the assertion meaningful on a runner without
       internet).

  The burst is deliberately short: successful and failed attempts share the IP
  bucket, and its window is minutes long, so every extra wrong password shortens
  the room the rest of the suite has. Six attempts are enough to pass the
  five-failure threshold the provider is pinned to.

  The widget solving itself — a real token, verified by Cloudflare — is covered
  by `login-captcha.service.spec.ts` (verdicts, fail-open) and by the owner's
  live check; a stack with no internet cannot produce a token at all.

  The test mutates two settings, so it snapshots them first and restores them in
  `finally`: leaving `turnstile` on would ask every other sign-in spec for a
  challenge.
*/

const providerKey = 'private.security.captcha.provider';
const siteKeyKey = 'private.security.captcha.siteKey';
/** Cloudflare's documented "always passes" test site key; it is public by design. */
const testSiteKey = '1x00000000000000000000AA';

type ProvidersResponse = {
  readonly mode: string;
  readonly captcha: { readonly provider: string; readonly siteKey: string | null; readonly afterFailures: number };
};

/** A fresh address per probe: the account bucket only adds delay, the IP bucket counts. */
function probeEmail(index: number): string {
  return `e2e.captcha-probe-${index}@example.com`;
}

test.describe('48 captcha / turnstile (5.4.1 M3)', () => {
  test('the challenge appears only when turnstile is configured, and provider none leaves sign-in as it was', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    page.setDefaultTimeout(20_000);
    const env = readE2EEnvironment();
    const api = new ApiClient();
    await api.login(env.superAdminEmail, env.superAdminPassword);

    const originalProvider = await readSetting(api, providerKey);
    const originalSiteKey = await readSetting(api, siteKeyKey);

    /** Raw password sign-in: returns the HTTP status and the error code. */
    const attempt = async (email: string): Promise<{ status: number; code: string | null }> => {
      const response = await fetch(`${env.apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'definitely-not-the-password' }),
      });
      const payload = (await response.json().catch(() => null)) as { code?: string } | null;
      return { status: response.status, code: payload?.code ?? null };
    };

    try {
      await test.step('provider none: a burst of failures never asks for a challenge', async () => {
        await setSetting(api, providerKey, 'none', 'E2E spec 48: baseline');
        const providers = await api.requestJson<ProvidersResponse>('/auth/providers');
        expect(providers.captcha.provider).toBe('none');
        expect(providers.captcha.siteKey).toBeNull();

        for (let index = 0; index < 6; index += 1) {
          const result = await attempt(probeEmail(index));
          expect(result.code).not.toBe('CAPTCHA_REQUIRED');
        }
      });

      await test.step('turnstile configured: the same burst ends in CAPTCHA_REQUIRED', async () => {
        await setSetting(api, providerKey, 'turnstile', 'E2E spec 48: turn the human check on');
        await setSetting(api, siteKeyKey, testSiteKey, 'E2E spec 48: public site key');
        const providers = await api.requestJson<ProvidersResponse>('/auth/providers');
        expect(providers.captcha.provider).toBe('turnstile');
        expect(providers.captcha.siteKey).toBe(testSiteKey);

        // Six failures already sit in the IP bucket from the step above (plus
        // whatever earlier specs produced), so the first attempt should be the
        // one the server refuses with `CAPTCHA_REQUIRED`; the loop only covers
        // a bucket that expired meanwhile.
        let sawRequired = false;
        for (let index = 10; index < 14 && !sawRequired; index += 1) {
          const result = await attempt(probeEmail(index));
          if (result.code === 'CAPTCHA_REQUIRED') {
            expect(result.status).toBe(400);
            sawRequired = true;
          }
        }
        expect(sawRequired, 'the server must ask for a solved challenge after repeated failures').toBe(true);
      });

      await test.step('the sign-in form shows the challenge after the server asked for it', async () => {
        await page.goto('/login');
        const form = page.locator('form').filter({ has: page.locator('#login-email') });
        await form.locator('#login-email').fill(probeEmail(30));
        await form.locator('#login-password').fill('definitely-not-the-password');
        await form.locator('button[type="submit"]').click();
        // The block is rendered by the page itself, so it is visible even when
        // Cloudflare's script cannot load on this runner.
        await expect(page.getByTestId('turnstile-widget')).toBeVisible();
        await expect(page.getByText(/provjera da niste robot|human verification/i)).toBeVisible();
      });
    } finally {
      await setSetting(api, providerKey, originalProvider ?? 'none', 'E2E spec 48: restore the provider');
      if (originalSiteKey !== null && originalSiteKey !== '') {
        await setSetting(api, siteKeyKey, originalSiteKey, 'E2E spec 48: restore the site key');
      } else {
        await setSetting(api, siteKeyKey, '', 'E2E spec 48: clear the site key');
      }
    }
  });
});
