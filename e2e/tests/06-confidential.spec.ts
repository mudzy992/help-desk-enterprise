import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { createTicketViaApi, loadSeedCatalog } from '../helpers/create-ticket';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

/**
 * The requester (E2E USER) opens a confidential ticket; the E2E AGENT, who has no
 * ACL on it, is denied; the SuperAdmin gets in — via break-glass when that is the
 * only path, or directly when policy already grants access (then the API answers
 * BREAK_GLASS_NOT_APPLICABLE, which is correct, not a failure).
 */
test.describe('06 confidential', () => {
  test('agent without ACL is denied; SuperAdmin can open it (break-glass if needed)', async ({
    page,
  }) => {
    const env = readE2EEnvironment();
    const adminApi = new ApiClient();
    await adminApi.login(env.superAdminEmail, env.superAdminPassword);
    const catalog = await loadSeedCatalog(adminApi);
    const userApi = new ApiClient();
    await userApi.login(env.userEmail, env.userPassword);
    const created = await createTicketViaApi(userApi, {
      title: `E2E confidential ${Date.now()}`,
      description: 'secret body',
      serviceId: catalog.serviceId,
      originUnitId: catalog.originUnitId,
      formVersionRef: catalog.formVersionRef,
      isConfidential: true,
    });
    const agentApi = new ApiClient();
    await agentApi.login(env.agentEmail, env.agentPassword);
    await expect(agentApi.requestJson(`/tickets/${created.id}`)).rejects.toThrow(
      /CONFIDENTIAL|FORBIDDEN|NOT_FOUND|403|404/i,
    );
    try {
      await adminApi.requestJson(`/tickets/${created.id}/break-glass`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'E2E break-glass audit' }),
      });
    } catch (error) {
      expect(String(error)).toMatch(/BREAK_GLASS_NOT_APPLICABLE/);
    }
    const visible = await adminApi.requestJson<{ title: string }>(
      `/tickets/${created.id}`,
    );
    expect(visible.title).toBe(created.title);
    await signIn(page, env.superAdminEmail, env.superAdminPassword);
    await page.goto(`/tickets/${created.id}`);
    await expect(page.getByText(created.title).first()).toBeVisible();
  });
});
