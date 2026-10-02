import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { createOfferedService, createTicketViaApi } from '../helpers/create-ticket';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

type UnitNode = { readonly id: string; readonly name: string };
type TrendPoint = { readonly key: string; readonly created: number; readonly resolved: number };
type Trends = {
  readonly granularity: 'day' | 'week' | 'month';
  readonly timeZone: string;
  readonly points: readonly TrendPoint[];
  readonly totals: { readonly created: number };
};
type AuditPage = { items: Array<{ action: string; metadata: Record<string, unknown> }> };

/**
 * Package 2.5 (§11 E2E 17): a fresh ticket lands in today's bucket of the
 * trend API; the Trends tab applies filters through the URL and exports a CSV
 * (BOM, header row) that is recorded in the audit log.
 */
test.describe('17 reports trends', () => {
  test('trend API counts a new ticket → filters → CSV export → audit', async ({ page }) => {
    const env = readE2EEnvironment();
    const api = new ApiClient();
    await api.login(env.superAdminEmail, env.superAdminPassword);
    const tree = await api.requestJson<UnitNode | UnitNode[]>('/organizational-units/tree');
    const root = (Array.isArray(tree) ? tree : [tree])[0];

    // Same shape the Trends tab sends: civil dates in the report zone, `to` inclusive.
    const today = civilDate(new Date());
    const weekAgo = civilDate(new Date(Date.now() - 6 * 24 * 3600 * 1000));
    const query = new URLSearchParams({
      organizationalUnitId: root.id,
      from: weekAgo,
      to: today,
      granularity: 'day',
    });
    const before = await api.requestJson<Trends>(`/reports/trends?${query.toString()}`);
    expect(before.granularity).toBe('day');
    expect(before.points.length).toBeGreaterThanOrEqual(7);

    const service = await createOfferedService(api, { label: 'Trends' });
    const userApi = new ApiClient();
    await userApi.login(env.userEmail, env.userPassword);
    await createTicketViaApi(userApi, {
      title: `E2E trend ${Date.now()}`,
      serviceId: service.id,
      originUnitId: root.id,
    });

    // The trend endpoint is cached for 10 minutes (§12.2); a service filter
    // yields a fresh cache key and isolates the new ticket.
    const filtered = new URLSearchParams({ ...Object.fromEntries(query), serviceId: service.id });
    const after = await api.requestJson<Trends>(`/reports/trends?${filtered.toString()}`);
    expect(after.totals.created).toBe(1);
    expect(after.points.at(-1)?.created).toBe(1);

    await signIn(page, env.superAdminEmail, env.superAdminPassword);
    await page.goto(`/reports?tab=trends&from=${weekAgo}&to=${today}&granularity=day&serviceId=${service.id}`);
    const panel = page.getByTestId('trends-panel');
    await expect(panel).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('trends-filters')).toBeVisible();
    await expect(page.getByTestId('trends-card-services')).toContainText('E2E Trends', {
      timeout: 20_000,
    });

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('trends-export-csv').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^report_trends_.+\.csv$/);
    const content = await readFile((await download.path())!, 'utf8');
    expect(content.charCodeAt(0)).toBe(0xfeff);
    expect(content).toContain('periodStart');

    const audit = await api.requestJson<AuditPage>(`/audit-logs?organizationalUnitId=${root.id}&take=50`);
    const entry = audit.items.find((item) => item.action === 'report.trends.exported');
    expect(entry?.metadata).toMatchObject({ format: 'csv', serviceId: service.id });
  });
});

function civilDate(value: Date): string {
  return value.toLocaleDateString('sv-SE', { timeZone: 'Europe/Sarajevo' });
}
