import { readE2EEnvironment } from './environment';
import { assertDisposableTestAccount } from './disposable-account';
import { readMfaSecret } from './mfa';
import {
  databaseHost,
  describeError,
  planUnreachableDatabase,
} from './database-diagnostic';

/**
 * Paket 2.1: with database access the harness clears the test super admin's
 * MFA so the next login re-enrols it and stores a fresh secret. Without it,
 * a stored secret or `E2E_SUPERADMIN_TOTP_SECRET` must already exist.
 *
 * Val 5 (2026-10-05): a database that is configured but unreachable (internal
 * Coolify hostname, firewall) used to fail with the bare `getaddrinfo …` line
 * from `pg`. It is now reported as an actionable message, and the run continues
 * when a TOTP secret is known (see `database-diagnostic.ts`).
 */
export async function resetSuperAdminMfa(): Promise<void> {
  const env = readE2EEnvironment();
  const totpSecretKnown = readMfaSecret(env.superAdminEmail) !== null;
  if (env.databaseUrl === null) {
    if (!totpSecretKnown) {
      console.warn(
        '[e2e] DATABASE_URL missing and no TOTP secret known — super admin sign-in may fail',
      );
    }
    return;
  }
  assertDisposableTestAccount(env.superAdminEmail, 'delete the MFA');
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: env.databaseUrl });
  try {
    await client.connect();
  } catch (error) {
    const plan = planUnreachableDatabase({
      host: databaseHost(env.databaseUrl),
      error,
      totpSecretKnown,
    });
    if (plan.continueAnyway) {
      console.warn(plan.message);
      return;
    }
    throw new Error(
      `${plan.message}\n  The connection string itself is fine — only the host must be reachable.`,
      { cause: error },
    );
  }
  try {
    await client.query(
      `DELETE FROM "UserMfaRecoveryCode" WHERE "userId" IN (SELECT id FROM "User" WHERE email = $1)`,
      [env.superAdminEmail.toLowerCase()],
    );
    await client.query(`DELETE FROM "UserMfa" WHERE "userId" IN (SELECT id FROM "User" WHERE email = $1)`, [
      env.superAdminEmail.toLowerCase(),
    ]);
  } catch (error) {
    throw new Error(
      `[e2e] MFA reset failed on "${databaseHost(env.databaseUrl) ?? 'DATABASE_URL'}": ${describeError(error)}`,
      { cause: error },
    );
  } finally {
    await client.end();
  }
}
