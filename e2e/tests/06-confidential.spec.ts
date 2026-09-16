import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { createTicketViaApi, loadSeedCatalog } from '../helpers/create-ticket';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

test.describe('06 confidential', () => {
  test('USER without ACL is denied; SuperAdmin break-glass succeeds', async ({
    page,
  }) => {
    const env = readE2EEnvironment();
    const adminApi = new ApiClient();
    await adminApi.login(env.superAdminEmail, env.superAdminPassword);
    const catalog = await loadSeedCatalog(adminApi);
    const created = await createTicketViaApi(adminApi, {
      title: `E2E confidential ${Date.now()}`,
      description: 'secret body',
      serviceId: catalog.serviceId,
      originUnitId: catalog.originUnitId,
      formVersionRef: catalog.formVersionRef,
      isConfidential: true,
    });
    const userApi = new ApiClient();
    await userApi.login(env.userEmail, env.userPassword);
    await expect(
      userApi.requestJson(`/tickets/${created.id}`),
    ).rejects.toThrow(/CONFIDENTIAL|FORBIDDEN|403/i);
    await adminApi.requestJson(`/tickets/${created.id}/break-glass`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'E2E break-glass audit' }),
    });
    const visible = await adminApi.requestJson<{ title: string }>(
      `/tickets/${created.id}`,
    );
    expect(visible.title).toBe(created.title);
    await signIn(page, env.superAdminEmail, env.superAdminPassword);
    await page.goto(`/tickets/${created.id}`);
    await expect(page.getByText(created.title)).toBeVisible();
  });
});
