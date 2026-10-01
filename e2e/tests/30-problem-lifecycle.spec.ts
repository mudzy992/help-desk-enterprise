import { expect, test } from '@playwright/test';
import { expectNoSeriousA11yViolations } from '../helpers/a11y';
import { ApiClient } from '../helpers/api-client';
import { errorCode, firstUnit, uniqueStamp } from '../helpers/assets';
import { createTicketViaApi, loadSeedCatalog } from '../helpers/create-ticket';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

type Capabilities = { readonly enabled: boolean; readonly canRead: boolean; readonly canReport: boolean; readonly canManage: boolean; readonly canClose: boolean };
type Options = { readonly groups: ReadonlyArray<{ id: string; name: string }>; readonly rootCauseCategories: readonly string[] };
type Problem = {
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly status: string;
  readonly version: number;
  readonly ticketCount: number;
  readonly rootCause: string | null;
  readonly owner: { id: string } | null;
  readonly organizationalUnit: { id: string };
  readonly allowedTransitions: readonly string[];
};
type Resolution = { readonly resolved: readonly unknown[]; readonly skipped: readonly unknown[]; readonly failed: readonly unknown[] };
type Preview = {
  readonly resolvable: number;
  readonly closeCodes: { readonly required: boolean; readonly codes: ReadonlyArray<{ key: string }> };
};
type Event = { readonly action: string; readonly detail?: Record<string, unknown> | null };
type Ticket = { readonly id: string; readonly status: string };

/**
 * 30 (paket 3.3): the full problem lifecycle across roles.
 *  - USER has no access to the module (403 on the API, hidden problem panel).
 *  - AGENT can read and report but cannot edit the analysis.
 *  - SUPER_ADMIN creates a problem from tickets, claims it, goes through
 *    INVESTIGATING → KNOWN_ERROR → RESOLVED with group resolution of the linked
 *    tickets, sees the recurrence when a new ticket is linked after resolution,
 *    and closes it. Requirements (owner, root cause, reason) are enforced.
 *  - Register, detail tabs and the problem panel pass axe.
 * Skips when the module is off (addon off or no problem group).
 */
