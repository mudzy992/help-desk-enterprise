import {
  installSmtpConstants,
  installSmtpErrorCodes,
} from './install-smtp.constants';
import { InstallSmtpError } from './install-smtp.error';
import type { InstallSmtpConfigurationFields } from './install-smtp.types';
import { readOptionalInstallString } from './read-optional-install-string';

export function parseInstallSmtpConfiguration(input: {
  readonly host: unknown;
  readonly port: unknown;
  readonly tls: unknown;
  readonly username: unknown;
  readonly password: unknown;
  readonly fromAddress: unknown;
}): InstallSmtpConfigurationFields {
  return {
    host: parseHost(input.host),
    port: parsePort(input.port),
    tls: parseTls(input.tls),
    username: parseRequiredString(
      input.username,
      installSmtpConstants.maximumUsernameLength,
    ),
    password: parseRequiredString(
      input.password,
      installSmtpConstants.maximumPasswordLength,
    ),
    fromAddress: parseFromAddress(input.fromAddress),
  };
}

function parseHost(value: unknown): string {
  const host = parseRequiredString(value, installSmtpConstants.maximumHostLength);
  if (!installSmtpConstants.hostPattern.test(host)) {
    throw new InstallSmtpError(installSmtpErrorCodes.invalidConfiguration);
  }
  return host;
}

function parsePort(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new InstallSmtpError(installSmtpErrorCodes.invalidConfiguration);
  }
  if (
    value < installSmtpConstants.minimumPort ||
    value > installSmtpConstants.maximumPort
  ) {
    throw new InstallSmtpError(installSmtpErrorCodes.invalidConfiguration);
  }
  return value;
}

function parseTls(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new InstallSmtpError(installSmtpErrorCodes.invalidConfiguration);
  }
  return value;
}

function parseFromAddress(value: unknown): string {
  const fromAddress = parseRequiredString(
    value,
    installSmtpConstants.maximumFromAddressLength,
  );
  if (!installSmtpConstants.fromAddressPattern.test(fromAddress)) {
    throw new InstallSmtpError(installSmtpErrorCodes.invalidConfiguration);
  }
  return fromAddress;
}

function parseRequiredString(value: unknown, maximumLength: number): string {
  const normalized = readOptionalInstallString(value);
  if (normalized === undefined || normalized.length > maximumLength) {
    throw new InstallSmtpError(installSmtpErrorCodes.invalidConfiguration);
  }
  return normalized;
}
