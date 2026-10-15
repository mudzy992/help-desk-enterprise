import type { SettingValue } from '../../settings/settings.types';
import { settingKeys } from '../../settings/setting-keys';

/**
 * Install wizard v2 (F5) + owner decision 7: „Primijeni preporuke za
 * produkciju“. One declarative table, so the panel, the apply action and the
 * tests read the same list — and so the wizard never writes a key
 * `private.auth.mfa.*`-style by accident.
 *
 * `recommendedValue: null` means the **wizard never writes this key**; the panel
 * only states what is still missing (the captcha needs Turnstile keys the
 * operator has to create at Cloudflare first — owner decision 7).
 */
export type InstallSecurityRecommendation = {
  readonly key: string;
  readonly recommendedValue: SettingValue | null;
  /** i18n keys of the title and the „why“ sentence in the panel. */
  readonly titleKey: string;
  readonly helpKey: string;
};

export const installSecurityRecommendations: readonly InstallSecurityRecommendation[] = [
  {
    key: settingKeys.privateAuthMfaRequiredForAdmins,
    recommendedValue: true,
    titleKey: 'install.security.recommendations.mfaAdmins.title',
    helpKey: 'install.security.recommendations.mfaAdmins.help',
  },
  {
    key: settingKeys.privateAuthMfaAllowOptional,
    recommendedValue: true,
    titleKey: 'install.security.recommendations.mfaOptional.title',
    helpKey: 'install.security.recommendations.mfaOptional.help',
  },
  {
    key: settingKeys.privateSecurityHibpEnabled,
    recommendedValue: true,
    titleKey: 'install.security.recommendations.hibp.title',
    helpKey: 'install.security.recommendations.hibp.help',
  },
  {
    // Owner decision 7: 1800 s is the recommended idle window. The value is
    // inside the range `SessionIdleTimeoutLoader.validate` accepts (0 or
    // 300–2592000) — a spec pins that down, so a future change to the loader
    // cannot silently turn this recommendation into a rejected save.
    key: settingKeys.privateSecuritySessionIdleTimeoutSeconds,
    recommendedValue: 1800,
    titleKey: 'install.security.recommendations.idleTimeout.title',
    helpKey: 'install.security.recommendations.idleTimeout.help',
  },
  {
    // Not applied by the wizard: switching captcha on without Turnstile keys
    // would lock everybody out of the sign-in page.
    key: settingKeys.privateSecurityCaptchaProvider,
    recommendedValue: null,
    titleKey: 'install.security.recommendations.captcha.title',
    helpKey: 'install.security.recommendations.captcha.help',
  },
];

/** Keys „Primijeni preporuke“ actually writes. */
export const installSecurityRecommendationWrites = installSecurityRecommendations
  .filter((entry) => entry.recommendedValue !== null)
  .map((entry) => ({
    key: entry.key,
    value: entry.recommendedValue as SettingValue,
  }));
