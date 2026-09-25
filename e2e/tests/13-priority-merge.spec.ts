import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { createTicketViaApi, loadSeedCatalog } from '../helpers/create-ticket';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

type TicketView = {
  readonly id: string;
  readonly ticketNumber: string;
  readonly status: string;
  readonly priority: string;
  readonly priorityOverridden?: boolean;
  readonly mergedIntoTicketId?: string | null;
};

/**
 * Package 1.2: SuperAdmin sets a manual priority with a reason (P6), merges a
 * duplicate into another ticket through the panel (M5), sees the read-only
 * child with its banner (M7), and unmerges it again.
 */
test.describe('13 manual priority and merge', () => {
  test('priority override → merge → read-only child → unmerge', async ({ page }) => {
    const env = readE2EEnvironment();
    const adminApi = new ApiClient();
    await adminApi.login(env.superAdminEmail, env.superAdminPassword);
    const userApi = new ApiClient();
    await userApi.login(env.userEmail, env.userPassword);
    const catalog = await loadSeedCatalog(userApi);
    const stamp = Date.now();
    const parent = await createTicketViaApi(userApi, {
      title: `E2E merge parent ${stamp}`,
      serviceId: catalog.serviceId,
      originUnitId: catalog.originUnitId,
      formVersionRef: catalog.formVersionRef,
    });
    const child = await createTicketViaApi(userApi, {
      title: `E2E merge child ${stamp}`,
      serviceId: catalog.serviceId,
      originUnitId: catalog.originUnitId,
      formVersionRef: catalog.formVersionRef,
    });

    const parentView = await adminApi.requestJson<TicketView>(`/tickets/${parent.id}`);

    await signIn(page, env.superAdminEmail, env.superAdminPassword);

    // P6: manual priority with a reason.
    await page.goto(`/tickets/${parent.id}`);
    const target = parentView.priority === 'CRITICAL' ? 'LOW' : 'CRITICAL';
    await page.getByTestId('ticket-priority-edit').click();
    await page.getByTestId(`ticket-priority-option-${target}`).click();
    await page.getByTestId('ticket-priority-reason').fill('E2E: VIP korisnik');
    await page.getByTestId('ticket-priority-save').click();
    await expect(page.getByTestId('ticket-priority-manual')).toBeVisible();
    const overridden = await adminApi.requestJson<TicketView>(`/tickets/${parent.id}`);
    expect(overridden.priority).toBe(target);
    expect(overridden.priorityOverridden).toBe(true);

    // M5: merge the child into the parent through the panel.
    await page.goto(`/tickets/${child.id}`);
    await page.getByTestId('ticket-merge').click();
    await page.getByTestId('ticket-merge-search').fill(parentView.ticketNumber);
    await page.getByTestId('ticket-merge-candidate').first().click();
    await page.getByTestId('ticket-merge-reason').fill('E2E: duplikat');
    await page.getByTestId('ticket-merge-confirm').click();
    await expect(page.getByTestId('ticket-merged-banner')).toBeVisible();
    await expect(page.getByTestId('ticket-merged-composer-notice')).toBeVisible();
    const merged = await adminApi.requestJson<TicketView>(`/tickets/${child.id}`);
    expect(merged.mergedIntoTicketId).toBe(parent.id);

    // M7: the parent lists the child and offers "also to merged".
    await page.goto(`/tickets/${parent.id}`);
    await expect(page.getByTestId('ticket-merged-card')).toContainText(merged.ticketNumber);
    await expect(page.getByTestId('ticket-also-to-merged')).toBeChecked();

    // Unmerge from the child.
    await page.goto(`/tickets/${child.id}`);
    await page.getByTestId('ticket-unmerge').click();
    await page.getByTestId('ticket-unmerge-reason').fill('E2E: nije duplikat');
    await page.getByTestId('ticket-unmerge-confirm').click();
    await expect(page.getByTestId('ticket-merged-banner')).toHaveCount(0);
    const unmerged = await adminApi.requestJson<TicketView>(`/tickets/${child.id}`);
    expect(unmerged.mergedIntoTicketId ?? null).toBeNull();
  });
});
