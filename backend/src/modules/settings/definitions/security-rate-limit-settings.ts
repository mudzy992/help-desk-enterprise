import { definePrivateSetting } from '../registry/define-setting';
import { SettingsError } from '../settings.error';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition, SettingValue } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';
import {
  defaultSecurityRateLimitConfig as d,
  securityRateLimitBounds as b,
} from '../../authentication/security/security-rate-limit-config';

/**
 * Paket 5.4.0-b (M2): the login rate limits, admin-tunable inside bounds that
 * keep the protection intact. Defaults equal the pre-5.4 hard-coded values,
 * so deployments that never touch these keys behave exactly as before. The
 * loader re-validates against the same bounds, so a stray value cannot weaken
 * sign-in protection even if it reached the store another way.
 */

function integerInRange(label: string, range: { min: number; max: number }) {
  return (value: SettingValue): void => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < range.min || value > range.max) {
      throw new SettingsError(`${label} must be an integer between ${range.min} and ${range.max}`);
    }
  };
}

const category = settingCategoryIds.privateSecurity;

export const securityRateLimitSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateSecurityRateLimitsAccountWindowSeconds,
    categoryId: category,
    valueType: 'number',
    description: 'Password sign-in: how long an account failure bucket lives, in seconds (60-86400)',
    isRequired: true,
    defaultValue: d.accountWindowSeconds,
    assertValue: integerInRange('accountWindowSeconds', b.accountWindowSeconds),
  }),
  definePrivateSetting({
    key: settingKeys.privateSecurityRateLimitsAccountDelayStartsAfterFailures,
    categoryId: category,
    valueType: 'number',
    description: 'Password sign-in: failed attempts before attempts start feeling a progressive delay (1-20)',
    isRequired: true,
    defaultValue: d.accountDelayStartsAfterFailures,
    assertValue: integerInRange('accountDelayStartsAfterFailures', b.accountDelayStartsAfterFailures),
  }),
  definePrivateSetting({
    key: settingKeys.privateSecurityRateLimitsAccountDelayBaseMilliseconds,
    categoryId: category,
    valueType: 'number',
    description: 'Password sign-in: the first delayed attempt waits this long, then the delay doubles (0-5000 ms)',
    isRequired: true,
    defaultValue: d.accountDelayBaseMilliseconds,
    assertValue: integerInRange('accountDelayBaseMilliseconds', b.accountDelayBaseMilliseconds),
  }),
  definePrivateSetting({
    key: settingKeys.privateSecurityRateLimitsAccountDelayMaxMilliseconds,
    categoryId: category,
    valueType: 'number',
    description: 'Password sign-in: upper bound of the progressive account delay in milliseconds (0-10000)',
    isRequired: true,
    defaultValue: d.accountDelayMaxMilliseconds,
    assertValue: integerInRange('accountDelayMaxMilliseconds', b.accountDelayMaxMilliseconds),
  }),
  definePrivateSetting({
    key: settingKeys.privateSecurityRateLimitsIpMaxFailures,
    categoryId: category,
    valueType: 'number',
    description: 'Password sign-in: failed attempts from one IP before it receives a temporary 429 (10-500)',
    isRequired: true,
    defaultValue: d.ipMaxFailures,
    assertValue: integerInRange('ipMaxFailures', b.ipMaxFailures),
  }),
  definePrivateSetting({
    key: settingKeys.privateSecurityRateLimitsIpWindowSeconds,
    categoryId: category,
    valueType: 'number',
    description: 'Password sign-in: how long the IP 429 bucket lives, in seconds (10-3600)',
    isRequired: true,
    defaultValue: d.ipWindowSeconds,
    assertValue: integerInRange('ipWindowSeconds', b.ipWindowSeconds),
  }),
  definePrivateSetting({
    key: settingKeys.privateSecurityRateLimitsOtherMaxFailures,
    categoryId: category,
    valueType: 'number',
    description: 'Entra sign-in, password change and MFA confirmations: failures before a temporary 429 (3-100)',
    isRequired: true,
    defaultValue: d.otherMaxFailures,
    assertValue: integerInRange('otherMaxFailures', b.otherMaxFailures),
  }),
  definePrivateSetting({
    key: settingKeys.privateSecurityRateLimitsOtherWindowSeconds,
    categoryId: category,
    valueType: 'number',
    description: 'Window of the Entra / password-change / MFA failure bucket, in seconds (10-86400)',
    isRequired: true,
    defaultValue: d.otherWindowSeconds,
    assertValue: integerInRange('otherWindowSeconds', b.otherWindowSeconds),
  }),
];
