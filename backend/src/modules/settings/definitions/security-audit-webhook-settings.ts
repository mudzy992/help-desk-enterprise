import { SettingsError } from '../settings.error';
import { settingCategoryIds } from '../setting-categories';
import { settingKeys } from '../setting-keys';
import { definePrivateSetting, defineSecretSetting } from '../registry/define-setting';
import type { SettingDefinition } from '../settings.types';

/** Longest URL the export accepts; a longer value is almost certainly a paste error. */
export const securityAuditWebhookUrlMaxLength = 2048;

/**
 * Paket 5.4.2 (stavka 3): push the `auth.*` and `security.*` audit rows to an
 * HTTP endpoint the operator runs (a SIEM collector, a log pipeline, a webhook
 * receiver). Internal network targets are allowed on purpose.
 *
 * Every request is signed with HMAC-SHA256 over `timestamp + "." + body` using
 * the secret below, so the receiver can prove the origin and reject replays.
 * The secret is a `secret` setting: it is read only by the worker, is never
 * returned by the API and is never logged. Export is off by default and only
 * covers rows written after it was switched on (no backfill).
 */
export const securityAuditWebhookSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateSecurityAuditWebhookEnabled,
    categoryId: settingCategoryIds.privateSecurity,
    valueType: 'boolean',
    description:
      'Sends auth and security audit events to the configured webhook; off keeps the events inside the application only',
    isRequired: true,
    defaultValue: false,
    requires: [
      { key: settingKeys.privateSecurityAuditWebhookUrl, notEmpty: true },
      { key: settingKeys.privateSecurityAuditWebhookSecret, isSet: true },
    ],
  }),
  definePrivateSetting({
    key: settingKeys.privateSecurityAuditWebhookUrl,
    categoryId: settingCategoryIds.privateSecurity,
    valueType: 'string',
    description: 'Endpoint that receives the signed batches (http or https, no user name or password in the URL)',
    isRequired: false,
    defaultValue: '',
    assertValue: (value) => {
      if (typeof value !== 'string') throw new SettingsError('Webhook URL must be text');
      if (value === '') return;
      if (value.length > securityAuditWebhookUrlMaxLength) {
        throw new SettingsError(`Webhook URL must be at most ${securityAuditWebhookUrlMaxLength} characters`);
      }
      let parsed: URL;
      try {
        parsed = new URL(value);
      } catch {
        throw new SettingsError('Webhook URL must be an absolute http or https address');
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new SettingsError('Webhook URL must use http or https');
      }
      if (parsed.username !== '' || parsed.password !== '') {
        throw new SettingsError('Webhook URL must not contain a user name or password');
      }
    },
  }),
  defineSecretSetting({
    key: settingKeys.privateSecurityAuditWebhookSecret,
    categoryId: settingCategoryIds.privateSecurity,
    valueType: 'string',
    description: 'HMAC-SHA256 signing secret for the webhook; the receiver uses it to verify each batch',
    isRequired: false,
    requires: [{ key: settingKeys.privateSecurityAuditWebhookUrl, notEmpty: true }],
  }),
];
