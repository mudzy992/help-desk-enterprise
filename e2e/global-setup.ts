import dotenv from 'dotenv';
import path from 'node:path';
import { ApiClient } from './helpers/api-client';
import { ensureInstall } from './helpers/ensure-install';
import { provisionTestActors } from './helpers/provision-test-actors';
import { resetSuperAdminMfa } from './helpers/reset-super-admin-mfa';
import { waitForStack } from './helpers/wait-for-stack';

dotenv.config({ path: path.resolve(__dirname, '.env') });

export default async function globalSetup(): Promise<void> {
  await waitForStack();
  const api = new ApiClient();
  await ensureInstall(api);
  // Paket 2.1: start every run from a known TOTP secret (re-enrolled at login).
  await resetSuperAdminMfa();
  await provisionTestActors(api);
}
