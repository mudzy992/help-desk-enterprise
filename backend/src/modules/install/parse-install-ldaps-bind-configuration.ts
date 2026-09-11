import {
  installLoginProviderConstants,
  installLoginProviderErrorCodes,
} from './install-login-provider.constants';
import { InstallLoginProviderError } from './install-login-provider.error';
import type { InstallLdapsBindConfigurationFields } from './install-login-provider.types';
import { readOptionalInstallString } from './read-optional-install-string';

export function parseInstallLdapsBindConfiguration(input: {
  readonly urlsCsv: unknown;
  readonly bindDn: unknown;
  readonly bindPassword: unknown;
}): InstallLdapsBindConfigurationFields | null {
  const urlsCsv = readOptionalInstallString(input.urlsCsv);
  const bindDn = readOptionalInstallString(input.bindDn);
  const bindPassword = readOptionalInstallString(input.bindPassword);
  const providedCount = [urlsCsv, bindDn, bindPassword].filter(
    (value) => value !== undefined,
  ).length;
  if (providedCount === 0) {
    return null;
  }
  if (
    urlsCsv === undefined ||
    bindDn === undefined ||
    bindPassword === undefined
  ) {
    throw new InstallLoginProviderError(
      installLoginProviderErrorCodes.invalidConfiguration,
    );
  }
  const normalizedUrls = normalizeLdapsUrlsCsv(urlsCsv);
  if (
    bindDn.length > installLoginProviderConstants.maximumBindDnLength ||
    bindPassword.length >
      installLoginProviderConstants.maximumBindPasswordLength
  ) {
    throw new InstallLoginProviderError(
      installLoginProviderErrorCodes.invalidConfiguration,
    );
  }
  return { urlsCsv: normalizedUrls, bindDn, bindPassword };
}

function normalizeLdapsUrlsCsv(value: string): string {
  const urls = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (
    urls.length === 0 ||
    urls.some(
      (url) => !installLoginProviderConstants.ldapsUrlPattern.test(url),
    ) ||
    value.length > installLoginProviderConstants.maximumLdapsUrlsCsvLength
  ) {
    throw new InstallLoginProviderError(
      installLoginProviderErrorCodes.invalidConfiguration,
    );
  }
  return urls.join(',');
}
