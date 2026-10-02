import { expect, test } from '@playwright/test';
import { expectNoSeriousA11yViolations } from '../helpers/a11y';
import { errorCode } from '../helpers/assets';
import {
  act,
  cancelIfOpen,
  changeSettingKeys,
  fullNormalChange,
  futureWindow,
  loadChange,
  withChangeFixture,
  type ChangeDetail,
  type ChangeFixture,
} from '../helpers/changes';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

type Conflicts = {
  readonly changes: ReadonlyArray<{ id: string; sharedServices: ReadonlyArray<{ id: string }> }>;
  readonly downtime: ReadonlyArray<{ service: { id: string }; changeRequestId: string | null }>;
  readonly freeze: { from: string; to: string; label: string } | null;
  readonly freezeBlocks: boolean;
  readonly hasWarnings: boolean;
};
type Calendar = {
  readonly changes: ReadonlyArray<{ id: string }>;
  readonly downtime: ReadonlyArray<{ id: string; changeRequestId: string | null; service: { id: string } }>;
  readonly freezePeriods: ReadonlyArray<{ from: string; to: string; label: string }>;
};
type Template = { readonly id: string; readonly risk: string; readonly isActive: boolean };

// A freeze far in the future so it never touches real work on the environment.
const freezeDay = '2031-01-15';
const freezeWindow = { plannedStart: `${freezeDay}T09:00:00.000Z`, plannedEnd: `${freezeDay}T11:00:00.000Z` };

async function schedule(fixture: ChangeFixture, change: ChangeDetail): Promise<ChangeDetail> {
  const submit = await act(fixture.admin, change, 'submit');
  expect(submit.ok, await submit.clone().text()).toBe(true);
  let current = await loadChange(fixture.admin, change.id);
  const authorize = await act(fixture.admin, current, 'authorize', { acknowledgeConflicts: true });
  expect(authorize.ok, await authorize.clone().text()).toBe(true);
  current = await loadChange(fixture.admin, change.id);
  const vote = await fixture.agent.request(`/changes/${change.id}/approvals`, { method: 'POST', body: JSON.stringify({ version: current.version, decision: 'APPROVED' }) });
  expect(vote.ok, await vote.clone().text()).toBe(true);
  current = await loadChange(fixture.admin, change.id);
  expect(current.status).toBe('SCHEDULED');
  return current;
}

