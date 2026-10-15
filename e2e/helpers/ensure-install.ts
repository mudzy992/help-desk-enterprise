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
  // F3: the package step is the wizard's first question and it blocks, so the
  // API-only path picks a package before anything else (the smallest one — the
  // E2E suite turns on every add-on it needs explicitly).
  await api.requestJson('/install/profile', {
    method: 'POST',
    body: JSON.stringify({ profile: 'minimum' }),
  });
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
        // `sla` was removed from the catalog in val 5 (it never had a switch of
        // its own: SLA is turned on by the profile, not by an add-on), and the
        // endpoint rejects unknown keys with `unsupportedAddon`.
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
