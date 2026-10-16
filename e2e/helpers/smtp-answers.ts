/**
 * Values the install-wizard SMTP step needs. Blank env vars (GitHub Actions
 * injects `""` for a missing secret) must not defeat local defaults — `??`
 * alone does not treat `""` as missing, which left host/port empty in CI and
 * kept „Dalje“ disabled.
 */
export type InstallSmtpAnswers = {
  readonly host: string;
  readonly port: string;
  readonly username: string;
  readonly password: string;
  readonly from: string;
};

function readEnvOr(name: string, fallback: string): string {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

/** Local Mailpit defaults; override with E2E_SMTP_* for Gmail / CI. */
export function readInstallSmtpAnswers(): InstallSmtpAnswers {
  return {
    host: readEnvOr('E2E_SMTP_HOST', '127.0.0.1'),
    port: readEnvOr('E2E_SMTP_PORT', '25'),
    username: readEnvOr('E2E_SMTP_USERNAME', 'e2e'),
    password: readEnvOr('E2E_SMTP_PASSWORD', 'e2e-test-password'),
    from: readEnvOr('E2E_SMTP_FROM', 'helpdesk@example.com'),
  };
}
