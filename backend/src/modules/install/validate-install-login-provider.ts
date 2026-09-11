import { parseAuthenticationMode } from '../authentication/parse-authentication-mode';
import { installLoginProviderErrorCodes } from './install-login-provider.constants';
import { InstallLoginProviderError } from './install-login-provider.error';
import type {
  SaveInstallLoginProviderInput,
  StoredInstallLoginProviderSecrets,
  ValidatedInstallLoginProvider,
} from './install-login-provider.types';
import { parseInstallEntraConfiguration } from './parse-install-entra-configuration';
import { parseInstallLdapsBindConfiguration } from './parse-install-ldaps-bind-configuration';

export function validateInstallLoginProvider(
  input: SaveInstallLoginProviderInput,
  stored: StoredInstallLoginProviderSecrets,
): ValidatedInstallLoginProvider {
  const mode = parseInstallAuthenticationMode(input.mode);
  if (mode === 'local') {
    return { mode };
  }
  const entra = parseInstallEntraConfiguration({
    tenantId: input.azureTenantId,
    clientId: input.azureClientId,
  });
  const directoryBind = parseInstallLdapsBindConfiguration({
    urlsCsv: input.adLdapsUrlsCsv,
    bindDn: input.adBindDn,
    bindPassword: input.adBindPassword,
  });
  if (entra !== null || directoryBind !== null) {
    return { mode, entra, directoryBind };
  }
  if (hasStoredEntraConfiguration(stored) || hasStoredLdapsConfiguration(stored)) {
    return { mode, entra: null, directoryBind: null };
  }
  throw new InstallLoginProviderError(
    installLoginProviderErrorCodes.invalidConfiguration,
  );
}

function parseInstallAuthenticationMode(
  value: SaveInstallLoginProviderInput['mode'],
): ValidatedInstallLoginProvider['mode'] {
  try {
    return parseAuthenticationMode(value);
  } catch {
    throw new InstallLoginProviderError(
      installLoginProviderErrorCodes.invalidConfiguration,
    );
  }
}

function hasStoredEntraConfiguration(
  stored: StoredInstallLoginProviderSecrets,
): boolean {
  return (
    parseStored(() =>
      parseInstallEntraConfiguration({
        tenantId: stored.azureTenantId,
        clientId: stored.azureClientId,
      }),
    ) !== null
  );
}

function hasStoredLdapsConfiguration(
  stored: StoredInstallLoginProviderSecrets,
): boolean {
  return (
    parseStored(() =>
      parseInstallLdapsBindConfiguration({
        urlsCsv: stored.adLdapsUrlsCsv,
        bindDn: stored.adBindDn,
        bindPassword: stored.adBindPassword,
      }),
    ) !== null
  );
}

function parseStored<T>(parse: () => T | null): T | null {
  try {
    return parse();
  } catch {
    return null;
  }
}
