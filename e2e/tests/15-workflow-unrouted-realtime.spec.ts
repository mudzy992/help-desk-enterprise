import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { withSettings } from '../helpers/assets';
import { createOfferedService, createTicketViaApi } from '../helpers/create-ticket';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

type UnitNode = { readonly id: string; readonly name: string };
type GroupListItem = { readonly id: string; readonly name: string; readonly organizationalUnitId: string };
type TicketView = {
  readonly id: string;
  readonly status: string;
  readonly assignedGroupId: string | null;
  readonly assignedUserId: string | null;
  readonly routedByUnroutedFallback: boolean;
};
type TicketPage = {
  readonly items: readonly TicketView[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
};
type Workflow = {
  readonly transitions: ReadonlyArray<{ readonly from: string; readonly to: string; readonly actors: string[] }>;
  readonly parameters: { readonly unrouted: { readonly targetGroup: { readonly id: string } | null } };
  readonly editable: false;
};

const targetKey = 'private.ticket.unroutedQueue.targetGroupId';
const autoAssignEnabledKey = 'private.ticket.autoAssign.enabled';
const targetGroupName = 'E2E Unrouted Target';
const formsEnabledKey = 'private.ticket.forms.enabled';
const formsEnabledDefaults = { [formsEnabledKey]: true };

async function readOriginUnitId(api: ApiClient): Promise<string> {
  const tree = await api.requestJson<UnitNode | UnitNode[]>('/organizational-units/tree');
  const root = Array.isArray(tree) ? tree[0] : tree;
  if (root === undefined) {
    throw new Error('No organizational unit is available for the E2E ticket');
  }
  return root.id;
}

/**
 * Package 1.7: the status-flow API and screen (ADMIN/SUPER_ADMIN only), the
 * unrouted target group fallback with the "create a rule" shortcut, and a
 * second admin session receiving `admin.config.updated` for routing.
 */
test.describe('15 workflow, unrouted target group, admin realtime', () => {
  test('status flow is read-only and admin-only', async ({ page }) => {
    const env = readE2EEnvironment();
    const adminApi = new ApiClient();
    await adminApi.login(env.superAdminEmail, env.superAdminPassword);
    const workflow = await adminApi.requestJson<Workflow>('/workflow/ticket-status');
    expect(workflow.editable).toBe(false);
    expect(workflow.transitions).toContainEqual(
      expect.objectContaining({ from: 'UNROUTED', to: 'CLOSED' }),
    );

    const agentApi = new ApiClient();
    await agentApi.login(env.agentEmail, env.agentPassword);
    const forbidden = await agentApi.request('/workflow/ticket-status');
    expect(forbidden.status).toBe(403);

    await signIn(page, env.superAdminEmail, env.superAdminPassword);
    await page.goto('/admin/workflow');
    await expect(page.getByTestId('workflow-node-IN_PROGRESS')).toBeVisible();
    await page.getByTestId('workflow-node-ARCHIVED').click();
    // ARCHIVED is only reached from CLOSED by the archive job.
    await expect(page.getByTestId('workflow-transitions-table').locator('tbody tr')).toHaveCount(1);
  });

  test('ticket without a rule lands in the target group; the shortcut pre-fills the rule', async ({ page }) => {
    const env = readE2EEnvironment();
    const adminApi = new ApiClient();
    await adminApi.login(env.superAdminEmail, env.superAdminPassword);
    const tree = await adminApi.requestJson<UnitNode | UnitNode[]>('/organizational-units/tree');
    const root = (Array.isArray(tree) ? tree : [tree])[0];
    const groups = await adminApi.requestJson<GroupListItem[]>('/groups');
    const targetGroupId =
      groups.find((group) => group.name === targetGroupName)?.id ??
      (
        await adminApi.requestJson<{ id: string }>('/groups', {
          method: 'POST',
          body: JSON.stringify({ name: targetGroupName, organizationalUnitId: root.id }),
        })
      ).id;

    await withSettings(
      adminApi,
      { [targetKey]: targetGroupId, [autoAssignEnabledKey]: false },
      'E2E 15: verify unrouted target group behavior',
      async () => {
        const service = await createOfferedService(adminApi, { label: 'Unrouted target' });
        const created = await createTicketViaApi(adminApi, {
          title: `E2E unrouted target ${Date.now()}`,
          serviceId: service.id,
          originUnitId: root.id,
        });
        const secondCreated = await createTicketViaApi(adminApi, {
          title: `E2E unrouted target second ${Date.now()}`,
          serviceId: service.id,
          originUnitId: root.id,
        });
        const view = await adminApi.requestJson<TicketView>(`/tickets/${created.id}`);
        expect(view.status).toBe('PENDING');
        expect(view.assignedGroupId).toBe(targetGroupId);
        expect(view.assignedUserId).toBeNull();
        expect(view.routedByUnroutedFallback).toBe(true);

        const queueQuery = new URLSearchParams({
          unroutedQueue: 'true',
          serviceId: service.id,
          groupId: targetGroupId,
          page: '1',
          pageSize: '1',
        });
        const firstQueuePage = await adminApi.requestJson<TicketPage>(
          `/tickets?${queueQuery.toString()}`,
        );
        queueQuery.set('page', '2');
        const secondQueuePage = await adminApi.requestJson<TicketPage>(
          `/tickets?${queueQuery.toString()}`,
        );
        expect(firstQueuePage.total).toBe(2);
        expect(firstQueuePage.items).toHaveLength(1);
        expect(secondQueuePage.total).toBe(firstQueuePage.total);
        expect(secondQueuePage.items).toHaveLength(1);
        expect(
          new Set([
            firstQueuePage.items[0]?.id,
            secondQueuePage.items[0]?.id,
          ]),
        ).toEqual(new Set([created.id, secondCreated.id]));
        expect(
          [...firstQueuePage.items, ...secondQueuePage.items].every(
            (ticket) =>
              ticket.status === 'PENDING' &&
              ticket.routedByUnroutedFallback &&
              ticket.assignedGroupId === targetGroupId &&
              ticket.assignedUserId === null,
          ),
        ).toBe(true);

        const countsQuery = new URLSearchParams({
          serviceId: service.id,
          groupId: targetGroupId,
        });
        const counts = await adminApi.requestJson<{ readonly unroutedQueue: number }>(
          `/tickets/counts?${countsQuery.toString()}`,
        );
        expect(counts.unroutedQueue).toBe(firstQueuePage.total);

        const bottlenecks = await adminApi.requestJson<{
          readonly byService: readonly { readonly key: string; readonly unrouted: number }[];
        }>(`/reports/bottlenecks?organizationalUnitId=${encodeURIComponent(root.id)}`);
        expect(bottlenecks.byService.find((row) => row.key === service.id)?.unrouted).toBe(2);

        await signIn(page, env.superAdminEmail, env.superAdminPassword);
        await page.goto(`/tickets/${created.id}`);
        await page.getByTestId('ticket-create-routing-rule').click();
        await expect(page).toHaveURL(/\/routing\?/);
        await expect(page.locator('select').filter({ has: page.locator(`option[value="${service.id}"]`) }).first())
          .toHaveValue(service.id);
      },
      { [targetKey]: '', [autoAssignEnabledKey]: false },
    );
  });

  test('server rejects formData that does not satisfy the active service schema', async () => {
    const env = readE2EEnvironment();
    const adminApi = new ApiClient();
    await adminApi.login(env.superAdminEmail, env.superAdminPassword);
    const originUnitId = await readOriginUnitId(adminApi);
    const service = await createOfferedService(adminApi, { label: 'Invalid form data' });
    const response = await adminApi.request('/tickets', {
      method: 'POST',
      body: JSON.stringify({
        title: `E2E invalid form ${Date.now()}`,
        description: 'Server-side form validation check',
        serviceId: service.id,
        originUnitId,
        impact: 'MEDIUM',
        urgency: 'MEDIUM',
        formData: { dodatne_informacije: 'x'.repeat(4_001) },
      }),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'FORM_DATA_INVALID',
      details: {
        fields: [{ fieldId: 'dodatne_informacije', code: 'INVALID' }],
      },
    });
  });

  test('forms.enabled controls the UI and leaves created tickets unbound to a form', async ({ page }) => {
    const env = readE2EEnvironment();
    const adminApi = new ApiClient();
    await adminApi.login(env.superAdminEmail, env.superAdminPassword);
    const originUnitId = await readOriginUnitId(adminApi);

    let serviceId: string | null = null;
    await withSettings(
      adminApi,
      { [formsEnabledKey]: true },
      'E2E 15: enable forms to prepare fixture',
      async () => {
        const service = await createOfferedService(adminApi, { label: 'Forms disabled' });
        serviceId = service.id;
      },
      formsEnabledDefaults,
    );
    if (serviceId === null) {
      throw new Error('Expected the forms-disabled E2E service to be created');
    }
    const createdServiceId = serviceId;

    await withSettings(
      adminApi,
      { [formsEnabledKey]: false },
      'E2E 15: verify forms disabled on ticket creation',
      async () => {
        const configuration = await adminApi.requestJson<{
          readonly formsEnabled: boolean;
          readonly requireVersionOnTicket: boolean;
        }>(`/services/${createdServiceId}/form`);
        expect(configuration.formsEnabled).toBe(false);

        await signIn(page, env.superAdminEmail, env.superAdminPassword);
        const formResponse = page.waitForResponse(
          (response) =>
            response.url().includes(`/services/${createdServiceId}/form`) &&
            response.request().method() === 'GET',
        );
        await page.goto(`/tickets/new?serviceId=${encodeURIComponent(createdServiceId)}`);
        await formResponse;
        await page.getByRole('button', { name: /dalje|next|nastavi/i }).click();
        await expect(page.getByText('Dodatne informacije', { exact: true })).toHaveCount(0);

        const created = await createTicketViaApi(adminApi, {
          title: `E2E forms disabled ${Date.now()}`,
          serviceId: createdServiceId,
          originUnitId,
        });
        const binding = await adminApi.requestJson<{
          readonly formVersionRef: string | null;
          readonly schema: unknown | null;
        }>(`/tickets/${created.id}/form`);
        expect(binding.formVersionRef).toBeNull();
        expect(binding.schema).toBeNull();
      },
      formsEnabledDefaults,
    );
  });

  test('a routing change reaches the admin room over the socket', async ({ page }) => {
    const env = readE2EEnvironment();
    const frames: string[] = [];
    page.on('websocket', (socket) => {
      socket.on('framereceived', (frame) => {
        if (typeof frame.payload === 'string') frames.push(frame.payload);
      });
    });
    await signIn(page, env.superAdminEmail, env.superAdminPassword);
    await page.goto('/routing');
    // Give the socket time to join `role:admins` after the handshake.
    await page.waitForTimeout(1_500);

    const adminApi = new ApiClient();
    await adminApi.login(env.superAdminEmail, env.superAdminPassword);
    const tree = await adminApi.requestJson<UnitNode | UnitNode[]>('/organizational-units/tree');
    const root = (Array.isArray(tree) ? tree : [tree])[0];
    const service = await createOfferedService(adminApi, { label: 'Realtime rule' });
    const groups = await adminApi.requestJson<GroupListItem[]>('/groups');
    const rule = await adminApi.requestJson<{ id: string }>('/routing/rules', {
      method: 'POST',
      body: JSON.stringify({
        originUnitId: root.id,
        serviceId: service.id,
        groupId: groups[0].id,
        reason: 'E2E 15 realtime',
      }),
    });
    await expect
      .poll(() => frames.some((frame) => frame.includes('routing.rules.updated')), { timeout: 10_000 })
      .toBe(true);
    expect(frames.some((frame) => frame.includes('admin.config.updated') && frame.includes('"routing"'))).toBe(true);
    await adminApi.request(`/routing/rules/${rule.id}`, {
      method: 'DELETE',
      body: JSON.stringify({ originUnitId: root.id, serviceId: service.id, reason: 'E2E 15 cleanup' }),
    });
  });
});
