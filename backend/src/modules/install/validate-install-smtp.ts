import {
  installSmtpConstants,
  installSmtpErrorCodes,
} from './install-smtp.constants';
import { InstallSmtpError } from './install-smtp.error';
import type {
  InstallSmtpEnvPrefill,
  SaveInstallSmtpInput,
  StoredInstallSmtp,
  ValidatedInstallSmtp,
} from './install-smtp.types';
import { parseInstallSmtpConfiguration } from './parse-install-smtp-configuration';
import { readOptionalInstallString } from './read-optional-install-string';

export function validateInstallSmtp(
  input: SaveInstallSmtpInput,
  stored: StoredInstallSmtp,
  env: InstallSmtpEnvPrefill = {},
): ValidatedInstallSmtp {
  if (typeof input.enabled !== 'boolean') {
    throw new InstallSmtpError(installSmtpErrorCodes.invalidConfiguration);
  }
  if (input.enabled === false) {
    return { enabled: false };
  }
  const password = firstString(input.password, stored.password, env.password);
  return {
    enabled: true,
    persistPassword: readOptionalInstallString(input.password) !== undefined,
    configuration: parseInstallSmtpConfiguration({
      host: firstString(input.host, stored.host, env.host),
      port: firstPort(input.port, stored.port, env.port),
      tls: firstBoolean(input.tls, stored.tls, env.tls),
      username: firstString(input.username, stored.username, env.username),
      password,
      fromAddress: firstString(
        input.fromAddress,
        stored.fromAddress,
        env.fromAddress,
      ),
    }),
  };
}

function firstString(
  input: unknown,
  stored: unknown,
  env: unknown,
): unknown {
  return (
    readOptionalInstallString(input) ??
    readOptionalInstallString(stored) ??
    readOptionalInstallString(env)
  );
}

function firstBoolean(
  input: unknown,
  stored: unknown,
  env: unknown,
): boolean {
  if (typeof input === 'boolean') {
    return input;
  }
  if (typeof stored === 'boolean') {
    return stored;
  }
  if (typeof env === 'boolean') {
    return env;
  }
  return installSmtpConstants.defaultTls;
}

function firstPort(
  input: unknown,
  stored: unknown,
  env: unknown,
): number {
  const fromInput = parseOptionalPort(input);
  if (fromInput === 'invalid') {
    throw new InstallSmtpError(installSmtpErrorCodes.invalidConfiguration);
  }
  if (fromInput !== undefined) {
    return fromInput;
  }
  const fromStored = parseOptionalPort(stored);
  if (fromStored !== undefined && fromStored !== 'invalid') {
    return fromStored;
  }
  const fromEnv = parseOptionalPort(env);
  if (fromEnv !== undefined && fromEnv !== 'invalid') {
    return fromEnv;
  }
  return installSmtpConstants.defaultPort;
}

function parseOptionalPort(value: unknown): number | undefined | 'invalid' {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value : 'invalid';
  }
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    return Number.isInteger(parsed) ? parsed : 'invalid';
  }
  return 'invalid';
}
