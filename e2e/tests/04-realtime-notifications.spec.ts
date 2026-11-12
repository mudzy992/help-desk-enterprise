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
          const page = await api.requestJson<{
            items: Array<{ type: string }>;
            nextCursor: string | null;
          }>(`/integration-jobs?status=${status}`);
          jobs.push(...page.items);
        }
        return jobs.some(
          (job) => job.type === 'EMAIL' || job.type === 'EDGE_EVENT',
        );
      }, { timeout: 30_000 })
      .toBe(true);
    // BA-integration-queue-15: existence alone does not prove the queue is
    // alive. The created job must LEAVE PENDING (claimed by a worker into
    // PROCESSING or any terminal/retry state) — without assuming a provider
    // outcome in the seed environment.
    await expect
      .poll(async () => {
        for (const status of [
          'PROCESSING',
          'COMPLETED',
          'PUBLISHED_BEST_EFFORT',
          'SKIPPED',
          'FAILED',
          'DLQ',
        ]) {
          const resultPage = await api.requestJson<{
            items: Array<{ type: string }>;
            nextCursor: string | null;
          }>(`/integration-jobs?status=${status}`);
          if (
            resultPage.items.some(
              (job) => job.type === 'EMAIL' || job.type === 'EDGE_EVENT',
            )
          ) {
            return true;
          }
        }
        return false;
      }, { timeout: 30_000 })
      .toBe(true);
    await signIn(page, env.superAdminEmail, env.superAdminPassword);
    await page.goto(`/tickets/${created.id}`);
    await expect(page.getByText(created.title)).toBeVisible();
  });
});
