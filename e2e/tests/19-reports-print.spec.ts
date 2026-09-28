import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

type UnitNode = { readonly id: string; readonly name: string };
type AuditPage = { items: Array<{ action: string; metadata: Record<string, unknown> }> };

/**
 * Package 2.5 (§11 E2E 19): „Izvezi PDF” opens the browser print dialog; in
 * print media the navigation, header and filters disappear and the scope /
 * period header appears. The click leaves a `report.pdf.exported` audit entry.
 */
test.describe('19 reports print view', () => {
  test('print button → audit; print media hides chrome and shows the header', async ({ page }) => {
    const env = readE2EEnvironment();
    const api = new ApiClient();
    await api.login(env.superAdminEmail, env.superAdminPassword);
    const tree = await api.requestJson<UnitNode | UnitNode[]>('/organizational-units/tree');
    const root = (Array.isArray(tree) ? tree : [tree])[0];

    // Headless print is a no-op anyway; count the calls instead of blocking.
    await page.addInitScript(() => {
      (window as unknown as { __printCalls: number }).__printCalls = 0;
      window.print = () => {
        (window as unknown as { __printCalls: number }).__printCalls += 1;
      };
    });
    await signIn(page, env.superAdminEmail, env.superAdminPassword);
    await page.goto('/reports?tab=trends&preset=30d');
    await expect(page.getByTestId('trends-panel')).toBeVisible({ timeout: 20_000 });

    const beacon = page.waitForResponse((response) => response.url().includes('/reports/pdf-exports'));
    await page.getByTestId('trends-print').click();
    expect((await beacon).ok()).toBe(true);
    expect(await page.evaluate(() => (window as unknown as { __printCalls: number }).__printCalls)).toBe(1);

    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('aside').first()).toBeHidden();
    await expect(page.getByTestId('trends-filters')).toBeHidden();
    const header = page.getByTestId('report-print-header');
    await expect(header).toBeVisible();
    await expect(header).toContainText('Europe/Sarajevo');
    await expect(page.getByTestId('trends-card-services')).toBeVisible();

    await page.emulateMedia({ media: 'screen' });
    await expect(header).toBeHidden();

    const audit = await api.requestJson<AuditPage>(`/audit-logs?organizationalUnitId=${root.id}&take=50`);
    const entry = audit.items.find((item) => item.action === 'report.pdf.exported');
    expect(entry?.metadata).toMatchObject({ view: 'trends' });
  });
});
