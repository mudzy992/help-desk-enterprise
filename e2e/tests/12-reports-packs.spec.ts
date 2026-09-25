import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { createOfferedService, createTicketViaApi } from '../helpers/create-ticket';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

type UnitNode = { readonly id: string; readonly name: string };
type GroupListItem = { readonly id: string; readonly name: string; readonly organizationalUnitId: string };
type TicketView = { readonly id: string; readonly ticketNumber: string; readonly forwardCount: number };
type Preview = {
  readonly columns: string[];
  readonly rows: Array<Record<string, string | number | null>>;
  readonly totalRows: number;
};

/**
 * Package 1.6: a ticket forwarded three times shows the list indicator, is found
 * by the "forwarded" filter and appears in the ping-pong pack; the reports page
 * previews a pack and downloads a CSV (BOM, headers) that lands in the audit.
 */
test.describe('12 report packs and forward tracking', () => {
  test('ping-pong → indicator/filter → pack preview → CSV download → audit', async ({ page }) => {
    const env = readE2EEnvironment();
    const api = new ApiClient();
    await api.login(env.superAdminEmail, env.superAdminPassword);
    const tree = await api.requestJson<UnitNode | UnitNode[]>('/organizational-units/tree');
    const root = (Array.isArray(tree) ? tree : [tree])[0];
    const groupA = await ensureGroup(api, 'E2E PingPong A', root.id);
    const groupB = await ensureGroup(api, 'E2E PingPong B', root.id);

    const service = await createOfferedService(api, { label: 'PingPong' });
    const userApi = new ApiClient();
    await userApi.login(env.userEmail, env.userPassword);
    const title = `E2E ping-pong ${Date.now()}`;
    const created = await createTicketViaApi(userApi, {
      title,
      serviceId: service.id,
      originUnitId: root.id,
    });
    for (const targetGroupId of [groupA, groupB, groupA]) {
      await api.requestJson(`/tickets/${created.id}/forward`, {
        method: 'POST',
        body: JSON.stringify({ targetGroupId, reason: 'E2E: ping-pong provjera' }),
      });
    }
    const ticket = await api.requestJson<TicketView>(`/tickets/${created.id}`);
    expect(ticket.forwardCount).toBe(3);

    const scope = new URLSearchParams({
      organizationalUnitId: root.id,
      from: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
      to: new Date(Date.now() + 60 * 1000).toISOString(),
    });
    const pingPong = await api.requestJson<Preview>(
      `/reports/packs/forward-ping-pong/preview?${scope.toString()}`,
    );
    const row = pingPong.rows.find((item) => item.ticketNumber === ticket.ticketNumber);
    expect(row).toMatchObject({ forwardsInPeriod: 3 });

    await signIn(page, env.superAdminEmail, env.superAdminPassword);
    await page.goto(`/tickets?view=all&forwarded=any&q=${encodeURIComponent(title)}`);
    await expect(page.getByTestId('ticket-list-forwarded')).toHaveValue('any');
    const listRow = page.getByRole('row', { name: new RegExp(ticket.ticketNumber) });
    await expect(listRow.getByTestId('ticket-forward-indicator')).toContainText('3', {
      timeout: 20_000,
    });

    await page.goto(`/tickets/${created.id}`);
    await expect(page.getByTestId('ticket-forward-chip')).toContainText('3');

    await page.goto('/reports?tab=packs');
    await page.getByTestId('report-pack-monthly-kpi').click();
    await page.getByTestId('report-pack-preview').click();
    await expect(page.getByTestId('report-pack-table')).toBeVisible({ timeout: 20_000 });

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('report-pack-download-csv').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^ephelpdesk_monthly_kpi_.+\.csv$/);
    const content = await readFile((await download.path())!, 'utf8');
    expect(content.charCodeAt(0)).toBe(0xfeff);
    expect(content).toContain('createdCount');

    const audit = await api.requestJson<{ items: Array<{ action: string; metadata: Record<string, unknown> }> }>(
      `/audit-logs?organizationalUnitId=${root.id}&take=50`,
    );
    const exportEntry = audit.items.find((entry) => entry.action === 'reports.export');
    expect(exportEntry?.metadata).toMatchObject({ format: 'csv', pack: 'monthly_kpi' });
    expect(exportEntry?.metadata.from).toBeDefined();
  });
});

async function ensureGroup(api: ApiClient, name: string, organizationalUnitId: string): Promise<string> {
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
