import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { createTicketViaApi, loadSeedCatalog } from '../helpers/create-ticket';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

test.describe('04 realtime / queue', () => {
  test('create fan-out leaves EMAIL and/or EDGE_EVENT integration jobs', async ({
    page,
  }) => {
    const env = readE2EEnvironment();
    const api = new ApiClient();
    await api.login(env.superAdminEmail, env.superAdminPassword);
    const catalog = await loadSeedCatalog(api);
    const created = await createTicketViaApi(api, {
      title: `E2E queue ${Date.now()}`,
      serviceId: catalog.serviceId,
      originUnitId: catalog.originUnitId,
      formVersionRef: catalog.formVersionRef,
    });
    await expect
      .poll(async () => {
        const jobs: Array<{ type: string }> = [];
        for (const status of ['PENDING', 'PROCESSING', 'COMPLETED']) {
          jobs.push(
            ...(await api.requestJson<Array<{ type: string }>>(
              `/integration-jobs?status=${status}`,
            )),
          );
        }
        return jobs.some(
          (job) => job.type === 'EMAIL' || job.type === 'EDGE_EVENT',
        );
      }, { timeout: 30_000 })
      .toBe(true);
    await signIn(page, env.superAdminEmail, env.superAdminPassword);
    await page.goto(`/tickets/${created.id}`);
    await expect(page.getByText(created.title)).toBeVisible();
  });
});