test.describe('30 problem lifecycle', () => {
  test.describe.configure({ timeout: 180_000 });

  test('report → investigate → known error → resolve tickets → recurrence → close', async ({ page }, testInfo) => {
    const env = readE2EEnvironment();
    const admin = new ApiClient();
    await admin.login(env.superAdminEmail, env.superAdminPassword);
    const capabilities = await admin.requestJson<Capabilities>('/problems/capabilities');
    test.skip(!capabilities.enabled, 'Problem module is off on this environment.');
    expect(capabilities).toMatchObject({ canRead: true, canReport: true, canManage: true, canClose: true });

    const options = await admin.requestJson<Options>('/problems/options');
    const group = options.groups[0];
    expect(group, 'a problem group').toBeTruthy();
    const category = options.rootCauseCategories[0];
    expect(category, 'a root cause category').toBeTruthy();

    const stamp = uniqueStamp();
    const user = new ApiClient();
    await user.login(env.userEmail, env.userPassword);
    const catalog = await loadSeedCatalog(user);
    const ticketInput = (label: string) => ({ title: `E2E problem ${label} ${stamp}`, serviceId: catalog.serviceId, formVersionRef: catalog.formVersionRef });
    const first = await createTicketViaApi(user, ticketInput('A'));
    const second = await createTicketViaApi(user, ticketInput('B'));

    let problem: Problem | null = null;
    const reload = async () => {
      problem = await admin.requestJson<Problem>(`/problems/${problem!.id}`);
      return problem;
    };
    const setStatus = (status: string, extra: Record<string, unknown> = {}) =>
      admin.request(`/problems/${problem!.id}/status`, { method: 'POST', body: JSON.stringify({ version: problem!.version, status, ...extra }) });

    try {
      await test.step('USER has no access to the module', async () => {
        expect((await user.request('/problems')).status).toBe(403);
        // The ticket page asks every viewer; without problem.read the panel is hidden (200, visible=false), never leaking data.
        const panel = await user.request(`/problems/tickets/${first.id}`);
        expect(panel.status).toBe(200);
        expect(await panel.json()).toMatchObject({ visible: false, canLink: false, problem: null });
      });

      await test.step('create the problem from two tickets', async () => {
        const created = await admin.requestJson<Problem & { ticketLinks: { linked: readonly unknown[] } | null }>('/problems', {
          method: 'POST',
          body: JSON.stringify({
            title: `E2E problem ${stamp}`,
            description: 'Isti kvar na više radnih stanica (E2E).',
            impact: 'HIGH',
            urgency: 'HIGH',
            groupId: group.id,
            ticketIds: [first.id, second.id],
          }),
        });
        problem = created;
        expect(created.status).toBe('NEW');
        expect(created.number).toMatch(/\d+$/);
        expect(created.ticketLinks?.linked).toHaveLength(2);
        expect((await reload()).ticketCount).toBe(2);
      });

      await test.step('a ticket belongs to one problem only', async () => {
        const other = await admin.request('/problems', {
          method: 'POST',
          // No tickets here, so the unit is explicit (the E2E admin has no home unit).
          body: JSON.stringify({ title: `E2E duplicate ${stamp}`, description: 'x', groupId: group.id, organizationalUnitId: problem!.organizationalUnit.id }),
        });
        expect(other.status, await other.clone().text()).toBe(201);
        const duplicate = (await other.json()) as Problem;
        const link = await admin.request(`/problems/${duplicate.id}/tickets`, { method: 'POST', body: JSON.stringify({ ticketIds: [first.id] }) });
        expect(await errorCode(link)).toBe('PROBLEM_TICKET_IN_OTHER_PROBLEM');
        await admin.request(`/problems/${duplicate.id}/status`, {
          method: 'POST',
          body: JSON.stringify({ version: duplicate.version, status: 'CANCELLED', reason: 'E2E duplikat, otkazano.' }),
        });
      });

      await test.step('AGENT reads but cannot edit the analysis', async () => {
        const agent = new ApiClient();
        await agent.login(env.agentEmail, env.agentPassword);
        const agentCapabilities = await agent.requestJson<Capabilities>('/problems/capabilities');
        expect(agentCapabilities.canManage).toBe(false);
        expect(agentCapabilities.canClose).toBe(false);
        const edit = await agent.request(`/problems/${problem!.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ version: problem!.version, rootCause: 'Agent ne smije ovo upisati.' }),
        });
        expect(edit.ok).toBe(false);
        expect((await reload()).rootCause).toBeNull();
      });

      await test.step('INVESTIGATING needs an owner; claim provides it', async () => {
        const early = await setStatus('INVESTIGATING');
        expect(await errorCode(early)).toBe('PROBLEM_REQUIREMENT_MISSING');
        expect((await admin.request(`/problems/${problem!.id}/claim`, { method: 'POST' })).ok).toBe(true);
        expect((await reload()).owner).not.toBeNull();
        expect((await setStatus('INVESTIGATING')).ok).toBe(true);
        expect((await reload()).status).toBe('INVESTIGATING');
      });

      await test.step('KNOWN_ERROR needs the root cause and its category', async () => {
        expect(await errorCode(await setStatus('KNOWN_ERROR'))).toBe('PROBLEM_REQUIREMENT_MISSING');
        const analysis = await admin.request(`/problems/${problem!.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            version: problem!.version,
            rootCause: 'Neispravan drajver mrežne kartice nakon ažuriranja.',
            rootCauseCategory: category,
            rcaWhys: [{ question: 'Zašto pada mreža?', answer: 'Drajver se ruši.' }],
            workaround: 'Vratiti prethodnu verziju drajvera.',
          }),
        });
        expect(analysis.ok, await analysis.clone().text()).toBe(true);
        await reload();
        // Optimistic locking: a stale version is rejected.
        const stale = await admin.request(`/problems/${problem!.id}`, { method: 'PATCH', body: JSON.stringify({ version: problem!.version - 1, title: 'x'.repeat(5) }) });
        expect(await errorCode(stale)).toBe('PROBLEM_VERSION_CONFLICT');
        expect((await setStatus('KNOWN_ERROR')).ok).toBe(true);
        expect((await reload()).status).toBe('KNOWN_ERROR');
      });

      await test.step('UI: register, detail tabs and the ticket panel pass axe', async () => {
        await signIn(page, env.superAdminEmail, env.superAdminPassword);
        await page.goto('/problems');
        // The register links the number; the title is plain text in the next cell.
        await expect(page.getByRole('link', { name: problem!.number, exact: true })).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText(`E2E problem ${stamp}`, { exact: true })).toBeVisible();
        await expectNoSeriousA11yViolations(page, 'problems-register', testInfo);

        await page.goto(`/problems/${problem!.id}`);
        await expect(page.getByRole('heading', { name: new RegExp(`E2E problem ${stamp}`) })).toBeVisible({ timeout: 15_000 });
        for (const [tab, name] of [
          ['analysis', /Analiza|Analysis/],
          ['tickets', /Tiketi|Tickets/],
          ['links', /Veze|Links/],
          ['history', /Historija|History/],
        ] as const) {
          await page.getByRole('tab', { name }).click();
          await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
          await expectNoSeriousA11yViolations(page, `problem-detail-${tab}`, testInfo);
        }

        await page.goto(`/tickets/${first.id}`);
        await expect(page.getByText(problem!.number).first()).toBeVisible({ timeout: 15_000 });
        await expectNoSeriousA11yViolations(page, 'ticket-with-problem', testInfo);
      });

      await test.step('RESOLVED needs a resolution and resolves the open tickets', async () => {
        expect(await errorCode(await setStatus('RESOLVED'))).toBe('PROBLEM_REQUIREMENT_MISSING');
        expect(
          (await admin.request(`/problems/${problem!.id}`, { method: 'PATCH', body: JSON.stringify({ version: problem!.version, resolution: 'Drajver zamijenjen na svim stanicama.' }) })).ok,
        ).toBe(true);
        await reload();
        const preview = await admin.requestJson<Preview>(`/problems/${problem!.id}/resolve-preview`);
        expect(preview.resolvable).toBe(2);
        const closeCode = preview.closeCodes.required ? preview.closeCodes.codes[0]?.key : undefined;
        // A too short message is rejected before anything changes.
        expect(await errorCode(await setStatus('RESOLVED', { resolveTickets: true, message: 'x', closeCode }))).toBe('PROBLEM_VALIDATION');
        expect((await reload()).status).toBe('KNOWN_ERROR');

        const resolved = await setStatus('RESOLVED', { resolveTickets: true, message: 'Uzrok je otklonjen, molimo potvrdite (E2E).', closeCode });
        expect(resolved.ok, await resolved.clone().text()).toBe(true);
        const body = (await resolved.json()) as Problem & { ticketResolution: Resolution };
        expect(body.status).toBe('RESOLVED');
        expect(body.ticketResolution.resolved).toHaveLength(2);
        expect(body.ticketResolution.failed).toHaveLength(0);
        for (const ticket of [first, second]) {
          expect((await admin.requestJson<Ticket>(`/tickets/${ticket.id}`)).status).toBe('RESOLVED');
        }
        await reload();
      });

      await test.step('a ticket linked after resolution is recorded as recurrence', async () => {
        const third = await createTicketViaApi(user, ticketInput('C'));
        const link = await admin.request(`/problems/${problem!.id}/tickets`, { method: 'POST', body: JSON.stringify({ ticketIds: [third.id] }) });
        expect(link.ok, await link.clone().text()).toBe(true);
        const events = await admin.requestJson<{ items: readonly Event[] } | readonly Event[]>(`/problems/${problem!.id}/events`);
        const list = Array.isArray(events) ? events : (events as { items: readonly Event[] }).items;
        expect(list.some((event) => event.action === 'ticket_linked' && event.detail?.recurrence === true)).toBe(true);

        const unit = await firstUnit(admin);
        const packs = await admin.requestJson<{ packs: ReadonlyArray<{ key: string; slug: string }> }>(`/reports/packs?organizationalUnitId=${unit.id}`);
        const recurrence = packs.packs.find((pack) => pack.key === 'problem_recurrence');
        if (recurrence !== undefined) {
          const report = await admin.requestJson<{ rows?: ReadonlyArray<Record<string, unknown>> }>(
            `/reports/packs/${recurrence.slug}/preview?organizationalUnitId=${unit.id}`,
          );
          // The problem may sit outside the first unit; only check when it is in scope.
          const row = report.rows?.find((item) => item.problemNumber === problem!.number);
          if (row !== undefined) expect(row.recurrenceTickets).toBeGreaterThanOrEqual(1);
        }
      });

      await test.step('CLOSED is final', async () => {
        await reload();
        expect((await setStatus('CLOSED')).ok).toBe(true);
        expect((await reload()).status).toBe('CLOSED');
        expect(problem!.allowedTransitions).toEqual([]);
        expect(await errorCode(await setStatus('INVESTIGATING', { reason: 'Pokušaj ponovnog otvaranja.' }))).toMatch(/PROBLEM_(STATUS_TRANSITION|FINAL_STATUS)/);
      });
    } finally {
      // Leave nothing open: cancel the problem if a step failed midway.
      if (problem !== null) {
        const current = await admin.requestJson<Problem>(`/problems/${(problem as Problem).id}`).catch(() => null);
        if (current !== null && ['NEW', 'INVESTIGATING', 'KNOWN_ERROR'].includes(current.status)) {
          await admin.request(`/problems/${current.id}/status`, {
            method: 'POST',
            body: JSON.stringify({ version: current.version, status: 'CANCELLED', reason: 'E2E čišćenje nakon greške.' }),
          });
        }
      }
    }
  });
});
