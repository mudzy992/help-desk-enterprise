import { installSmtpConstants } from './install-smtp.constants';
import type { InstallSmtpEnvPrefill } from './install-smtp.types';
import { readOptionalInstallString } from './read-optional-install-string';

function readOptionalBooleanFlag(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }
  return undefined;
}

function readOptionalPort(value: string | undefined): number | undefined {
  const normalized = readOptionalInstallString(value);
  if (normalized === undefined) {
    return undefined;
  }
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed)) {
    return undefined;
  }
  if (
    parsed < installSmtpConstants.minimumPort ||
    parsed > installSmtpConstants.maximumPort
  ) {
    return undefined;
  }
  return parsed;
}

export function readInstallSmtpEnvPrefill(
  env: NodeJS.Dict<string> = process.env,
): InstallSmtpEnvPrefill {
  return {
    host: readOptionalInstallString(env.SMTP_HOST),
    port: readOptionalPort(env.SMTP_PORT),
    tls: readOptionalBooleanFlag(env.SMTP_TLS),
    username: readOptionalInstallString(env.SMTP_USER),
    password: readOptionalInstallString(env.SMTP_PASSWORD),
    fromAddress: readOptionalInstallString(env.SMTP_FROM),
  };
}
