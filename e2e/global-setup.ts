import dotenv from 'dotenv';
import path from 'node:path';
import { ApiClient } from './helpers/api-client';
import { ensureInstall } from './helpers/ensure-install';
import { provisionTestActors } from './helpers/provision-test-actors';
import { waitForStack } from './helpers/wait-for-stack';

dotenv.config({ path: path.resolve(__dirname, '.env') });

export default async function globalSetup(): Promise<void> {
  await waitForStack();
  const api = new ApiClient();
  await ensureInstall(api);
  await provisionTestActors(api);
}
