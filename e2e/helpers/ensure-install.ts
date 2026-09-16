import { ApiClient } from './api-client';
import { readE2EEnvironment } from './environment';

type InstallStatus = {
  readonly isCompleted: boolean;
};

export async function ensureInstall(api: ApiClient): Promise<void> {
  const env = readE2EEnvironment();
  const status = await api.requestJson<InstallStatus>('/install/status');
  if (status.isCompleted) {
    return;
  }
  await api.requestJson('/install/super-admin', {
    method: 'POST',
    body: JSON.stringify({
      email: env.superAdminEmail,
      password: env.superAdminPassword,
      displayName: 'E2E SuperAdmin',
    }),
  });
  await api.requestJson('/install/login-provider', {
    method: 'POST',
    body: JSON.stringify({ mode: 'local' }),
  });
  await api.requestJson('/install/smtp', {
    method: 'POST',
    body: JSON.stringify({
      enabled: true,
      host: env.smtpHost,
      port: Number(env.smtpPort),
    }),
  });
  await api.requestJson('/install/seed', { method: 'POST' });
  await api.requestJson('/install/addons', {
    method: 'POST',
    body: JSON.stringify({
      addons: {
        sla: true,
        csat: true,
        approvals: true,
        confidential: true,
        kbIntercept: true,
        bulkActions: true,
        email: true,
        edge: true,
      },
    }),
  });
  await api.requestJson('/install/complete', { method: 'POST' });
}
