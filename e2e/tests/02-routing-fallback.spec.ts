import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { createTicketViaApi, loadSeedCatalog } from '../helpers/create-ticket';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

test.describe('02 routing / fallback', () => {
  test('seed service routes to a group; unrouted service stays UNROUTED', async ({
    page,
  }) => {
    const env = readE2EEnvironment();
    const api = new ApiClient();
    await api.login(env.superAdminEmail, env.superAdminPassword);
    const catalog = await loadSeedCatalog(api);
    const routed = await createTicketViaApi(api, {
      title: `E2E routed ${Date.now()}`,
      serviceId: catalog.serviceId,
      originUnitId: catalog.originUnitId,
      formVersionRef: catalog.formVersionRef,
    });
    expect(routed.status === 'UNROUTED' || routed.assignedGroupId !== null).toBe(
      true,
    );
    const service = await api.requestJson<{ id: string }>('/services', {
      method: 'POST',
      body: JSON.stringify({
        name: `E2E Unrouted ${Date.now()}`,
        slug: `e2e-unrouted-${Date.now()}`,
        classification: 'INTERNAL',
        changeReason: 'e2e-routing-fallback',
      }),
    });
    const unrouted = await createTicketViaApi(api, {
      title: `E2E unrouted ${Date.now()}`,
      serviceId: service.id,
      originUnitId: catalog.originUnitId,
    });
    expect(unrouted.status).toBe('UNROUTED');
    expect(unrouted.assignedGroupId).toBeNull();
    await signIn(page, env.superAdminEmail, env.superAdminPassword);
    await page.goto('/tickets?view=inbox');
    await expect(page.getByText(routed.title)).toBeVisible({ timeout: 20_000 });
  });
});
