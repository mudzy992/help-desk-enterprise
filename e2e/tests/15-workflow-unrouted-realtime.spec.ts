import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { createOfferedService, createTicketViaApi } from '../helpers/create-ticket';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

type UnitNode = { readonly id: string; readonly name: string };
type GroupListItem = { readonly id: string; readonly name: string; readonly organizationalUnitId: string };
type TicketView = {
  readonly id: string;
  readonly status: string;
  readonly assignedGroupId: string | null;
  readonly routedByUnroutedFallback: boolean;
};
type Workflow = {
  readonly transitions: ReadonlyArray<{ readonly from: string; readonly to: string; readonly actors: string[] }>;
  readonly parameters: { readonly unrouted: { readonly targetGroup: { readonly id: string } | null } };
  readonly editable: false;
};

const targetKey = 'private.ticket.unroutedQueue.targetGroupId';
const targetGroupName = 'E2E Unrouted Target';

async function setSetting(api: ApiClient, key: string, value: unknown): Promise<void> {
  await api.requestJson('/settings', {
    method: 'PUT',
    body: JSON.stringify({ key, value, reason: 'E2E 15 workflow/unrouted' }),
  });
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

    await setSetting(adminApi, targetKey, targetGroupId);
    try {
      const service = await createOfferedService(adminApi, { label: 'Unrouted target' });
      const created = await createTicketViaApi(adminApi, {
        title: `E2E unrouted target ${Date.now()}`,
        serviceId: service.id,
        originUnitId: root.id,
      });
      const view = await adminApi.requestJson<TicketView>(`/tickets/${created.id}`);
      expect(view.status).toBe('PENDING');
      expect(view.assignedGroupId).toBe(targetGroupId);
      expect(view.routedByUnroutedFallback).toBe(true);

      await signIn(page, env.superAdminEmail, env.superAdminPassword);
      await page.goto(`/tickets/${created.id}`);
      await page.getByTestId('ticket-create-routing-rule').click();
      await expect(page).toHaveURL(/\/routing\?/);
      await expect(page.locator('select').filter({ has: page.locator(`option[value="${service.id}"]`) }).first())
        .toHaveValue(service.id);
    } finally {
      await setSetting(adminApi, targetKey, '');
    }
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
