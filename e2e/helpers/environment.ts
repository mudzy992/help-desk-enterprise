export type E2EEnvironment = {
  readonly baseUrl: string;
  readonly apiUrl: string;
  readonly superAdminEmail: string;
  readonly superAdminPassword: string;
  readonly userEmail: string;
  readonly userPassword: string;
  readonly agentEmail: string;
  readonly agentPassword: string;
  readonly smtpHost: string;
  readonly smtpPort: string;
  readonly databaseUrl: string | null;
};

/**
 * Test-only defaults. The user and agent passwords must pass the local password
 * policy (`backend/src/modules/authentication/security/password-policy.ts`)
 * because `provisionTestActors` sets them through `POST /auth/change-password`,
 * which rejects a password that contains a part of the account's own e-mail
 * address or a configured organisation/domain word. An address-derived password
 * (for example `ChangeMeE2eUser1!` for `e2e.user@example.com`) is refused with
 * `CONTAINS_EMAIL_NAME`, so global setup would fail before a single spec runs.
 * The super admin password is created by the install wizard, which only checks
 * length and blankness, so its default stays as it is.
 */
export function readE2EEnvironment(): E2EEnvironment {
  return {
    baseUrl: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    apiUrl: process.env.E2E_API_URL ?? 'http://localhost:10001',
    superAdminEmail:
      process.env.E2E_SUPERADMIN_EMAIL ?? 'e2e.superadmin@example.com',
    superAdminPassword:
      process.env.E2E_SUPERADMIN_PASSWORD ?? 'ChangeMeE2eSuperAdmin1!',
    userEmail: process.env.E2E_USER_EMAIL ?? 'e2e.user@example.com',
    userPassword: process.env.E2E_USER_PASSWORD ?? 'Kamen-Opseg-2026-U1!',
    agentEmail: process.env.E2E_AGENT_EMAIL ?? 'e2e.agent@example.com',
    agentPassword: process.env.E2E_AGENT_PASSWORD ?? 'Kamen-Opseg-2026-A1!',
    smtpHost: process.env.E2E_SMTP_HOST ?? '127.0.0.1',
    smtpPort: process.env.E2E_SMTP_PORT ?? '25',
    databaseUrl: process.env.DATABASE_URL ?? null,
  };
}
