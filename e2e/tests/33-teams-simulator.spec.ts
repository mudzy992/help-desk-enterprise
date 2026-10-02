import { expect, test } from '@playwright/test';
import { expectNoSeriousA11yViolations } from '../helpers/a11y';
import { ApiClient } from '../helpers/api-client';
import { uniqueStamp, withSettings } from '../helpers/assets';
import { createOfferedService } from '../helpers/create-ticket';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

const teamsSettings = {
  addon: 'private.addons.teams',
  mode: 'private.integrations.teams.mode',
  personalEnabled: 'private.integrations.teams.personalEnabled',
  ticketCreateEnabled: 'private.integrations.teams.ticketCreateEnabled',
  actionsEnabled: 'private.integrations.teams.actionsEnabled',
} as const;

const teamsDefaults: Readonly<Record<string, unknown>> = {
  [teamsSettings.addon]: false,
  [teamsSettings.mode]: 'simulator',
  [teamsSettings.personalEnabled]: true,
  [teamsSettings.ticketCreateEnabled]: true,
  [teamsSettings.actionsEnabled]: true,
};

type SimulatorResult = { conversationId: string; status: number; response: Record<string, unknown> | null };
type Transcript = { items: Array<{ direction: 'INBOUND' | 'OUTBOUND'; payload: Record<string, unknown> }> };
type TicketRow = { id: string; ticketNumber: string; title: string; requesterId?: string };
type MessageRow = { body: string; source?: string; type: string };

/** Activity sent through the server-side signed simulator (same path as Teams). */
async function simulate(admin: ApiClient, body: Record<string, unknown>): Promise<SimulatorResult> {
  return admin.requestJson<SimulatorResult>('/integrations/teams/admin/simulator/activities', { method: 'POST', body: JSON.stringify(body) });
}

/** Everything the bot wrote to the user's personal chat, as one string. */
async function botTranscript(admin: ApiClient, userId: string): Promise<string> {
  const transcript = await admin.requestJson<Transcript>(`/integrations/teams/admin/simulator/messages?userId=${encodeURIComponent(userId)}&scope=personal&limit=100`);
  return JSON.stringify(transcript.items.filter((item) => item.direction === 'OUTBOUND').map((item) => item.payload));
}

/**
 * 33 (paket 3.1): Microsoft Teams connector in simulator mode — no Microsoft
 * resources. Covers the whole personal-chat flow through the signed simulator:
 *  - status/readiness report simulator mode as ready;
 *  - install → welcome, `pomoć` → command list;
 *  - ticket creation from the Teams form (service without required fields),
 *    the ticket belongs to the Teams user and shows in `moji tiketi`;
 *  - a requester reply from a card lands on the ticket with source TEAMS;
 *  - creation is refused while `ticketCreateEnabled` is off;
 *  - only `integrations.teams.manage` reaches the admin API; `/me` shows the link;
 *  - the package needs a Bot App ID; the admin page and simulator pass axe.
 */
