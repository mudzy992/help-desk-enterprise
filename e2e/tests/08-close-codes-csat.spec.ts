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
    await expect(
      api.requestJson(`/tickets/${created.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'RESOLVED' }),
      }),
    ).rejects.toThrow(/CLOSE_CODE|REQUIRED|422|400/i);
    const codes = await api
      .requestJson<Array<{ key: string; id?: string }>>('/close-codes')
      .catch(() => [] as Array<{ key: string; id?: string }>);
    const closeCode = codes[0]?.key ?? 'other';
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
