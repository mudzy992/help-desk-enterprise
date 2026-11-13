import { ApiClient } from './helpers/api-client';
import { readE2EEnvironment } from './helpers/environment';
import { restoreFormsSetting } from './helpers/forms-setting-recovery';
import { existsSync } from 'node:fs';

export default async function globalTeardown(): Promise<void> {
  const path = process.env.E2E_FORMS_RECOVERY_JOURNAL;
  if (!path || !existsSync(path)) return;
  const env = readE2EEnvironment();
  const api = new ApiClient();
  await api.login(env.superAdminEmail, env.superAdminPassword);
  await restoreFormsSetting(api);
}
