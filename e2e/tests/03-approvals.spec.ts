import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import {
  createTicketViaApi,
  createOfferedService,
  loadSeedCatalog,
} from '../helpers/create-ticket';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

test.describe('03 approvals', () => {
  test('approve advances ticket; reject closes ticket', async ({ page }) => {
    const env = readE2EEnvironment();
    const api = new ApiClient();
    await api.login(env.superAdminEmail, env.superAdminPassword);
    const catalog = await loadSeedCatalog(api);
    // APPROVAL_SELF_FORBIDDEN: the requester may not approve, so the E2E USER files.
    const userApi = new ApiClient();
    await userApi.login(env.userEmail, env.userPassword);
    const service = await createOfferedService(api, {
      label: 'Approval',
      requiresApproval: true,
    });
    const rules = await api.requestJson<
      Array<{ id: string; groupId: string; originUnitId: string; serviceId: string }>
    >('/routing/rules');
    const seedRule = rules.find((rule) => rule.serviceId === catalog.serviceId);
    if (seedRule !== undefined) {
      await api.requestJson('/routing/rules', {
        method: 'POST',
        body: JSON.stringify({
          originUnitId: catalog.originUnitId,
          serviceId: service.id,
          groupId: seedRule.groupId,
          reason: 'e2e-approvals-routing',
        }),
      });
    }
    const approveTicket = await createTicketViaApi(userApi, {
      title: `E2E approve ${Date.now()}`,
      serviceId: service.id,
    });
    expect(approveTicket.status).toBe('PENDING_APPROVAL');
    const approvals = await api.requestJson<Array<{ id: string }>>(
      `/tickets/${approveTicket.id}/approvals`,
    );
    expect(approvals.length).toBeGreaterThan(0);
    await api.requestJson(
      `/tickets/${approveTicket.id}/approvals/${approvals[0].id}/approve`,
      {
        method: 'POST',
        body: JSON.stringify({ comment: 'E2E approve' }),
      },
    );
    const afterApprove = await api.requestJson<{ status: string }>(
      `/tickets/${approveTicket.id}`,
    );
    expect(afterApprove.status).not.toBe('PENDING_APPROVAL');
    const rejectTicket = await createTicketViaApi(userApi, {
      title: `E2E reject ${Date.now()}`,
      serviceId: service.id,
    });
    const rejectApprovals = await api.requestJson<Array<{ id: string }>>(
      `/tickets/${rejectTicket.id}/approvals`,
    );
    await api.requestJson(
      `/tickets/${rejectTicket.id}/approvals/${rejectApprovals[0].id}/reject`,
      {
        method: 'POST',
        body: JSON.stringify({ comment: 'E2E reject' }),
      },
    );
    const afterReject = await api.requestJson<{ status: string }>(
      `/tickets/${rejectTicket.id}`,
    );
    expect(afterReject.status).toBe('CLOSED');
    await signIn(page, env.superAdminEmail, env.superAdminPassword);
    await page.goto(`/tickets/${approveTicket.id}`);
    await expect(page.getByText(approveTicket.title)).toBeVisible();
  });
});
