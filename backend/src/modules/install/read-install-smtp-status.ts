import { readEmailAddonEnabled } from '../settings/read-email-addon-enabled';
import { settingKeys } from '../settings/setting-keys';
import type { SettingsService } from '../settings/settings.service';
import { installSmtpConstants } from './install-smtp.constants';
import type {
  InstallSmtpEnvPrefill,
  InstallSmtpPublicRecord,
  StoredInstallSmtp,
} from './install-smtp.types';
import {
  isConfiguredInstallSecret,
  readOptionalInstallString,
} from './read-optional-install-string';

export async function readInstallSmtpStatus(
  settingsService: SettingsService,
  env: InstallSmtpEnvPrefill = {},
): Promise<InstallSmtpPublicRecord> {
  const stored = await readStoredInstallSmtp(settingsService);
  const isConfigured = await settingsService.hasStoredValue(
    settingKeys.privateSmtpEnabled,
  );
  return {
    isConfigured,
    enabled: stored.enabled === true,
    host: publicString(stored.host, isConfigured ? undefined : env.host),
    port: publicPort(stored.port, isConfigured ? undefined : env.port),
    tls: publicBoolean(stored.tls, isConfigured ? undefined : env.tls),
    username: publicString(
      stored.username,
      isConfigured ? undefined : env.username,
    ),
    fromAddress: publicString(
      stored.fromAddress,
      isConfigured ? undefined : env.fromAddress,
    ),
    passwordConfigured:
      isConfiguredInstallSecret(stored.password) ||
      (!isConfigured && isConfiguredInstallSecret(env.password)),
    emailAddonEnabled: await readEmailAddonEnabled(settingsService),
  };
}

export async function readStoredInstallSmtp(
  settingsService: SettingsService,
): Promise<StoredInstallSmtp> {
  return {
    enabled: await settingsService.getSetting(settingKeys.privateSmtpEnabled),
    host: await settingsService.getSetting(settingKeys.privateSmtpHost),
    port: await settingsService.getSetting(settingKeys.privateSmtpPort),
    tls: await settingsService.getSetting(settingKeys.privateSmtpTls),
    username: await settingsService.getSetting(settingKeys.privateSmtpUsername),
    password: await settingsService.getSecretForInternalUse(
      settingKeys.privateSmtpPassword,
    ),
    fromAddress: await settingsService.getSetting(
      settingKeys.privateSmtpFromAddress,
    ),
    emailAddonEnabled: await settingsService.getSetting(
      settingKeys.privateAddonsEmail,
    ),
  };
}

function publicString(stored: unknown, env: unknown): string {
  return (
    readOptionalInstallString(stored) ?? readOptionalInstallString(env) ?? ''
  );
}

function publicPort(stored: unknown, env: unknown): number {
  if (typeof stored === 'number' && Number.isInteger(stored)) {
    return stored;
  }
  if (typeof env === 'number' && Number.isInteger(env)) {
    return env;
  }
  return installSmtpConstants.defaultPort;
}

function publicBoolean(stored: unknown, env: unknown): boolean {
  if (typeof stored === 'boolean') {
    return stored;
  }
  if (typeof env === 'boolean') {
    return env;
  }
  return installSmtpConstants.defaultTls;
}
