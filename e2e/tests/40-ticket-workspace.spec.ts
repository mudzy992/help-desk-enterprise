import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { createTicketViaApi, loadSeedCatalog } from '../helpers/create-ticket';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

/**
 * Paket 5.3.1 — ticket workspace:
 *  - "created between" filter on GET /tickets (inclusive instants, from ≤ to);
 *  - the create-ticket service step searches and groups the catalog;
 *  - the group inbox is a tab of "All tickets" (no own sidebar item) and the
 *    old `?view=inbox` link still opens it.
 */
test.describe('40 ticket workspace (5.3.1)', () => {
  test('created range filter: inclusive bounds and an inverted range is rejected', async () => {
    const env = readE2EEnvironment();
    const api = new ApiClient();
    await api.login(env.superAdminEmail, env.superAdminPassword);
    const catalog = await loadSeedCatalog(api);
    const before = new Date(Date.now() - 60_000).toISOString();
    const created = await createTicketViaApi(api, {
      title: `E2E range ${Date.now()}`,
      serviceId: catalog.serviceId,
      originUnitId: catalog.originUnitId,
      formVersionRef: catalog.formVersionRef,
    });
    const after = new Date(Date.now() + 60_000).toISOString();

    const inside = await api.requestJson<{ items: Array<{ id: string }> }>(
      `/tickets?page=1&pageSize=50&createdFrom=${encodeURIComponent(before)}&createdTo=${encodeURIComponent(after)}`,
    );
    expect(inside.items.some((ticket) => ticket.id === created.id)).toBe(true);

    const past = await api.requestJson<{ items: Array<{ id: string }> }>(
      `/tickets?page=1&pageSize=50&createdTo=${encodeURIComponent(before)}`,
    );
    expect(past.items.some((ticket) => ticket.id === created.id)).toBe(false);

    const inverted = await api.request(
      `/tickets?page=1&createdFrom=${encodeURIComponent(after)}&createdTo=${encodeURIComponent(before)}`,
    );
    expect(inverted.status).toBe(400);
  });

  test('service step: search narrows the grouped list and shows an empty state', async ({ page }) => {
    const env = readE2EEnvironment();
    await signIn(page, env.superAdminEmail, env.superAdminPassword);
    await page.goto('/tickets/new');
    const search = page.getByTestId('service-picker-search');
    await expect(search).toBeVisible();
    // Diacritic-insensitive: "opsti" finds "Opšti zahtjev".
    await search.fill('opsti');
    await expect(page.getByRole('radio', { name: /opšti zahtjev|general request/i }).first()).toBeVisible();
    await search.fill('zzz-nepostojeca-usluga');
    await expect(page.getByTestId('service-picker-empty')).toBeVisible();
    await page.getByRole('button', { name: /očisti pretragu|clear search/i }).first().click();
    await expect(search).toHaveValue('');
    await page.getByRole('radio', { name: /opšti zahtjev|general request/i }).first().click();
    await expect(page.getByRole('radio', { name: /opšti zahtjev|general request/i }).first()).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  test('group inbox is a tab of All tickets; ?view=inbox still opens it', async ({ page }) => {
    const env = readE2EEnvironment();
    await signIn(page, env.superAdminEmail, env.superAdminPassword);
    await page.goto('/tickets?view=inbox');
    const nav = page.getByTestId('ticket-workspace-nav');
    await expect(nav).toBeVisible();
    await expect(page.getByTestId('ticket-view-inbox')).toHaveAttribute('aria-current', 'page');
    const sidebar = page.getByRole('navigation', { name: /glavna navigacija|primary navigation/i });
    await expect(sidebar.getByRole('link', { name: /^grupni inbox|^group inbox/i })).toHaveCount(0);
    await expect(sidebar.getByRole('link', { name: /svi tiketi|all tickets/i })).toHaveAttribute('aria-current', 'page');
    await page.getByTestId('ticket-view-all').click();
    await expect(page).toHaveURL(/view=all/);
    await expect(page.getByTestId('ticket-created-range')).toBeVisible();
  });
});
