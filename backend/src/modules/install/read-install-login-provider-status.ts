import { parseAuthenticationMode } from '../authentication/parse-authentication-mode';
import { settingKeys } from '../settings/setting-keys';
import type { SettingsService } from '../settings/settings.service';
import { installLoginProviderErrorCodes } from './install-login-provider.constants';
import { InstallLoginProviderError } from './install-login-provider.error';
import type {
  InstallLoginProviderPublicRecord,
  StoredInstallLoginProviderSecrets,
} from './install-login-provider.types';
import {
  isConfiguredInstallSecret,
  readOptionalInstallString,
} from './read-optional-install-string';

export async function readInstallLoginProviderStatus(
  settingsService: SettingsService,
): Promise<InstallLoginProviderPublicRecord> {
  const stored = await readStoredInstallLoginProviderSecrets(settingsService);
  return mapInstallLoginProviderPublicRecord(stored);
}

export async function readStoredInstallLoginProviderSecrets(
  settingsService: SettingsService,
): Promise<StoredInstallLoginProviderSecrets & { readonly mode: unknown }> {
  return {
    mode: await settingsService.getSetting(settingKeys.privateAuthMode),
    azureTenantId: await settingsService.getSecretForInternalUse(
      settingKeys.privateAuthAzureTenantId,
    ),
    azureClientId: await settingsService.getSecretForInternalUse(
      settingKeys.privateAuthAzureClientId,
    ),
    adLdapsUrlsCsv: await settingsService.getSetting(
      settingKeys.privateAuthAdLdapsUrlsCsv,
    ),
    adBindDn: await settingsService.getSecretForInternalUse(
      settingKeys.privateAuthAdBindDn,
    ),
    adBindPassword: await settingsService.getSecretForInternalUse(
      settingKeys.privateAuthAdBindPassword,
    ),
  };
}

export function mapInstallLoginProviderPublicRecord(stored: {
  readonly mode: unknown;
  readonly azureTenantId: unknown;
  readonly azureClientId: unknown;
  readonly adLdapsUrlsCsv: unknown;
  readonly adBindDn: unknown;
  readonly adBindPassword: unknown;
}): InstallLoginProviderPublicRecord {
  return {
    mode: parseStoredAuthenticationMode(stored.mode),
    entra: {
      tenantIdConfigured: isConfiguredInstallSecret(stored.azureTenantId),
      clientIdConfigured: isConfiguredInstallSecret(stored.azureClientId),
    },
    directoryBind: {
      urls: readOptionalInstallString(stored.adLdapsUrlsCsv) ?? '',
      bindDnConfigured: isConfiguredInstallSecret(stored.adBindDn),
      bindPasswordConfigured: isConfiguredInstallSecret(stored.adBindPassword),
    },
  };
}

function parseStoredAuthenticationMode(
  value: unknown,
): InstallLoginProviderPublicRecord['mode'] {
  try {
    return parseAuthenticationMode(value);
  } catch {
    throw new InstallLoginProviderError(
      installLoginProviderErrorCodes.invalidConfiguration,
    );
  }
}
