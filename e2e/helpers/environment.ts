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

export function readE2EEnvironment(): E2EEnvironment {
  return {
    baseUrl: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    apiUrl: process.env.E2E_API_URL ?? 'http://localhost:10001',
    superAdminEmail:
      process.env.E2E_SUPERADMIN_EMAIL ?? 'e2e.superadmin@epbih.ba',
    superAdminPassword:
      process.env.E2E_SUPERADMIN_PASSWORD ?? 'ChangeMeE2eSuperAdmin1!',
    userEmail: process.env.E2E_USER_EMAIL ?? 'e2e.user@epbih.ba',
    userPassword: process.env.E2E_USER_PASSWORD ?? 'ChangeMeE2eUser1!',
    agentEmail: process.env.E2E_AGENT_EMAIL ?? 'e2e.agent@epbih.ba',
    agentPassword: process.env.E2E_AGENT_PASSWORD ?? 'ChangeMeE2eAgent1!',
    smtpHost: process.env.E2E_SMTP_HOST ?? '127.0.0.1',
    smtpPort: process.env.E2E_SMTP_PORT ?? '25',
    databaseUrl: process.env.DATABASE_URL ?? null,
  };
}
