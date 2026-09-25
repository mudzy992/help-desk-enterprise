import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { createOfferedService, createTicketViaApi } from '../helpers/create-ticket';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

type UnitNode = {
  readonly id: string;
  readonly name: string;
  readonly children?: readonly UnitNode[];
};

type GroupListItem = {
  readonly id: string;
  readonly name: string;
  readonly organizationalUnitId: string;
};

type TicketView = {
  readonly id: string;
  readonly status: string;
  readonly assignedGroupId: string | null;
  readonly assignedUserId: string | null;
};

const targetUnitName = 'E2E Forward OU';
const originGroupName = 'E2E Forward Origin';
const targetGroupName = 'E2E Forward Target';

/**
 * Package 1.1 (G1): SuperAdmin forwards an unrouted ticket from the origin OU to a
 * group of another OU through the dialog; the target group's agent finds it in
 * the group inbox and claims it (decision D1), then hands it back cross-OU,
 * which clears the assignee and removes it from the agent's inbox (D3/D4).
 * Fixtures (one OU, two groups) are found or created once and reused.
 */
test.describe('10 forward cross-OU', () => {
  test('forward dialog → target group inbox → claim → cross-OU hand-back', async ({
    page,
  }) => {
    const env = readE2EEnvironment();
    const adminApi = new ApiClient();
    await adminApi.login(env.superAdminEmail, env.superAdminPassword);

    const tree = await adminApi.requestJson<UnitNode | UnitNode[]>(
      '/organizational-units/tree',
    );
    const root = (Array.isArray(tree) ? tree : [tree])[0];
    expect(root, 'organizational unit tree root').toBeDefined();
    const targetUnitId = await ensureChildUnit(adminApi, root, targetUnitName);
    const originGroupId = await ensureGroup(adminApi, originGroupName, root.id);
    const targetGroupId = await ensureGroup(adminApi, targetGroupName, targetUnitId);
    const users = await adminApi.requestJson<Array<{ id: string; email: string }>>('/users');
    const agent = users.find(
      (user) => user.email.toLowerCase() === env.agentEmail.toLowerCase(),
    );
    expect(agent, 'E2E agent provisioned by global setup').toBeDefined();
    // The agent handles the target group only; membership is idempotent.
    await adminApi
      .requestJson(`/groups/${targetGroupId}/members/${agent!.id}`, { method: 'POST' })
      .catch((error: unknown) => expect(String(error)).toMatch(/ALREADY|CONFLICT|409/i));
    await adminApi
      .requestJson(`/groups/${originGroupId}/members/${agent!.id}`, { method: 'DELETE' })
      .catch(() => undefined);

    // A fresh service without a routing rule leaves the ticket UNROUTED.
    const service = await createOfferedService(adminApi, { label: 'Forward' });
    const userApi = new ApiClient();
    await userApi.login(env.userEmail, env.userPassword);
    const created = await createTicketViaApi(userApi, {
      title: `E2E forward ${Date.now()}`,
      serviceId: service.id,
      originUnitId: root.id,
    });

    await signIn(page, env.superAdminEmail, env.superAdminPassword);
    await page.goto(`/tickets/${created.id}`);
    await page.getByTestId('ticket-forward').click();
    const targetSelect = page.getByTestId('forward-target-group');
    await expect(targetSelect).toBeVisible();
    await targetSelect.selectOption(targetGroupId);
    await page.getByTestId('forward-reason').fill('E2E: potrebna druga organizaciona jedinica');
    await page.getByRole('button', { name: /^(Proslijedi|Forward)$/ }).last().click();
    await expect(page.getByTestId('forward-history')).toBeVisible();
    await expect(page.getByTestId('forward-history')).toContainText(targetGroupName);

    const forwarded = await adminApi.requestJson<TicketView>(`/tickets/${created.id}`);
    expect(forwarded.assignedGroupId).toBe(targetGroupId);
    expect(forwarded.assignedUserId).toBeNull();
    expect(forwarded.status).toBe('PENDING');
    const history = await adminApi.requestJson<Array<{ isCrossOu: boolean; reason: string }>>(
      `/tickets/${created.id}/forward-history`,
    );
    expect(history[0]).toMatchObject({ isCrossOu: true });

    const agentApi = new ApiClient();
    await agentApi.login(env.agentEmail, env.agentPassword);
    const inbox = await agentApi.requestJson<{ items: TicketView[] }>('/tickets/inbox');
    expect(inbox.items.some((ticket) => ticket.id === created.id)).toBe(true);
    const claimed = await agentApi.requestJson<TicketView>(`/tickets/${created.id}/claim`, {
      method: 'POST',
    });
    expect(claimed.assignedUserId).toBe(agent!.id);

    // AGENT holds ticket.forward.cross_ou by default, so the agent may send the
    // ticket on to the origin OU's group: the assignee is cleared (D4) and the
    // agent keeps read access only through their own OU scope (D2).
    const handedBack = await agentApi.requestJson<TicketView>(`/tickets/${created.id}/forward`, {
      method: 'POST',
      body: JSON.stringify({
        targetGroupId: originGroupId,
        reason: 'E2E: vraćanje u matičnu organizacionu jedinicu',
      }),
    });
    expect(handedBack).toMatchObject({
      assignedGroupId: originGroupId,
      assignedUserId: null,
      status: 'PENDING',
    });
    const afterHandBack = await agentApi.requestJson<{ items: TicketView[] }>('/tickets/inbox');
    expect(afterHandBack.items.some((ticket) => ticket.id === created.id)).toBe(false);
    const route = await adminApi.requestJson<Array<{ toGroupId: string }>>(
      `/tickets/${created.id}/forward-history`,
    );
    expect(route.map((item) => item.toGroupId)).toEqual([originGroupId, targetGroupId]);
  });
});

async function ensureChildUnit(api: ApiClient, root: UnitNode, name: string): Promise<string> {
  const existing = (root.children ?? []).find((child) => child.name === name);
  if (existing !== undefined) {
    return existing.id;
  }
  const created = await api.requestJson<{ id: string }>('/organizational-units', {
    method: 'POST',
    body: JSON.stringify({
      name,
      type: 'OFFICE',
      distinguishedName: `OU=${name.replace(/\s+/g, '')},OU=E2E`,
      parentId: root.id,
    }),
  });
  return created.id;
}

async function ensureGroup(
  api: ApiClient,
  name: string,
  organizationalUnitId: string,
): Promise<string> {
  const groups = await api.requestJson<GroupListItem[]>('/groups');
  const existing = groups.find(
    (group) => group.name === name && group.organizationalUnitId === organizationalUnitId,
  );
  if (existing !== undefined) {
    return existing.id;
  }
  const created = await api.requestJson<{ id: string }>('/groups', {
    method: 'POST',
    body: JSON.stringify({ name, organizationalUnitId }),
  });
  return created.id;
}
