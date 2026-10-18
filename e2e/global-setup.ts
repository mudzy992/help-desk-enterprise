import dotenv from 'dotenv';
import path from 'node:path';
import { ApiClient } from './helpers/api-client';
import { ensureInstall } from './helpers/ensure-install';
import { readE2EEnvironment } from './helpers/environment';
import { loginWithRateLimitBackoff } from './helpers/login-with-backoff';
import { provisionTestActors } from './helpers/provision-test-actors';
import { resetSuperAdminMfa } from './helpers/reset-super-admin-mfa';
import {
  clearActiveAnnouncements,
  withdrawPublishedE2eAnnouncements,
} from './helpers/dismiss-announcements';
import { stopRunningTimer } from './helpers/time-tracking';
import { assertCaptchaOff } from './helpers/assert-captcha-off';
import { waitForStack } from './helpers/wait-for-stack';

dotenv.config({ path: path.resolve(__dirname, '.env') });

export default async function globalSetup(): Promise<void> {
  await waitForStack();
  await assertCaptchaOff();
  const api = new ApiClient();
  await ensureInstall(api);
  const env = readE2EEnvironment();
  // Paket 2.1: optional MFA reset; one super-admin login feeds provisioning and cleanup.
  await resetSuperAdminMfa();
  await loginWithRateLimitBackoff(api, env.superAdminEmail, env.superAdminPassword);
  await provisionTestActors(api);
  await prepareActorSessions(api);
}

/**
 * One API login per actor (TOTP replay budget). Super admin withdraws stray E2E
 * najave; every actor clears inbox modals and stops a leftover timer.
 */
async function prepareActorSessions(adminApi: ApiClient): Promise<void> {
  const env = readE2EEnvironment();
  const accounts = [
    { email: env.superAdminEmail, password: env.superAdminPassword, isSuperAdmin: true },
    { email: env.agentEmail, password: env.agentPassword, isSuperAdmin: false },
    { email: env.userEmail, password: env.userPassword, isSuperAdmin: false },
  ];
  for (const account of accounts) {
    const client = account.isSuperAdmin && adminApi.hasSession() ? adminApi : new ApiClient();
    try {
      if (!client.hasSession()) {
        await loginWithRateLimitBackoff(client, account.email, account.password);
      }
      if (account.isSuperAdmin) {
        await withdrawPublishedE2eAnnouncements(client);
      }
      await clearActiveAnnouncements(client);
      const stopped = await stopRunningTimer(client);
      if (stopped !== null) {
        console.warn(
          `[e2e] stopped a timer left on ${stopped.ticketNumber} by an earlier run (actor: ${account.email}).`,
        );
      }
    } catch (error) {
      console.warn(
        `[e2e] could not prepare session for ${account.email}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
