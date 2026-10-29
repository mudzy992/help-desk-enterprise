import { readE2EEnvironment } from './environment';

type ProvidersAnswer = {
  readonly captcha?: { readonly provider?: string };
};

/**
 * Spec 48 / README: the suite signs in dozens of times from one IP. With
 * `private.security.captcha.provider = turnstile` every later login gets
 * `CAPTCHA_REQUIRED` and the run is meaningless. Fail before the first spec.
 */
export async function assertCaptchaOff(): Promise<void> {
  const { apiUrl } = readE2EEnvironment();
  const response = await fetch(`${apiUrl}/auth/providers`);
  const body = (await response.json()) as ProvidersAnswer;
  const provider = body.captcha?.provider ?? 'missing';
  if (provider !== 'none') {
    throw new Error(
      `[e2e] private.security.captcha.provider is "${provider}" — the suite requires "none". ` +
        'Admin → Sigurnost → Provjera da niste robot (CAPTCHA), or patch AppSetting + ACTIVE ' +
        'ConfigVersion snapshots (spec 09 rollback otherwise restores turnstile).',
    );
  }
}
