import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { createTicketViaApi, loadSeedCatalog } from '../helpers/create-ticket';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

type TicketView = { readonly id: string; readonly ticketNumber: string; readonly originUnitId: string };
type TimeLog = {
  readonly id: string;
  readonly userId: string;
  readonly source: 'TIMER' | 'MANUAL';
  readonly stopReason: string | null;
  readonly durationSeconds: number | null;
  readonly endedAt: string | null;
  readonly correctedAt: string | null;
};
type Preview = { readonly rows: Array<Record<string, unknown>> };

function localInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Package 1.3: one running timer per agent (switch dialog), header indicator,
 * manual entry, correction with a reason, a status change that stops the
 * timer, and the "logged time" report pack.
 */
test.describe('14 time tracking guard', () => {
  test('start → switch → manual → correction → resolve stops timer → report', async ({ page }) => {
    const env = readE2EEnvironment();
    const adminApi = new ApiClient();
    await adminApi.login(env.superAdminEmail, env.superAdminPassword);
    const userApi = new ApiClient();
    await userApi.login(env.userEmail, env.userPassword);
    const catalog = await loadSeedCatalog(userApi);
    const stamp = Date.now();
    const create = (suffix: string) =>
      createTicketViaApi(userApi, {
        title: `E2E timer ${suffix} ${stamp}`,
        serviceId: catalog.serviceId,
        originUnitId: catalog.originUnitId,
        formVersionRef: catalog.formVersionRef,
      });
    const first = await create('A');
    const second = await create('B');
    const firstView = await adminApi.requestJson<TicketView>(`/tickets/${first.id}`);
    const secondView = await adminApi.requestJson<TicketView>(`/tickets/${second.id}`);

    await signIn(page, env.superAdminEmail, env.superAdminPassword);

    // T1 + T10: start on A; the header shows the running timer.
    await page.goto(`/tickets/${first.id}`);
    await page.getByTestId('tab-time').click();
    await page.getByTestId('time-start').click();
    await expect(page.getByTestId('active-timer-indicator')).toContainText(firstView.ticketNumber);

    // T1: starting on B asks to switch; confirming moves the timer.
    await page.goto(`/tickets/${second.id}`);
    await page.getByTestId('tab-time').click();
    await page.getByTestId('time-start').click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText(firstView.ticketNumber);
    await dialog.getByRole('button').last().click();
    await expect(page.getByTestId('active-timer-indicator')).toContainText(secondView.ticketNumber);
    const firstLogs = await adminApi.requestJson<TimeLog[]>(`/tickets/${first.id}/time-logs`);
    expect(firstLogs.every((log) => log.endedAt !== null)).toBe(true);
    await page.getByTestId('time-stop').click();
    await expect(page.getByTestId('active-timer-indicator')).toHaveCount(0);

    // T7: manual entry on A.
    const manualStart = new Date(Date.now() - 2 * 3600 * 1000);
    manualStart.setSeconds(0, 0);
    await page.goto(`/tickets/${first.id}`);
    await page.getByTestId('tab-time').click();
    await page.getByTestId('time-manual-open').click();
    await page.getByTestId('time-manual-start').fill(localInput(manualStart));
    await page.getByTestId('time-manual-minutes').fill('30');
    await page.getByTestId('time-manual-note').fill('E2E: telefonska podrška');
    await page.getByTestId('time-manual-save').click();
    await expect(page.getByTestId('time-log-row').first()).toBeVisible();
    let logs = await adminApi.requestJson<TimeLog[]>(`/tickets/${first.id}/time-logs`);
    const manual = logs.find((log) => log.source === 'MANUAL');
    expect(manual?.durationSeconds).toBe(1800);

    // T8: correction with a reason; the entry is marked as corrected.
    const manualRow = page.getByTestId('time-log-row').filter({ hasText: 'E2E: telefonska podrška' });
    await manualRow.getByTestId('time-log-edit').click();
    await page
      .getByTestId('time-edit-end')
      .fill(localInput(new Date(manualStart.getTime() + 20 * 60 * 1000)));
    await page.getByTestId('time-edit-reason').fill('E2E: kraći poziv');
    await page.getByTestId('time-edit-save').click();
    await expect.poll(async () => {
      logs = await adminApi.requestJson<TimeLog[]>(`/tickets/${first.id}/time-logs`);
      return logs.find((log) => log.id === manual?.id)?.durationSeconds;
    }).toBe(1200);
    expect(logs.find((log) => log.id === manual?.id)?.correctedAt).not.toBeNull();

    // T6: resolving the ticket stops its running timer.
    await adminApi.requestJson(`/tickets/${first.id}/time-logs/start`, {
      method: 'POST',
      body: JSON.stringify({ switchFromActive: true }),
    });
    await adminApi.requestJson(`/tickets/${first.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
    });
    const detail = await adminApi.requestJson<{
      closePolicy?: { allowedCodes: Array<{ key: string }> };
    }>(`/tickets/${first.id}`);
    await adminApi.requestJson(`/tickets/${first.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'RESOLVED',
        closeCode: detail.closePolicy?.allowedCodes[0]?.key ?? 'other',
        resolutionNote: 'E2E resolved',
      }),
    });
    logs = await adminApi.requestJson<TimeLog[]>(`/tickets/${first.id}/time-logs`);
    expect(logs.some((log) => log.stopReason === 'AUTO_TICKET_CLOSED')).toBe(true);
    expect(logs.every((log) => log.endedAt !== null)).toBe(true);

    // T9: the report pack carries the agent's rows (when the pack is enabled).
    const packs = await adminApi.requestJson<{ packs: Array<{ key: string }> }>('/reports/packs');
    test.skip(
      !packs.packs.some((pack) => pack.key === 'time_tracking'),
      'time_tracking nije uključen u private.reports.packsJson',
    );
    const scope = new URLSearchParams({
      organizationalUnitId: firstView.originUnitId,
      from: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
      to: new Date(Date.now() + 60 * 1000).toISOString(),
    });
    const preview = await adminApi.requestJson<Preview>(
      `/reports/packs/time-tracking/preview?${scope.toString()}`,
    );
    expect(preview.rows.some((row) => row.rowType === 'agent_total')).toBe(true);
    expect(preview.rows.some((row) => row.rowType === 'total')).toBe(true);
  });
});
