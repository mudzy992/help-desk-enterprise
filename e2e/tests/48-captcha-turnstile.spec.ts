import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { readSetting } from '../helpers/assets';
import { readE2EEnvironment } from '../helpers/environment';

/*
  Paket 5.4.1 (spec 48): the human check in front of a password sign-in.

  What the suite can prove about a **live, shared** stack without changing it:

    1. the installation ships the check **off** — the suite itself signs in dozens
       of times from one IP address, so a run is only meaningful while
       `private.security.captcha.provider` is `none`;
    2. the registry value and the public answer agree: `GET /auth/providers`
       carries the same provider, a site key exactly when the provider is
       `turnstile`, `afterFailures` pinned to five, and the secret nowhere in the
       answer (not even its name);
    3. the sign-in page shows no challenge while the check is off;
    4. the browser half of the gate really works: when the server answers
       `400 CAPTCHA_REQUIRED`, the page mounts the Turnstile widget and asks the
       visitor to solve it.

  Point 4 is checked with `page.route` — the technique spec 37 already uses — by
  answering *as if* the switch were on: the real `GET /auth/providers` answer with
  its `captcha` block replaced, and `POST /auth/login` answered with the 400 the
  server would send. The page, the widget and the mapping of the two error codes
  are the real ones; only the two answers are staged. The server side of the same
  contract (threshold of five, one attempt per solved challenge, fail-open when
  Cloudflare cannot be reached) is pinned by `login-captcha.service.spec.ts` and
  the limiter spec, and the real Cloudflare round trip is the owner's live check
  with real keys — a CI runner cannot solve a Turnstile challenge to begin with.

  **Why this spec does not flip the switch (run 38296071922, 2026-10-12).** The
  first version turned `turnstile` on for the length of this spec, against a live
  settings value every sign-in reads. Spec 47 ran in parallel, signed in with
  wrong passwords, received `400 CAPTCHA_REQUIRED` instead of `401` at its sixth
  failure and failed — the *code* was right (the provider was on), the spec was
  wrong: a test that changes what every other sign-in in the same run receives is
  a landmine, not a test. The same run then started an attempt with the check
  still on from the attempt before it and could not sign in at all. Hence: the
  switch belongs to the operator, and this file asserts the state it needs instead
  of creating it.
*/

const captchaProviderSetting = 'private.security.captcha.provider';
/** Cloudflare's documented "always passes" test site key — public by design. */
const testSiteKey = '1x00000000000000000000AA';
/** The server's own threshold (5.4.1 M3); the public answer repeats it. */
const captchaAfterFailures = 5;

type CaptchaBlock = {
  readonly provider: string;
  readonly siteKey: string | null;
  readonly afterFailures: number;
};
type ProvidersAnswer = { readonly captcha?: CaptchaBlock };

/** The public answer, read the way the login page reads it: without a session. */
async function readProviders(apiUrl: string) {
  const response = await fetch(`${apiUrl}/auth/providers`);
  const raw = await response.text();
  return { status: response.status, raw, body: JSON.parse(raw) as ProvidersAnswer };
}

test.describe('48 captcha / turnstile (5.4.1 M3)', () => {
  test('the check is off on this installation and the browser asks for a challenge when the server does', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    page.setDefaultTimeout(20_000);
    const env = readE2EEnvironment();

    await test.step('the installation ships the human check off', async () => {
      const answer = await readProviders(env.apiUrl);
      expect(answer.status).toBe(200);
      expect(answer.body.captcha, 'the server must describe the human check').toBeTruthy();
      // A run with the check on is not a valid run: every later sign-in from this
      // IP receives `400 CAPTCHA_REQUIRED` instead of its own answer (run
      // 38296071922 — spec 47 failed exactly like that). The way out is one
      // setting: Admin → Sigurnost → Sigurnosne postavke → „Provjera da niste
      // robot (CAPTCHA)“ → provider `none`.
      expect(
        answer.body.captcha?.provider,
        'the E2E suite requires private.security.captcha.provider = none — turn the human check off in Admin → Sigurnost, or run the suite on a stack that has it off',
      ).toBe('none');
      expect(answer.body.captcha?.siteKey).toBeNull();
      expect(answer.body.captcha?.afterFailures).toBe(captchaAfterFailures);
      // The secret key never leaves the process: not in the answer, not even the
      // name of the field.
      expect(answer.raw.toLowerCase()).not.toContain('secret');
    });

    await test.step('the registry value and the public answer agree', async () => {
      const admin = new ApiClient();
      await admin.login(env.superAdminEmail, env.superAdminPassword);
      const configured = await readSetting(admin, captchaProviderSetting);
      expect(configured).toBe('none');
      const providers = await admin.requestJson<ProvidersAnswer>('/auth/providers');
      expect(providers.captcha?.provider).toBe(configured);
      // No site key while the provider is off — the page must not load a
      // third-party script it has no challenge for.
      expect(providers.captcha?.siteKey).toBeNull();
    });

    await test.step('the sign-in page shows no challenge while the check is off', async () => {
      await page.goto('/login');
      await expect(page.locator('#login-email')).toBeVisible();
      await expect(page.getByTestId('turnstile-widget')).toHaveCount(0);
      await expect(page.getByText(/provjera da niste robot|human verification/i)).toHaveCount(0);
    });

    await test.step('a CAPTCHA_REQUIRED answer from the server mounts the widget on the page', async () => {
      // Staged answers, real page: the providers block is replaced on top of the
      // live answer (so every other field stays what the installation sends), and
      // the sign-in is answered with exactly what the server sends once the IP has
      // failed five times — nothing about this installation changes, which is the
      // point (see the header).
      await page.route('**/auth/providers', async (route) => {
        const response = await route.fetch();
        const body = (await response.json()) as Record<string, unknown>;
        await route.fulfill({
          response,
          json: {
            ...body,
            captcha: { provider: 'turnstile', siteKey: testSiteKey, afterFailures: captchaAfterFailures },
          },
        });
      });
      await page.route('**/auth/login', async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'CAPTCHA_REQUIRED',
            message: 'Human verification required',
            details: {},
            requestId: 'e2e-spec-48',
          }),
        });
      });

      await page.goto('/login');
      const form = page.locator('form').filter({ has: page.locator('#login-email') });
      await form.locator('#login-email').fill('e2e.captcha-probe@example.com');
      await form.locator('#login-password').fill('definitely-not-the-password');
      await form.locator('button[type="submit"]').click();

      // The heading and the mount point are ours, so they render whether or not
      // Cloudflare's script loads on this runner (the container itself stays empty
      // when it cannot — an empty box is attached, not visible).
      await expect(page.getByText(/provjera da niste robot|human verification/i)).toBeVisible();
      await expect(page.getByTestId('turnstile-widget')).toHaveCount(1);
    });
  });
});
