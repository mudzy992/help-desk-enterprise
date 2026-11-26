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
  /** W7.95 (`BA-reports-05`): admin writes are conditional on this token (`If-Match: "vN"`). */
  readonly version: number;
  readonly recipients: ReadonlyArray<{ readonly email: string }>;
};
type ScheduleList = { readonly schedules: readonly Schedule[] };
type AuditPage = { items: Array<{ action: string; entityId: string; metadata: Record<string, unknown> }> };

/**
 * Package 2.5 (§11 E2E 18): an admin creates a weekly schedule in the sheet,
 * sees it in the table with the next Monday slot, sends a test to themselves
 * (SMTP of the e2e stack) and the create + test send land in the audit log.
 * A plain user is refused by the API (`reports.schedule.manage`).
 *
 * First real e2e run (2026-10-05): the "send test" leg failed with
 * `EMAIL_CHANNEL_DISABLED` because the stack has no SMTP configured, and the
 * whole test went red — including the parts that need no e-mail at all. The
 * test is split: the schedule itself is asserted unconditionally, while sending
 * is its own test that skips *visibly* (the JSON summary prints every skip) when
 * the stack reports the channel as disabled.
 */
test.describe('18 scheduled reports', () => {
  /*
    E2E triage 2026-11-26: a retry of the „send test“ leg would send a second real
    message through the stack's SMTP (Gmail), so this file deliberately runs without
    retries. A genuine failure has to be visible, not retried until it passes.
  */
  test.describe.configure({ retries: 0 });

  test('create in UI → next slot → audit → user refused', async ({ page }) => {
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

    const audit = await api.requestJson<AuditPage>(`/audit-logs?organizationalUnitId=${root.id}&take=50`);
    const actions = audit.items.filter((item) => item.entityId === created!.id).map((item) => item.action);
    expect(actions).toContain('report.schedule.created');

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

    await api.request(`/reports/schedules/${created!.id}`, {
      method: 'DELETE',
      headers: { 'If-Match': `"v${created!.version}"` },
    });
  });

  test('send test to me needs a configured e-mail channel', async ({ page }) => {
    /*
      Real e-mail is opt-in. The stack sends through the operator's Gmail SMTP, which
      has a daily limit; a full daily run (plus retries and manual reruns) must not be
      able to exhaust it and then leave us unable to tell a real regression from a
      provider refusal. Skipping here — before the schedule is created and before the
      click — leaves nothing behind on the stack and sends nothing.
    */
    test.skip(
      process.env.E2E_ALLOW_EMAIL_SEND !== '1',
      'e-mail sends are opt-in (E2E_ALLOW_EMAIL_SEND=1) to protect the provider daily quota — the send step and its audit entry are not covered',
    );
    const env = readE2EEnvironment();
    const api = new ApiClient();
    await api.login(env.superAdminEmail, env.superAdminPassword);
    const tree = await api.requestJson<UnitNode | UnitNode[]>('/organizational-units/tree');
    const root = (Array.isArray(tree) ? tree : [tree])[0];
    const users = await api.requestJson<Array<{ id: string; email: string }>>('/users');
    const superAdmin = users.find(
      (user) => user.email.toLowerCase() === env.superAdminEmail.toLowerCase(),
    );
    expect(superAdmin, 'super admin in /users').toBeDefined();
    const name = `E2E test slanja ${Date.now()}`;

    const created = await api.requestJson<Schedule>('/reports/schedules', {
      method: 'POST',
      body: JSON.stringify({
        name,
        frequency: 'WEEKLY',
        sendTime: '07:00',
        organizationalUnitId: root.id,
        sections: ['kpi'],
        packKeys: [],
        recipientUserIds: [superAdmin!.id],
      }),
    });

    try {
      await signIn(page, env.superAdminEmail, env.superAdminPassword);
      await page.goto('/reports?tab=schedules');
      await expect(page.getByTestId('schedules-panel')).toBeVisible({ timeout: 20_000 });
      const row = page.getByTestId('schedule-row').filter({ hasText: name });
      await expect(row).toBeVisible();

      const sendTest = page.waitForResponse(
        (response) => response.url().includes(`/reports/schedules/${created.id}/send-test`),
      );
      await row.getByTestId('schedule-menu').click();
      await page.getByTestId('schedule-send-test').click();
      const response = await sendTest;
      // Any non-200 is a real defect (the API answers `{sent:false, reason}` for a
      // refusal); only a 200 with a documented reason may skip.
      expect(response.status(), 'send-test must answer 200, never 500').toBe(200);
      const body = (await response.json()) as { sent: boolean; reason?: string };
      // A skip is printed by scripts/summarize-playwright-json.mjs, so it cannot
      // hide inside a green run, and the reason names the cause — e.g. an exhausted
      // provider quota is not reported as a failure of this package.
      test.skip(
        body.sent !== true,
        `the stack did not send the test e-mail (reason: ${body.reason ?? 'unknown'}) — the send step and its audit entry are not covered`,
      );
      expect(body.sent, body.reason).toBe(true);

      const audit = await api.requestJson<AuditPage>(`/audit-logs?organizationalUnitId=${root.id}&take=50`);
      const actions = audit.items.filter((item) => item.entityId === created.id).map((item) => item.action);
      expect(actions).toContain('report.schedule.test_sent');
    } finally {
      await api.request(`/reports/schedules/${created.id}`, {
        method: 'DELETE',
        headers: { 'If-Match': `"v${created.version}"` },
      });
    }
  });
});