test.describe('33 teams simulator', () => {
  test.describe.configure({ timeout: 240_000 });

  test('simulated personal chat, ticket creation, reply and admin page', async ({ page }, testInfo) => {
    const env = readE2EEnvironment();
    const admin = new ApiClient();
    await admin.login(env.superAdminEmail, env.superAdminPassword);
    const stamp = uniqueStamp();

    await withSettings(
      admin,
      {
        [teamsSettings.addon]: true,
        [teamsSettings.mode]: 'simulator',
        [teamsSettings.personalEnabled]: true,
        [teamsSettings.ticketCreateEnabled]: true,
        [teamsSettings.actionsEnabled]: true,
      },
      `E2E 3.1 ${stamp}`,
      async () => {
        // Status and readiness: simulator needs TEAMS_SIMULATOR_SECRET on the backend.
        const status = await admin.requestJson<{ mode: string; simulatorAvailable: boolean }>('/integrations/teams/admin/status');
        expect(status.mode, 'effective mode (is TEAMS_SIMULATOR_SECRET set, ≥ 32 characters?)').toBe('simulator');
        expect(status.simulatorAvailable).toBe(true);
        const readiness = await admin.requestJson<{ ready: boolean; checks: Array<{ key: string; ok: boolean }> }>('/integrations/teams/admin/readiness', { method: 'POST' });
        expect(readiness.checks.find((check) => check.key === 'addon')?.ok).toBe(true);
        expect(readiness.checks.find((check) => check.key === 'simulatorSecret')?.ok).toBe(true);

        const users = await admin.requestJson<Array<{ id: string; email: string }>>('/users');
        const requester = users.find((item) => item.email.toLowerCase() === env.userEmail.toLowerCase());
        expect(requester, `E2E user ${env.userEmail}`).toBeTruthy();
        const userId = requester!.id;
        const userApi = new ApiClient();
        await userApi.login(env.userEmail, env.userPassword);

        // Install → welcome; help → command list.
        expect((await simulate(admin, { kind: 'install', userId, scope: 'personal' })).status).toBe(200);
        await expect.poll(() => botTranscript(admin, userId), { timeout: 15_000 }).toMatch(/Dobro došli|Welcome/);
        expect((await simulate(admin, { kind: 'message', userId, scope: 'personal', text: 'pomoć' })).status).toBe(200);
        await expect.poll(() => botTranscript(admin, userId), { timeout: 15_000 }).toMatch(/Šta mogu uraditi|What I can do/);

        // Ticket from the Teams form, on a fresh service without required fields.
        const service = await createOfferedService(admin, { label: 'Teams' });
        const title = `E2E Teams tiket ${stamp}`;
        const created = await simulate(admin, {
          kind: 'action',
          userId,
          scope: 'personal',
          verb: 'ticket.create',
          data: { serviceId: service.id, title, description: 'Prijavljeno iz Teams simulatora.', impact: 'HIGH', urgency: 'LOW' },
        });
        expect(created.status).toBe(200);
        expect(JSON.stringify(created.response)).toMatch(/kreiran|was created/);
        const list = await userApi.requestJson<{ items: TicketRow[] }>(`/tickets?serviceId=${encodeURIComponent(service.id)}`);
        const ticket = list.items.find((item) => item.title === title);
        expect(ticket, 'ticket created from Teams is visible to its requester').toBeTruthy();
        expect(JSON.stringify(created.response)).toContain(ticket!.ticketNumber);

        // „moji tiketi“ lists it.
        await simulate(admin, { kind: 'message', userId, scope: 'personal', text: 'moji tiketi' });
        await expect.poll(() => botTranscript(admin, userId), { timeout: 15_000 }).toContain(ticket!.ticketNumber);

        // A requester reply from a card is stored as a Teams message.
        const replyText = `Odgovor iz Teamsa ${stamp}`;
        const replied = await simulate(admin, { kind: 'action', userId, scope: 'personal', verb: 'ticket.reply', data: { ticketId: ticket!.id, text: replyText } });
        expect(JSON.stringify(replied.response)).toMatch(/Odgovor je poslan|Reply sent/);
        const messages = await userApi.requestJson<MessageRow[] | { items: MessageRow[] }>(`/tickets/${ticket!.id}/messages`);
        const rows = Array.isArray(messages) ? messages : messages.items;
        const stored = rows.find((row) => row.body === replyText);
        expect(stored, 'reply stored on the ticket').toBeTruthy();
        expect(stored!.source).toBe('TEAMS');
        expect(stored!.type).toBe('USER_REPLY');

        // Creation off → refused, nothing created.
        await withSettings(admin, { [teamsSettings.ticketCreateEnabled]: false }, `E2E 3.1 ${stamp} create off`, async () => {
          const refused = await simulate(admin, {
            kind: 'action',
            userId,
            scope: 'personal',
            verb: 'ticket.create',
            data: { serviceId: service.id, title: `${title} (off)`, description: 'Ne smije nastati.', impact: 'LOW', urgency: 'LOW' },
          });
          expect(JSON.stringify(refused.response)).toMatch(/isključeno|turned off/);
        }, teamsDefaults);
        const after = await userApi.requestJson<{ items: TicketRow[] }>(`/tickets?serviceId=${encodeURIComponent(service.id)}`);
        expect(after.items.filter((item) => item.title.startsWith(title))).toHaveLength(1);

        // Permissions: users cannot reach the admin API; /me shows the link.
        expect((await userApi.request('/integrations/teams/admin/status')).status).toBe(403);
        expect((await userApi.request('/integrations/teams/admin/simulator/activities', { method: 'POST', body: JSON.stringify({ kind: 'install', userId, scope: 'personal' }) })).status).toBe(403);
        expect(await userApi.requestJson('/integrations/teams/me')).toEqual({ available: true, connected: true });

        // The package needs a Bot App ID (none in simulator-only environments).
        const appId = readiness.checks.find((check) => check.key === 'appId');
        if (appId === undefined || !appId.ok) {
          const pkg = await admin.request('/integrations/teams/admin/package?locale=bs');
          expect(pkg.status).toBe(400);
        }

        // Admin page: status, simulator tab, a message through the UI, axe.
        await signIn(page, env.superAdminEmail, env.superAdminPassword);
        await page.goto('/admin/teams');
        await expect(page.getByRole('heading', { name: 'Microsoft Teams', level: 1 })).toBeVisible();
        await expect(page.getByText(/Efektivni režim|Effective mode/)).toBeVisible();
        await page.getByRole('button', { name: /Provjeri spremnost|Check readiness/ }).click();
        await expect(page.getByText(/TEAMS_SIMULATOR_SECRET/)).toBeVisible();
        await expectNoSeriousA11yViolations(page, 'teams-admin-status', testInfo);

        await page.getByRole('tab', { name: /Simulator/ }).click();
        await page.getByRole('combobox', { name: /^Korisnik|^User/ }).selectOption(userId);
        const input = page.getByRole('textbox', { name: /Poruka botu|Message to the bot/ });
        await input.fill('pomoć');
        const send = page.getByRole('button', { name: /Pošalji|Send/ });
        await expect(send).toBeEnabled();
        await send.click();
        await expect(page.getByText(/Šta mogu uraditi|What I can do/).last()).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText(ticket!.ticketNumber).first()).toBeVisible();
        await expectNoSeriousA11yViolations(page, 'teams-admin-simulator', testInfo);
      },
      teamsDefaults,
    );
  });
});
