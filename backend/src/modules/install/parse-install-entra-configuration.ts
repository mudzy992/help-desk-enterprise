import { parseEntraAuthenticationConfiguration } from '../authentication/parse-entra-authentication-configuration';
import { InstallLoginProviderError } from './install-login-provider.error';
import { installLoginProviderErrorCodes } from './install-login-provider.constants';
import type { InstallEntraConfigurationFields } from './install-login-provider.types';
import { readOptionalInstallString } from './read-optional-install-string';

export function parseInstallEntraConfiguration(input: {
  readonly tenantId: unknown;
  readonly clientId: unknown;
}): InstallEntraConfigurationFields | null {
  const tenantId = readOptionalInstallString(input.tenantId);
  const clientId = readOptionalInstallString(input.clientId);
  if (tenantId === undefined && clientId === undefined) {
    return null;
  }
  if (tenantId === undefined || clientId === undefined) {
    throw new InstallLoginProviderError(
      installLoginProviderErrorCodes.invalidConfiguration,
    );
  }
  try {
    const parsed = parseEntraAuthenticationConfiguration({
      tenantId,
      clientId,
    });
    return { tenantId: parsed.tenantId, clientId: parsed.clientId };
  } catch {
    throw new InstallLoginProviderError(
      installLoginProviderErrorCodes.invalidConfiguration,
    );
  }
}
