import { expect, test } from '@playwright/test';
import { expectNoSeriousA11yViolations } from '../helpers/a11y';
import { errorCode } from '../helpers/assets';
import { act, cancelIfOpen, fullNormalChange, futureWindow, loadChange, withChangeFixture, type ChangeDetail } from '../helpers/changes';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

type Approvals = { readonly round: number; readonly quorum: number; readonly approvals: number; readonly canVote: boolean; readonly isRequester: boolean };
type Events = { readonly items?: ReadonlyArray<{ action: string }> } | ReadonlyArray<{ action: string }>;

/**
 * 31 (paket 3.4): the change lifecycle across roles.
 *  - USER has no access (403).
 *  - SUPER_ADMIN requests a NORMAL change; requirements are enforced on the way
 *    to the CAB; the requester cannot vote; the CAB member (E2E agent with
 *    CHANGE_MANAGER) approves → SCHEDULED; start → finish (outcome) → REVIEW;
 *    closing needs review notes (PIR); CLOSED is final.
 *  - An EMERGENCY change goes straight to the CAB; a rejection needs a comment
 *    and rejects the change.
 *  - Register, calendar, templates and detail tabs pass axe.
 * Self-contained: switches the addon on, creates a temporary CAB group and
 * restores everything afterwards.
 */
