import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

type UnitNode = { readonly id: string; readonly name: string };
type Schedule = {
  readonly id: string;
  readonly name: string;
  readonly frequency: 'WEEKLY' | 'MONTHLY';
  readonly sendTime: string;
  readonly nextRunAt: string | null;
  readonly recipients: ReadonlyArray<{ readonly email: string }>;
};
type ScheduleList = { readonly schedules: readonly Schedule[] };
type AuditPage = { items: Array<{ action: string; entityId: string; metadata: Record<string, unknown> }> };

/**
 * Package 2.5 (§11 E2E 18): an admin creates a weekly schedule in the sheet,
 * sees it in the table with the next Monday slot, sends a test to themselves
 * (SMTP of the e2e stack) and the create + test send land in the audit log.
 * A plain user is refused by the API (`reports.schedule.manage`).
 */
test.describe('18 scheduled reports', () => {
  test('create in UI → next slot → send test to me → audit → user refused', async ({ page }) => {
    const env = readE2EEnvironment();
    const api = new ApiClient();
    await api.login(env.superAdminEmail, env.superAdminPassword);
    const tree = await api.requestJson<UnitNode | UnitNode[]>('/organizational-units/tree');
    const root = (Array.isArray(tree) ? tree : [tree])[0];
    const name = `E2E raspored ${Date.now()}`;

    await signIn(page, env.superAdminEmail, env.superAdminPassword);
    await page.goto('/reports?tab=schedules');
    await expect(page.getByTestId('schedules-panel')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('schedule-create').click();

    const sheet = page.getByTestId('report-schedule-sheet');
    await expect(sheet).toBeVisible();
    await sheet.getByTestId('schedule-name').fill(name);
    await expect(sheet.getByTestId('schedule-next-preview')).toContainText(/\d/);
    await sheet.getByTestId('schedule-recipient-search').fill(env.superAdminEmail);
    await sheet.getByTestId('schedule-candidate').filter({ hasText: env.superAdminEmail }).first().click({
      timeout: 20_000,
    });
    await expect(sheet.getByTestId('schedule-recipients').locator(`[title="${env.superAdminEmail}"]`)).toBeVisible();
    await sheet.getByTestId('schedule-save').click();
    await expect(sheet).toBeHidden({ timeout: 20_000 });

    const row = page.getByTestId('schedule-row').filter({ hasText: name });
    await expect(row).toBeVisible();

    const list = await api.requestJson<ScheduleList>('/reports/schedules');
    const created = list.schedules.find((item) => item.name === name);
    expect(created).toMatchObject({ frequency: 'WEEKLY', sendTime: '07:00' });
    expect(created?.recipients.map((item) => item.email)).toContain(env.superAdminEmail);
    // Weekly slots are Mondays 07:00 Europe/Sarajevo (§12.5).
    const next = new Date(created!.nextRunAt!);
    const local = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Sarajevo',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(next);
    expect(local).toBe('Mon 07:00');

    const sendTest = page.waitForResponse(
      (response) => response.url().includes(`/reports/schedules/${created!.id}/send-test`),
    );
    await row.getByTestId('schedule-menu').click();
    await page.getByTestId('schedule-send-test').click();
    const response = await sendTest;
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { sent: boolean; reason?: string };
    expect(body.sent, body.reason).toBe(true);

    const audit = await api.requestJson<AuditPage>(`/audit-logs?organizationalUnitId=${root.id}&take=50`);
    const actions = audit.items.filter((item) => item.entityId === created!.id).map((item) => item.action);
    expect(actions).toEqual(expect.arrayContaining(['report.schedule.created', 'report.schedule.test_sent']));

    const userApi = new ApiClient();
    await userApi.login(env.userEmail, env.userPassword);
    const refused = await userApi.request('/reports/schedules', {
      method: 'POST',
      body: JSON.stringify({
        name: 'E2E zabranjeno',
        frequency: 'WEEKLY',
        sendTime: '07:00',
        organizationalUnitId: root.id,
        sections: ['kpi'],
        packKeys: [],
        recipientUserIds: [],
      }),
    });
    expect(refused.status).toBe(403);

    await api.request(`/reports/schedules/${created!.id}`, { method: 'DELETE' });
  });
});
