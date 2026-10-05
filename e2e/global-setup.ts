import dotenv from 'dotenv';
import path from 'node:path';
import { ApiClient } from './helpers/api-client';
import { ensureInstall } from './helpers/ensure-install';
import { readE2EEnvironment } from './helpers/environment';
import { provisionTestActors } from './helpers/provision-test-actors';
import { resetSuperAdminMfa } from './helpers/reset-super-admin-mfa';
import { stopRunningTimer } from './helpers/time-tracking';
import { waitForStack } from './helpers/wait-for-stack';

dotenv.config({ path: path.resolve(__dirname, '.env') });

export default async function globalSetup(): Promise<void> {
  await waitForStack();
  const api = new ApiClient();
  await ensureInstall(api);
  // Paket 2.1: start every run from a known TOTP secret (re-enrolled at login).
  await resetSuperAdminMfa();
  await provisionTestActors(api);
  await clearStaleTimers();
}

/**
 * Run `37353690845` (2026-10-05): spec 14 failed only because a timer from the
 * previous run was still running — one timer per agent, so the spec's first
 * `time-start` opened the switch dialog and the header kept the old ticket
 * number. A running timer is state the suite must not inherit (`helpers/time-tracking.ts`),
 * so every run clears it for all three actors. A failure here is a warning, not
 * a stop: an actor whose timer cannot be read must not block the whole suite.
 */
async function clearStaleTimers(): Promise<void> {
  const env = readE2EEnvironment();
  const accounts = [
    { email: env.superAdminEmail, password: env.superAdminPassword },
    { email: env.agentEmail, password: env.agentPassword },
    { email: env.userEmail, password: env.userPassword },
  ];
  for (const account of accounts) {
    const client = new ApiClient();
    try {
      await client.login(account.email, account.password);
      const stopped = await stopRunningTimer(client);
      if (stopped !== null) {
        console.warn(
          `[e2e] stopped a timer left on ${stopped.ticketNumber} by an earlier run (actor: ${account.email}).`,
        );
      }
    } catch (error) {
      console.warn(
        `[e2e] could not clear a running timer for ${account.email}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
