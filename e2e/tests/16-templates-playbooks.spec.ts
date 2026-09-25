import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { createOfferedService, createTicketViaApi } from '../helpers/create-ticket';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

type UnitNode = { readonly id: string };
type TicketView = {
  readonly id: string;
  readonly ticketNumber: string;
  readonly status: string;
  readonly closePolicy?: {
    readonly enabled: boolean;
    readonly requireOnResolve: boolean;
    readonly allowedCodes: ReadonlyArray<{ readonly key: string }>;
  };
};
type TicketPlaybookView = {
  readonly mode: string;
  readonly playbook: null | {
    readonly autoAttached: boolean;
    readonly steps: ReadonlyArray<{ readonly stepKey: string; readonly checked: boolean; readonly required: boolean }>;
    readonly progress: { readonly done: number; readonly openRequired: ReadonlyArray<unknown> };
  };
};

const modeKey = 'private.ticket.playbooks.requiredStepsOnResolve';

async function setSetting(api: ApiClient, key: string, value: unknown): Promise<void> {
  await api.requestJson('/settings', {
    method: 'PUT',
    body: JSON.stringify({ key, value, reason: 'E2E 16 templates/playbooks' }),
  });
}

/**
 * Package 1.4: an admin creates a service-scoped template and playbook; a new
 * ticket of that service gets the playbook automatically; the agent inserts
 * the template filled for the ticket and sends it; in `block` mode resolving
 * is refused until the required step is ticked, which a second session sees.
 */
test.describe('16 response templates and playbooks', () => {
  test('template insert → auto playbook → block until required step done', async ({ page }) => {
    const env = readE2EEnvironment();
    const adminApi = new ApiClient();
    await adminApi.login(env.superAdminEmail, env.superAdminPassword);
    const tree = await adminApi.requestJson<UnitNode | UnitNode[]>('/organizational-units/tree');
    const root = (Array.isArray(tree) ? tree : [tree])[0];
    const stamp = Date.now();
    const service = await createOfferedService(adminApi, { label: 'Templates' });
    // A routing rule so the ticket lands in a group (PENDING), not UNROUTED.
    const groups = await adminApi.requestJson<Array<{ id: string }>>('/groups');
    const rule = await adminApi.requestJson<{ id: string }>('/routing/rules', {
      method: 'POST',
      body: JSON.stringify({
        originUnitId: root.id,
        serviceId: service.id,
        groupId: groups[0].id,
        reason: 'E2E 16 setup',
      }),
    });

    const template = await adminApi.requestJson<{ id: string; name: string }>('/response-templates', {
      method: 'POST',
      body: JSON.stringify({
        name: `E2E šablon ${stamp}`,
        bodyBs: 'Poštovani, tiket {{ticketNumber}} je zaprimljen u servisu {{serviceName}}.',
        kind: 'REPLY',
        serviceIds: [service.id],
        tags: ['e2e'],
        reason: 'E2E 16 setup',
      }),
    });
    const playbook = await adminApi.requestJson<{ id: string }>('/playbooks', {
      method: 'POST',
      body: JSON.stringify({
        name: `E2E playbook ${stamp}`,
        serviceIds: [service.id],
        steps: [
          { title: 'Provjeri identitet korisnika', required: true },
          { title: 'Obavijesti korisnika', required: false },
        ],
        reason: 'E2E 16 setup',
      }),
    });

    await setSetting(adminApi, modeKey, 'block');
    try {
      const created = await createTicketViaApi(adminApi, {
        title: `E2E templates ${stamp}`,
        serviceId: service.id,
        originUnitId: root.id,
      });
      const ticket = await adminApi.requestJson<TicketView>(`/tickets/${created.id}`);

      // P3: exactly one playbook matches the service → attached automatically.
      const attached = await adminApi.requestJson<TicketPlaybookView>(`/tickets/${created.id}/playbook`);
      expect(attached.playbook?.autoAttached).toBe(true);
      expect(attached.mode).toBe('block');

      // T3–T5: insert the template filled for this ticket, then send it.
      await signIn(page, env.superAdminEmail, env.superAdminPassword);
      await page.goto(`/tickets/${created.id}`);
      await page.getByTestId('composer-template-button').click();
      await expect(page.getByTestId('template-picker')).toBeVisible();
      await page.getByTestId('template-picker-search').fill(`E2E šablon ${stamp}`);
      await page.getByTestId('template-picker-item').first().click();
      const body = page.getByTestId('ticket-composer-body');
      await expect(body).toHaveValue(new RegExp(`tiket ${ticket.ticketNumber} je zaprimljen`));
      await expect(page.getByTestId('composer-used-template')).toBeVisible();
      await body.press('Control+Enter');
      await expect(body).toHaveValue('');
      await expect
        .poll(async () => (await adminApi.requestJson<{ usageCount: number }>(`/response-templates/${template.id}`)).usageCount)
        .toBe(1);

      // P5 (block): resolving is refused while the required step is open.
      await adminApi.requestJson(`/tickets/${created.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'IN_PROGRESS' }),
      });
      const policy = (await adminApi.requestJson<TicketView>(`/tickets/${created.id}`)).closePolicy;
      const resolveBody = JSON.stringify({
        status: 'RESOLVED',
        closeCode: policy?.allowedCodes[0]?.key ?? 'other',
        resolutionNote: 'E2E 16 resolved',
      });
      await expect(
        adminApi.requestJson(`/tickets/${created.id}`, { method: 'PATCH', body: resolveBody }),
      ).rejects.toThrow(/PLAYBOOK_REQUIRED_STEPS_OPEN/);

      // P4: tick the required step in the UI; another session sees it.
      await page.reload();
      await expect(page.getByTestId('ticket-playbook-panel')).toBeVisible();
      await page.getByTestId('playbook-step-1').check();
      await expect
        .poll(async () => {
          const view = await adminApi.requestJson<TicketPlaybookView>(`/tickets/${created.id}/playbook`);
          return view.playbook?.progress.openRequired.length ?? -1;
        })
        .toBe(0);

      const resolved = await adminApi.requestJson<TicketView>(`/tickets/${created.id}`, {
        method: 'PATCH',
        body: resolveBody,
      });
      expect(resolved.status).toBe('RESOLVED');

      // The requester never sees the checklist (staff-only route).
      const requesterApi = new ApiClient();
      await requesterApi.login(env.userEmail, env.userPassword);
      const requesterView = await requesterApi.request(`/tickets/${created.id}/playbook`);
      expect(requesterView.status).toBe(403);
    } finally {
      await setSetting(adminApi, modeKey, 'warn');
      await adminApi.request(`/playbooks/${playbook.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason: 'E2E 16 cleanup' }),
      });
      await adminApi.request(`/response-templates/${template.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason: 'E2E 16 cleanup' }),
      });
      await adminApi.request(`/routing/rules/${rule.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ originUnitId: root.id, serviceId: service.id, reason: 'E2E 16 cleanup' }),
      });
    }
  });
});
