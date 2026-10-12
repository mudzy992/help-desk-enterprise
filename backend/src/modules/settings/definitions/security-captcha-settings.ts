import { settingCategoryIds } from '../setting-categories';
import { settingKeys } from '../setting-keys';
import { definePrivateSetting, defineSecretSetting } from '../registry/define-setting';
import type { SettingDefinition } from '../settings.types';

/**
 * Paket 5.4.1 (M3): Cloudflare Turnstile in front of a password sign-in.
 *
 * The design in `docs/plans/modules/5.4-sigurnosni-hardening.md` (M3) pins this
 * as an extension point of the login rate limiter, not as a replacement for it:
 * the limiter keeps counting and delaying, and past `captchaAfterFailures` the
 * request additionally has to carry a solved challenge. **`none` is the
 * default**, so an installation that has no key pair — or no internet at all —
 * behaves exactly as it did before this package ("kad nije konfigurirano,
 * ponašanje je isto kao danas").
 *
 * The site key is public: Cloudflare embeds it in the page. The secret key is
 * stored as a `secret` setting, is read only through
 * `getSecretForInternalUse`, is never returned by `GET /auth/providers` and is
 * never logged.
 */
export const securityCaptchaSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateSecurityCaptchaProvider,
    categoryId: settingCategoryIds.privateSecurity,
    valueType: 'string',
    description:
      "Human check provider for password sign-in: 'none' keeps today's behaviour, 'turnstile' asks for a Cloudflare Turnstile challenge after repeated failures",
    isRequired: true,
    defaultValue: 'none',
    allowedValues: ['none', 'turnstile'],
    // Choosing `none` switches the check off: the site key and the secret are
    // dependents of `turnstile` and are offered for reset when that happens.
    inactiveValue: 'none',
  }),
  definePrivateSetting({
    key: settingKeys.privateSecurityCaptchaSiteKey,
    categoryId: settingCategoryIds.privateSecurity,
    valueType: 'string',
    description:
      'Public Turnstile site key the sign-in page renders (not a secret; empty while the provider is none)',
    isRequired: false,
    defaultValue: '',
    requires: [{ key: settingKeys.privateSecurityCaptchaProvider, equals: 'turnstile' }],
  }),
  defineSecretSetting({
    key: settingKeys.privateSecurityCaptchaSecretKey,
    categoryId: settingCategoryIds.privateSecurity,
    valueType: 'string',
    description:
      'Turnstile secret key used to verify the challenge server-side; never expose outside trusted backend use',
    isRequired: false,
    requires: [{ key: settingKeys.privateSecurityCaptchaProvider, equals: 'turnstile' }],
  }),
];
