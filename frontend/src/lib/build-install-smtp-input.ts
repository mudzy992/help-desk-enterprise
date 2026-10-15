import type { InstallSmtpRecord } from "@/services/install-smtp-api";

export type InstallSmtpFormValues = {
  readonly enabled: boolean;
  readonly host: string;
  readonly port: string;
  readonly tls: boolean;
  readonly username: string;
  readonly password: string;
  readonly fromAddress: string;
  readonly passwordAlreadyConfigured: boolean;
};

export type InstallSmtpInput = {
  readonly enabled: boolean;
  readonly host?: string;
  readonly port?: number;
  readonly tls?: boolean;
  readonly username?: string;
  readonly password?: string;
  readonly fromAddress?: string;
};

const fromAddressPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hostPattern = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,253}[A-Za-z0-9])?$/;

/**
 * F0.2/IN3: the form starts from the server's answer, never from defaults — the
 * step used to render `enabled: false` when the load failed and would then save
 * that over a working SMTP configuration.
 */
export function toInstallSmtpFormValues(record: InstallSmtpRecord): InstallSmtpFormValues {
  return {
    enabled: record.enabled,
    host: record.host,
    port: String(record.port),
    tls: record.tls,
    username: record.username,
    password: "",
    fromAddress: record.fromAddress,
    passwordAlreadyConfigured: record.passwordConfigured,
  };
}

export function isInstallSmtpFormReady(values: InstallSmtpFormValues): boolean {
  if (!values.enabled) {
    return true;
  }
  const port = Number(values.port);
  const hasPassword = values.password.trim().length > 0 || values.passwordAlreadyConfigured;
  return (
    hostPattern.test(values.host.trim()) &&
    Number.isInteger(port) &&
    port >= 1 &&
    port <= 65535 &&
    values.username.trim().length > 0 &&
    fromAddressPattern.test(values.fromAddress.trim()) &&
    hasPassword
  );
}

export function buildInstallSmtpInput(values: InstallSmtpFormValues): InstallSmtpInput {
  if (!values.enabled) {
    return { enabled: false };
  }
  return {
    enabled: true,
    host: values.host.trim(),
    port: Number(values.port),
    tls: values.tls,
    username: values.username.trim(),
    fromAddress: values.fromAddress.trim(),
    ...optionalField("password", values.password),
  };
}

function optionalField<K extends string>(key: K, value: string): Partial<Record<K, string>> {
  const normalized = value.trim();
  return normalized.length === 0 ? {} : ({ [key]: normalized } as Record<K, string>);
}
