import { definePrivateSetting } from '../registry/define-setting';
import { settingCategoryIds } from '../setting-categories';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';

/**
 * Paket 5.4.0-d (M5): the Pwned Passwords check for locally set passwords.
 *
 * ON by default (owner decision, 2026-10-09). The check is k-anonymous (only a
 * five-character SHA-1 prefix leaves the server), cached per prefix for 24 h
 * and **fails open** on a timeout, a network error, a non-2xx answer or an
 * unusable response — an offline self-host must never be blocked from changing
 * a password. Only an explicit stored `false` turns the check off; an absent or
 * unreadable value counts as enabled, because the default is ON.
 */
export const securityHibpSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateSecurityHibpEnabled,
    categoryId: settingCategoryIds.privateSecurity,
    valueType: 'boolean',
    description:
      'Check every locally set password against the Pwned Passwords range API (k-anonymity, 24 h prefix cache, 3 s timeout, fail-open); only an explicit false turns it off',
    isRequired: true,
    defaultValue: true,
  }),
];
