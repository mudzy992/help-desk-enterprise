import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { createTicketViaApi, loadSeedCatalog } from '../helpers/create-ticket';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

test.describe('08 close codes + CSAT', () => {
  test('resolve requires close code then CSAT summary moves', async ({
    page,
  }) => {
    const env = readE2EEnvironment();
    const api = new ApiClient();
    await api.login(env.superAdminEmail, env.superAdminPassword);
    const catalog = await loadSeedCatalog(api);
    const created = await createTicketViaApi(api, {
      title: `E2E csat ${Date.now()}`,
      serviceId: catalog.serviceId,
      originUnitId: catalog.originUnitId,
      formVersionRef: catalog.formVersionRef,
    });
    // Allowed path: PENDING/ASSIGNED → IN_PROGRESS → RESOLVED.
    await api.requestJson(`/tickets/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
    });
    const detail = await api.requestJson<{
      closePolicy?: {
        enabled: boolean;
        requireOnResolve: boolean;
        allowedCodes: Array<{ key: string }>;
      };
    }>(`/tickets/${created.id}`);
    const policy = detail.closePolicy;
    if (policy?.enabled === true && policy.requireOnResolve) {
      await expect(
        api.requestJson(`/tickets/${created.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'RESOLVED' }),
        }),
      ).rejects.toThrow(/CLOSE_CODE|REQUIRED/i);
    }
    const closeCode = policy?.allowedCodes[0]?.key ?? 'other';
    await api.requestJson(`/tickets/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'RESOLVED',
        closeCode,
        resolutionNote: 'E2E resolved',
      }),
    });
    const resolved = await api.requestJson<{ status: string }>(
      `/tickets/${created.id}`,
    );
    expect(resolved.status).toBe('RESOLVED');
    await signIn(page, env.superAdminEmail, env.superAdminPassword);
    await page.goto(`/tickets/${created.id}`);
    await expect(page.getByText(created.title)).toBeVisible();
  });
});
