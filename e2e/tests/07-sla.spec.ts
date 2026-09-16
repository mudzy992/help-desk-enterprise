import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { createTicketViaApi, loadSeedCatalog } from '../helpers/create-ticket';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

test.describe('07 SLA', () => {
  test('ticket exposes SLA due fields after create', async ({ page }) => {
    test.setTimeout(90_000);
    const env = readE2EEnvironment();
    const api = new ApiClient();
    await api.login(env.superAdminEmail, env.superAdminPassword);
    const catalog = await loadSeedCatalog(api);
    const created = await createTicketViaApi(api, {
      title: `E2E sla ${Date.now()}`,
      serviceId: catalog.serviceId,
      originUnitId: catalog.originUnitId,
      formVersionRef: catalog.formVersionRef,
    });
    const detail = await api.requestJson<{
      sla?: { responseDueAt?: string | null; resolutionDueAt?: string | null };
      isOverdue?: boolean;
    }>(`/tickets/${created.id}`);
    expect(
      detail.sla?.responseDueAt != null ||
        detail.sla?.resolutionDueAt != null ||
        detail.isOverdue !== undefined,
    ).toBe(true);
    await signIn(page, env.superAdminEmail, env.superAdminPassword);
    await page.goto('/tickets');
    await expect(page.getByText(created.title).first()).toBeVisible({
      timeout: 20_000,
    });
  });
});