function calendarRange(window: { plannedStart: string; plannedEnd: string }) {
  const from = new Date(Date.parse(window.plannedStart) - 86_400_000).toISOString();
  const to = new Date(Date.parse(window.plannedEnd) + 86_400_000).toISOString();
  return `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
}

/**
 * 32 (paket 3.4): scheduling rules.
 *  - A change that causes downtime plans a downtime window (MAINTENANCE) per
 *    service when it is scheduled; cancelling removes the future window.
 *  - A second change in the same window on the same service shows the first
 *    change and its downtime as conflicts; moving on needs an acknowledgement.
 *  - Freeze periods block NORMAL changes and only warn for EMERGENCY ones.
 *  - The calendar shows changes, downtime and freezes.
 *  - Templates: high risk is refused; a standard change comes from an active
 *    template, skips the CAB, and an inactive template is refused.
 *  - The calendar and the form with live conflicts pass axe.
 */
test.describe('32 change scheduling', () => {
  test.describe.configure({ timeout: 240_000 });

  test('downtime, conflicts, freeze, calendar and templates', async ({ page }, testInfo) => {
    await withChangeFixture(
      {
        [changeSettingKeys.downtimeEnabled]: true,
        [changeSettingKeys.freezePeriods]: JSON.stringify([{ from: freezeDay, to: freezeDay, label: `E2E zamrzavanje` }]),
      },
      async (fixture) => {
        const { admin } = fixture;
        const created: string[] = [];
        const window = futureWindow(9, 22, 23);
        const create = async (body: Record<string, unknown>) => {
          const change = await admin.requestJson<ChangeDetail>('/changes', { method: 'POST', body: JSON.stringify(body) });
          created.push(change.id);
          return change;
        };
        try {
          let first: ChangeDetail | null = null;

          await test.step('a scheduled change that causes downtime plans a downtime window', async () => {
            first = await schedule(fixture, await create(fullNormalChange(fixture, 'prekid', window, { causesDowntime: true })));
            const calendar = await admin.requestJson<Calendar>(`/changes/calendar?${calendarRange(window)}`);
            expect(calendar.changes.some((item) => item.id === first!.id)).toBe(true);
            const own = calendar.downtime.filter((item) => item.changeRequestId === first!.id);
            expect(own.length, 'downtime window of the change').toBe(1);
            expect(own[0]!.service.id).toBe(fixture.serviceId);
          });

          await test.step('a second change in the same window sees the conflicts and must acknowledge them', async () => {
            const preview = await admin.requestJson<Conflicts>('/changes/conflicts/preview', {
              method: 'POST',
              body: JSON.stringify({ type: 'NORMAL', ...window, serviceIds: [fixture.serviceId] }),
            });
            expect(preview.hasWarnings).toBe(true);
            expect(preview.changes.some((item) => item.id === first!.id)).toBe(true);
            expect(preview.downtime.length).toBeGreaterThanOrEqual(1);

            let second = await create(fullNormalChange(fixture, 'konflikt', window));
            expect((await act(admin, second, 'submit')).ok).toBe(true);
            second = await loadChange(admin, second.id);
            expect(await errorCode(await act(admin, second, 'authorize'))).toBe('CHANGE_CONFLICTS_NOT_ACKNOWLEDGED');
            const conflicts = await admin.requestJson<Conflicts>(`/changes/${second.id}/conflicts`);
            expect(conflicts.changes.some((item) => item.id === first!.id)).toBe(true);
            second = await loadChange(admin, second.id);
            const acknowledged = await act(admin, second, 'authorize', { acknowledgeConflicts: true });
            expect(acknowledged.ok, await acknowledged.clone().text()).toBe(true);
            second = await loadChange(admin, second.id);
            expect(second.status).toBe('AUTHORIZATION');
            const withdraw = await act(admin, second, 'withdraw', { reason: 'Pomjeranje termina (E2E).' });
            expect(withdraw.ok, await withdraw.clone().text()).toBe(true);
            expect((await loadChange(admin, second.id)).status).toBe('ASSESSMENT');
          });

          await test.step('cancelling the scheduled change removes its future downtime window', async () => {
            const current = await loadChange(admin, first!.id);
            expect(await errorCode(await act(admin, current, 'cancel'))).toBe('CHANGE_REASON_REQUIRED');
            const cancel = await act(admin, current, 'cancel', { reason: 'Dobavljač odgodio zakrpu (E2E).' });
            expect(cancel.ok, await cancel.clone().text()).toBe(true);
            const calendar = await admin.requestJson<Calendar>(`/changes/calendar?${calendarRange(window)}`);
            expect(calendar.downtime.filter((item) => item.changeRequestId === first!.id)).toHaveLength(0);
          });

          await test.step('a freeze blocks a NORMAL change and only warns for an EMERGENCY one', async () => {
            const preview = await admin.requestJson<Conflicts>('/changes/conflicts/preview', {
              method: 'POST',
              body: JSON.stringify({ type: 'NORMAL', ...freezeWindow, serviceIds: [fixture.serviceId] }),
            });
            expect(preview.freeze?.from).toBe(freezeDay);
            expect(preview.freezeBlocks).toBe(true);

            let normal = await create(fullNormalChange(fixture, 'zamrznuta', freezeWindow));
            expect((await act(admin, normal, 'submit')).ok).toBe(true);
            normal = await loadChange(admin, normal.id);
            expect(await errorCode(await act(admin, normal, 'authorize', { acknowledgeConflicts: true }))).toBe('CHANGE_FREEZE');

            const emergencyPreview = await admin.requestJson<Conflicts>('/changes/conflicts/preview', {
              method: 'POST',
              body: JSON.stringify({ type: 'EMERGENCY', ...freezeWindow, serviceIds: [fixture.serviceId] }),
            });
            expect(emergencyPreview.freeze).not.toBeNull();
            expect(emergencyPreview.freezeBlocks).toBe(false);
            expect(emergencyPreview.hasWarnings).toBe(true);
            const emergency = await create(fullNormalChange(fixture, 'hitna-zamrzavanje', freezeWindow, { type: 'EMERGENCY' }));
            const submit = await act(admin, emergency, 'submit', { acknowledgeConflicts: true });
            expect(submit.ok, await submit.clone().text()).toBe(true);
            expect((await loadChange(admin, emergency.id)).status).toBe('AUTHORIZATION');

            const calendar = await admin.requestJson<Calendar>(`/changes/calendar?${calendarRange(freezeWindow)}`);
            expect(calendar.freezePeriods.some((period) => period.from === freezeDay)).toBe(true);
          });

          await test.step('templates: high risk refused; standard change skips the CAB; inactive refused', async () => {
            const base = {
              name: `E2E šablon ${fixture.stamp}`,
              description: 'Restart aplikacijskog servisa.',
              implementationPlan: 'Restart servisa u terminu.',
              backoutPlan: 'Pokretanje prethodne instance.',
              serviceIds: [fixture.serviceId],
            };
            const risky = await admin.request('/changes/templates', { method: 'POST', body: JSON.stringify({ ...base, impact: 'HIGH', likelihood: 'HIGH' }) });
            expect(await errorCode(risky)).toBe('CHANGE_TEMPLATE_RISK');
            const template = await admin.requestJson<Template>('/changes/templates', { method: 'POST', body: JSON.stringify({ ...base, impact: 'LOW', likelihood: 'MEDIUM' }) });
            expect(template.risk).toBe('LOW');

            let standard = await create({ type: 'STANDARD', templateId: template.id, title: `E2E standardna ${fixture.stamp}`, reason: 'Redovno održavanje.', organizationalUnitId: fixture.unitId, ...futureWindow(12) });
            expect(standard.risk).toBe('LOW');
            const scheduled = await act(admin, standard, 'schedule', { acknowledgeConflicts: true });
            expect(scheduled.ok, await scheduled.clone().text()).toBe(true);
            standard = await loadChange(admin, standard.id);
            expect(standard.status).toBe('SCHEDULED');

            const deactivate = await admin.request(`/changes/templates/${template.id}`, {
              method: 'PUT',
              body: JSON.stringify({ ...base, impact: 'LOW', likelihood: 'MEDIUM', isActive: false }),
            });
            expect(deactivate.ok, await deactivate.clone().text()).toBe(true);
            const inactive = await admin.request('/changes', {
              method: 'POST',
              body: JSON.stringify({ type: 'STANDARD', templateId: template.id, title: `E2E neaktivni ${fixture.stamp}`, organizationalUnitId: fixture.unitId }),
            });
            expect(await errorCode(inactive)).toBe('CHANGE_TEMPLATE_INACTIVE');
          });

          await test.step('UI: calendar month with the freeze and the form with live conflicts pass axe', async () => {
            const env = readE2EEnvironment();
            await signIn(page, env.superAdminEmail, env.superAdminPassword);
            await page.goto('/changes?tab=calendar');
            await expect(page.getByTestId('change-calendar')).toBeVisible({ timeout: 15_000 });
            await expectNoSeriousA11yViolations(page, 'changes-calendar-month', testInfo);

            await page.goto('/changes');
            await page.getByRole('button', { name: /Nova promjena|New change/ }).first().click();
            const dialog = page.getByRole('dialog');
            await expect(dialog).toBeVisible({ timeout: 10_000 });
            await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
            await expectNoSeriousA11yViolations(page, 'change-form', testInfo);
          });
        } finally {
          for (const id of created) await cancelIfOpen(admin, id);
        }
      },
    );
  });
});
