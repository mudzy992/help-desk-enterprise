import { settingKeys } from '../settings/setting-keys';
import { SettingsError } from '../settings/settings.error';
import {
  getSettingDefaultValue,
  validateSettingValue,
} from '../settings/settings-value';
import type { SettingsRegistry } from '../settings/settings.types';
import type {
  ConfigSnapshot,
  ConfigValidationIssue,
} from './config-versioning.types';

export function validateSettingsSnapshot(
  snapshot: ConfigSnapshot,
  registry: SettingsRegistry,
): readonly ConfigValidationIssue[] {
  const issues: ConfigValidationIssue[] = [];
  for (const definition of registry.definitions) {
    if (definition.visibility === 'secret') {
      continue;
    }
    const stored = snapshot.settings[definition.key];
    const value =
      stored === undefined ? getSettingDefaultValue(definition) : stored;
    if (value === undefined) {
      if (definition.isRequired) {
        issues.push(
          issue('SETTING_REQUIRED', `settings.${definition.key}`),
        );
      }
      continue;
    }
    try {
      validateSettingValue(definition, value);
    } catch (error) {
      const code =
        error instanceof SettingsError ? 'SETTING_INVALID' : 'SETTING_INVALID';
      issues.push(issue(code, `settings.${definition.key}`));
    }
  }
  const smtpEnabled =
    snapshot.settings[settingKeys.privateSmtpEnabled] === true;
  if (smtpEnabled) {
    if (!hasText(snapshot.settings[settingKeys.privateSmtpHost])) {
      issues.push(issue('SMTP_HOST_REQUIRED', `settings.${settingKeys.privateSmtpHost}`));
    }
    if (!hasText(snapshot.settings[settingKeys.privateSmtpFromAddress])) {
      issues.push(
        issue(
          'SMTP_FROM_REQUIRED',
          `settings.${settingKeys.privateSmtpFromAddress}`,
        ),
      );
    }
  }
  if (
    snapshot.settings[settingKeys.privateAddonsEmail] === true &&
    smtpEnabled !== true
  ) {
    issues.push(
      issue(
        'EMAIL_ADDON_REQUIRES_SMTP',
        `settings.${settingKeys.privateAddonsEmail}`,
      ),
    );
  }
  return issues;
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function issue(code: string, path: string): ConfigValidationIssue {
  return { code, path, message: code };
}
