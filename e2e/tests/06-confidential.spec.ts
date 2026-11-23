import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { createOfferedService, createTicketViaApi } from '../helpers/create-ticket';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

type UnitNode = { readonly id: string; readonly name: string };
type TicketFacts = {
  readonly assignedGroupId: string | null;
  readonly isConfidential: boolean;
  readonly title: string;
};

/**
 * The requester (E2E USER) opens a confidential ticket; the E2E AGENT, who is not a
 * handler of it, is denied; the SuperAdmin gets in — via break-glass when that is the
 * only path, or directly when policy already grants access (then the API answers
 * BREAK_GLASS_NOT_APPLICABLE, which is correct, not a failure).
 *
 * Nightly 45139438329 (2026-11-23) went red here: the test used to *assume* that a
 * fresh service has no routing rule, so the ticket stays UNROUTED and the agent has no
 * handler group. On the live stack the unrouted queue has a target group
 * (`private.ticket.unroutedQueue.targetGroupId`), so the ticket was assigned to a group
 * the E2E agent works in — and `evaluate-confidential-ticket-access.ts` let the agent in
 * via `handler_group`, which is the documented design, not a leak. A denial assertion
 * cannot be built on "probably unrouted".
 *
 * The premise is therefore *created and asserted*, not assumed: the fresh service routes
 * to a fresh group with **no members**, so handler-group membership cannot grant anything
 * and the only way into the ticket is the confidentiality policy itself.
 */
test.describe('06 confidential', () => {
  test('agent outside the handler group is denied; SuperAdmin can open it (break-glass if needed)', async ({
    page,
  }) => {
    const env = readE2EEnvironment();
    const adminApi = new ApiClient();
    await adminApi.login(env.superAdminEmail, env.superAdminPassword);
    const tree = await adminApi.requestJson<UnitNode | UnitNode[]>('/organizational-units/tree');
    const root = (Array.isArray(tree) ? tree : [tree])[0];
    const stamp = Date.now();
    const service = await createOfferedService(adminApi, { label: 'Confidential' });
    // Nobody is added to this group: it exists only so the ticket has a handler that no
    // E2E actor belongs to.
    const group = await adminApi.requestJson<{ id: string }>('/groups', {
      method: 'POST',
      body: JSON.stringify({
        name: `E2E Confidential ${stamp}`,
        organizationalUnitId: root.id,
      }),
    });
    const rule = await adminApi.requestJson<{ id: string }>('/routing/rules', {
      method: 'POST',
      body: JSON.stringify({
        originUnitId: root.id,
        serviceId: service.id,
        groupId: group.id,
        reason: `E2E 06 setup: confidential handler group (${stamp})`,
      }),
    });
    try {
      const userApi = new ApiClient();
      await userApi.login(env.userEmail, env.userPassword);
      const created = await createTicketViaApi(userApi, {
        title: `E2E confidential ${stamp}`,
        description: 'secret body',
        serviceId: service.id,
        originUnitId: root.id,
        isConfidential: true,
      });
      // Proven, not assumed: the flag stuck and the handler is the empty group. Read as the
      // requester, because a SuperAdmin may legitimately have no direct access yet.
      const facts = await userApi.requestJson<TicketFacts>(`/tickets/${created.id}`);
      expect(facts.isConfidential).toBe(true);
      expect(facts.assignedGroupId).toBe(group.id);

      const agentApi = new ApiClient();
      await agentApi.login(env.agentEmail, env.agentPassword);
      await expect(agentApi.requestJson(`/tickets/${created.id}`)).rejects.toThrow(
        /CONFIDENTIAL|FORBIDDEN|NOT_FOUND|403|404/i,
      );
      try {
        await adminApi.requestJson(`/tickets/${created.id}/break-glass`, {
          method: 'POST',
          body: JSON.stringify({
            reason: 'E2E break-glass audit',
            correlationId: randomUUID(),
          }),
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
    } finally {
      // Best effort: the ticket still references the group, so the delete may be refused;
      // `ops/sql/cleanup-e2e-data.sql` sweeps the `E2E …` leftovers either way.
      await adminApi
        .request(`/routing/rules/${rule.id}`, { method: 'DELETE' })
        .catch(() => undefined);
      await adminApi.request(`/groups/${group.id}`, { method: 'DELETE' }).catch(() => undefined);
    }
  });
});