test.describe('31 change lifecycle', () => {
  test.describe.configure({ timeout: 240_000 });

  test('request → assess → CAB → schedule → implement → review → close; emergency rejection', async ({ page }, testInfo) => {
    await withChangeFixture({}, async (fixture) => {
      const { admin, agent, user } = fixture;
      let change: ChangeDetail | null = null;
      let emergency: ChangeDetail | null = null;
      const reload = async () => (change = await loadChange(admin, change!.id));
      try {
        await test.step('USER has no access to the module', async () => {
          expect((await user.request('/changes')).status).toBe(403);
          const window = futureWindow(1);
          expect((await user.request(`/changes/calendar?from=${window.plannedStart}&to=${window.plannedEnd}`)).status).toBe(403);
        });

        await test.step('create a NORMAL change without plans (DRAFT)', async () => {
          const created = await admin.requestJson<ChangeDetail>('/changes', {
            method: 'POST',
            body: JSON.stringify({
              type: 'NORMAL',
              title: `E2E promjena glavna ${fixture.stamp}`,
              description: 'Nadogradnja servera aplikacije (E2E).',
              reason: 'Sigurnosne zakrpe dobavljača.',
              impact: 'HIGH',
              likelihood: 'MEDIUM',
              organizationalUnitId: fixture.unitId,
              serviceIds: [fixture.serviceId],
            }),
          });
          change = created;
          expect(created.status).toBe('DRAFT');
          expect(created.number).toMatch(/\d{6}$/);
          // Risk is computed: HIGH × MEDIUM = 6 → HIGH.
          expect(created.risk).toBe('HIGH');
        });

        await test.step('submit → ASSESSMENT; authorize needs plans, window and CAB', async () => {
          expect((await act(admin, change!, 'submit')).ok).toBe(true);
          expect((await reload()).status).toBe('ASSESSMENT');
          expect(await errorCode(await act(admin, change!, 'authorize'))).toBe('CHANGE_REQUIREMENT_MISSING');
          // A window that ends before it starts is rejected.
          const bad = await admin.request(`/changes/${change!.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ version: change!.version, plannedStart: futureWindow(5).plannedEnd, plannedEnd: futureWindow(5).plannedStart }),
          });
          expect(await errorCode(bad)).toBe('CHANGE_WINDOW_INVALID');
          const patch = await admin.request(`/changes/${change!.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              version: change!.version,
              implementationPlan: '1. Snapshot 2. Instalacija 3. Restart',
              backoutPlan: 'Vratiti snapshot.',
              testPlan: 'Prijava i osnovni scenariji.',
              cabGroupId: fixture.cabGroupId,
              ...futureWindow(5),
            }),
          });
          expect(patch.ok, await patch.clone().text()).toBe(true);
          await reload();
          // Optimistic locking.
          const stale = await admin.request(`/changes/${change!.id}`, { method: 'PATCH', body: JSON.stringify({ version: change!.version - 1, title: 'Zastarjela verzija' }) });
          expect(await errorCode(stale)).toBe('CHANGE_VERSION_CONFLICT');
          const authorize = await act(admin, change!, 'authorize', { acknowledgeConflicts: true });
          expect(authorize.ok, await authorize.clone().text()).toBe(true);
          expect((await reload()).status).toBe('AUTHORIZATION');
        });

        await test.step('the requester cannot vote; the CAB member approves → SCHEDULED', async () => {
          const own = await admin.requestJson<Approvals>(`/changes/${change!.id}/approvals`);
          expect(own).toMatchObject({ isRequester: true, canVote: false, quorum: 1, approvals: 0 });
          const selfVote = await admin.request(`/changes/${change!.id}/approvals`, { method: 'POST', body: JSON.stringify({ version: change!.version, decision: 'APPROVED' }) });
          expect(selfVote.ok).toBe(false);
          // Content is locked while the CAB votes.
          const locked = await admin.request(`/changes/${change!.id}`, { method: 'PATCH', body: JSON.stringify({ version: change!.version, title: 'Izmjena tokom glasanja' }) });
          expect(locked.ok).toBe(false);

          const overview = await agent.requestJson<Approvals>(`/changes/${change!.id}/approvals`);
          expect(overview.canVote).toBe(true);
          const vote = await agent.request(`/changes/${change!.id}/approvals`, {
            method: 'POST',
            body: JSON.stringify({ version: change!.version, decision: 'APPROVED', comment: 'Odobreno (E2E).' }),
          });
          expect(vote.ok, await vote.clone().text()).toBe(true);
          expect((await reload()).status).toBe('SCHEDULED');
          const again = await agent.request(`/changes/${change!.id}/approvals`, { method: 'POST', body: JSON.stringify({ version: change!.version, decision: 'APPROVED' }) });
          expect(again.ok).toBe(false);
        });

        await test.step('UI: register, calendar, templates and detail tabs pass axe', async () => {
          const env = readE2EEnvironment();
          await signIn(page, env.superAdminEmail, env.superAdminPassword);
          await page.goto('/changes');
          await expect(page.getByRole('link', { name: change!.number, exact: true })).toBeVisible({ timeout: 15_000 });
          await expectNoSeriousA11yViolations(page, 'changes-register', testInfo);

          await page.getByRole('tab', { name: /Kalendar|Calendar/ }).click();
          await expect(page.getByTestId('change-calendar')).toBeVisible({ timeout: 15_000 });
          await expectNoSeriousA11yViolations(page, 'changes-calendar', testInfo);

          await page.getByRole('tab', { name: /Šabloni|Templates/ }).click();
          await expect(page.getByTestId('change-templates')).toBeVisible({ timeout: 15_000 });
          await expectNoSeriousA11yViolations(page, 'changes-templates', testInfo);

          await page.goto(`/changes/${change!.id}`);
          await expect(page.getByRole('heading', { name: new RegExp(`E2E promjena glavna ${fixture.stamp}`) })).toBeVisible({ timeout: 15_000 });
          const tabs = page.getByRole('tab');
          const count = await tabs.count();
          for (let index = 0; index < count; index += 1) {
            await tabs.nth(index).click();
            await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
            await expectNoSeriousA11yViolations(page, `change-detail-tab-${index}`, testInfo);
          }
        });

        await test.step('start → finish with outcome → REVIEW', async () => {
          expect((await act(admin, change!, 'start')).ok).toBe(true);
          expect((await reload()).status).toBe('IMPLEMENTING');
          expect((await act(admin, change!, 'finish')).ok).toBe(false);
          await reload();
          const finish = await act(admin, change!, 'finish', { outcome: 'PARTIAL' });
          expect(finish.ok, await finish.clone().text()).toBe(true);
          expect((await reload()).status).toBe('REVIEW');
          expect(change!.outcome).toBe('PARTIAL');
        });

        await test.step('closing needs review notes; CLOSED is final', async () => {
          expect((await act(admin, change!, 'close')).ok).toBe(false);
          await reload();
          const close = await act(admin, change!, 'close', { reviewNotes: 'Djelimično: jedan čvor ostaje za sljedeći prozor. Lekcija: duži prozor.' });
          expect(close.ok, await close.clone().text()).toBe(true);
          expect((await reload()).status).toBe('CLOSED');
          expect(change!.allowedActions).toEqual([]);
          expect((await act(admin, change!, 'cancel', { reason: 'Pokušaj nakon zatvaranja.' })).ok).toBe(false);
          const events = await admin.requestJson<Events>(`/changes/${change!.id}/events`);
          const list = Array.isArray(events) ? events : ((events as { items?: ReadonlyArray<{ action: string }> }).items ?? []);
          expect(list.length).toBeGreaterThanOrEqual(6);
        });

        await test.step('EMERGENCY goes straight to the CAB; a rejection needs a comment', async () => {
          emergency = await admin.requestJson<ChangeDetail>('/changes', {
            method: 'POST',
            body: JSON.stringify(fullNormalChange(fixture, 'hitna', futureWindow(2, 18, 19), { type: 'EMERGENCY' })),
          });
          const submit = await act(admin, emergency, 'submit', { acknowledgeConflicts: true });
          expect(submit.ok, await submit.clone().text()).toBe(true);
          emergency = await loadChange(admin, emergency.id);
          expect(emergency.status).toBe('AUTHORIZATION');
          const bare = await agent.request(`/changes/${emergency.id}/approvals`, { method: 'POST', body: JSON.stringify({ version: emergency.version, decision: 'REJECTED' }) });
          expect(bare.ok).toBe(false);
          const reject = await agent.request(`/changes/${emergency.id}/approvals`, {
            method: 'POST',
            body: JSON.stringify({ version: emergency.version, decision: 'REJECTED', comment: 'Rizik nije opravdan (E2E).' }),
          });
          expect(reject.ok, await reject.clone().text()).toBe(true);
          emergency = await loadChange(admin, emergency.id);
          expect(emergency.status).toBe('REJECTED');
        });
      } finally {
        await cancelIfOpen(admin, change === null ? null : (change as ChangeDetail).id);
        await cancelIfOpen(admin, emergency === null ? null : (emergency as ChangeDetail).id);
      }
    });
  });
});
