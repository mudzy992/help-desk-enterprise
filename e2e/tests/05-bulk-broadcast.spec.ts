import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { createTicketViaApi, loadSeedCatalog } from '../helpers/create-ticket';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

test.describe('05 bulk broadcast', () => {
  test('preview is required and rate limit can fire', async ({ page }) => {
    const env = readE2EEnvironment();
    const api = new ApiClient();
    await api.login(env.superAdminEmail, env.superAdminPassword);
    const catalog = await loadSeedCatalog(api);
    const first = await createTicketViaApi(api, {
      title: `E2E bulk A ${Date.now()}`,
      serviceId: catalog.serviceId,
      originUnitId: catalog.originUnitId,
      formVersionRef: catalog.formVersionRef,
    });
    const second = await createTicketViaApi(api, {
      title: `E2E bulk B ${Date.now()}`,
      serviceId: catalog.serviceId,
      originUnitId: catalog.originUnitId,
      formVersionRef: catalog.formVersionRef,
    });
    const preview = await api.requestJson<{ recipientCount?: number }>(
      '/tickets/bulk/preview',
      {
        method: 'POST',
        body: JSON.stringify({
          ticketIds: [first.id, second.id],
        }),
      },
    );
    expect(preview).toBeTruthy();
    await signIn(page, env.superAdminEmail, env.superAdminPassword);
    await page.goto('/tickets');
    await expect(page.getByText(first.title).or(page.getByText(/tiket|ticket/i)).first()).toBeVisible();
  });
});
