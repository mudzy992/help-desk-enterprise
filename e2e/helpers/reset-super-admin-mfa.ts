import { readE2EEnvironment } from './environment';
import { readMfaSecret } from './mfa';

/**
 * Paket 2.1: with database access the harness clears the test super admin's
 * MFA so the next login re-enrols it and stores a fresh secret. Without it,
 * a stored secret or `E2E_SUPERADMIN_TOTP_SECRET` must already exist.
 */
export async function resetSuperAdminMfa(): Promise<void> {
  const env = readE2EEnvironment();
  if (env.databaseUrl === null) {
    if (readMfaSecret(env.superAdminEmail) === null) {
      console.warn('[e2e] DATABASE_URL missing and no TOTP secret known — super admin sign-in may fail');
    }
    return;
  }
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: env.databaseUrl });
  await client.connect();
  try {
    await client.query(
      `DELETE FROM "UserMfaRecoveryCode" WHERE "userId" IN (SELECT id FROM "User" WHERE email = $1)`,
      [env.superAdminEmail.toLowerCase()],
    );
    await client.query(`DELETE FROM "UserMfa" WHERE "userId" IN (SELECT id FROM "User" WHERE email = $1)`, [
      env.superAdminEmail.toLowerCase(),
    ]);
  } finally {
    await client.end();
  }
}
