import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { createTicketViaApi, loadSeedCatalog } from '../helpers/create-ticket';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

type Incident = { readonly id: string; readonly title: string; readonly status: string; readonly subscribed: boolean };
type StatusOverview = {
  readonly activeIncidents: readonly Incident[];
  readonly categories: ReadonlyArray<{ readonly services: ReadonlyArray<{ readonly id: string; readonly availability: string }> }>;
};
type Notification = { readonly type: string; readonly body: string | null };
type ChannelResult = { readonly channel: string; readonly status: string; readonly delivered: number };

const PREFIX = 'E2E incident';

async function notifications(api: ApiClient): Promise<readonly Notification[]> {
  const body = await api.requestJson<{ items: Notification[] } | Notification[]>('/notifications?limit=50');
  return Array.isArray(body) ? body : body.items;
}

async function poll<T>(read: () => Promise<T>, done: (value: T) => boolean, timeoutMs = 30_000): Promise<T> {
  const until = Date.now() + timeoutMs;
  let value = await read();
  while (!done(value)) {
    if (Date.now() > until) throw new Error(`poll timed out, last value: ${JSON.stringify(value)}`);
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    value = await read();
  }
  return value;
}

/** Leftovers of an interrupted run would change the service state; resolve them first. */
async function resolveLeftovers(admin: ApiClient): Promise<void> {
  const overview = await admin.requestJson<StatusOverview>('/status');
  for (const incident of overview.activeIncidents.filter((item) => item.title.startsWith(PREFIX))) {
    await admin.request(`/status/incidents/${incident.id}/updates`, {
      method: 'POST',
      body: JSON.stringify({ status: 'RESOLVED', message: 'E2E cleanup', notifyOnResolve: false }),
    });
  }
}

/**
 * Paket 2.7 (§14 E2E 21): System health for the admin, a test alarm delivered
 * in-app, and the incident flow end to end - user notified on start, sees the
 * incident on /status and as a banner in "New ticket", resolution notifies
 * the requester of the linked ticket. A plain user cannot manage incidents.
 */
test.describe('21 status page and monitoring', () => {
  test('admin sees System health and the test alarm is delivered in-app', async ({ page }) => {
    const env = readE2EEnvironment();
    const admin = new ApiClient();
    await admin.login(env.superAdminEmail, env.superAdminPassword);

    const health = await admin.request('/ops/health');
    expect(health.status).toBe(200);
    const result = await admin.requestJson<{ channels: ChannelResult[] }>('/ops/alerts/test', { method: 'POST', body: '{}' });
    const inApp = result.channels.find((channel) => channel.channel === 'inApp');
    expect(inApp?.status, JSON.stringify(result.channels)).toBe('sent');
    expect(inApp?.delivered ?? 0).toBeGreaterThan(0);

    await signIn(page, env.superAdminEmail, env.superAdminPassword);
    await page.goto('/admin?tab=ops');
    await expect(page.getByTestId('ops-health-card')).toBeVisible({ timeout: 30_000 });
  });

  test('incident: start notice → /status → New ticket banner → resolve → requester notified', async ({ browser }) => {
    const env = readE2EEnvironment();
    const admin = new ApiClient();
    await admin.login(env.superAdminEmail, env.superAdminPassword);
    const user = new ApiClient();
    await user.login(env.userEmail, env.userPassword);
    await resolveLeftovers(admin);

    const catalog = await loadSeedCatalog(user);
    const ticket = await createTicketViaApi(user, {
      title: `E2E status ${Date.now()}`,
      serviceId: catalog.serviceId,
      originUnitId: catalog.originUnitId,
      formVersionRef: catalog.formVersionRef,
    });
    const title = `${PREFIX} ${Date.now()}`;
    const created = await admin.requestJson<{ id: string; notified: number }>('/status/incidents', {
      method: 'POST',
      body: JSON.stringify({
        title,
        impact: 'DEGRADED',
        visibility: 'ALL_USERS',
        serviceIds: [catalog.serviceId],
        message: 'Istražujemo sporost servisa (E2E).',
        notifyOpenTicketHolders: true,
        ticketIds: [ticket.id],
      }),
    });

    try {
      await poll(
        () => notifications(user),
        (items) => items.some((item) => item.type === 'status.incidentStarted' && (item.body ?? '').includes(title)),
      );

      const overview = await user.requestJson<StatusOverview>('/status');
      expect(overview.activeIncidents.map((incident) => incident.id)).toContain(created.id);
      const service = overview.categories.flatMap((category) => category.services).find((item) => item.id === catalog.serviceId);
      expect(service?.availability).not.toBe('OPERATIONAL');

      const context = await browser.newContext();
      const page = await context.newPage();
      await signIn(page, env.userEmail, env.userPassword);
      await page.goto('/status');
      await expect(page.getByTestId('status-incident').filter({ hasText: title })).toBeVisible({ timeout: 20_000 });

      await page.goto('/tickets/new');
      await page.getByText(/opšti zahtjev|general request/i).first().click();
      const banner = page.getByTestId('service-incident-banner');
      await expect(banner).toBeVisible({ timeout: 20_000 });
      await expect(banner).toContainText(title);
      await context.close();

      const preview = await admin.requestJson<{ requesters: number; linkedTickets: number }>(`/status/incidents/${created.id}/resolve-preview`);
      expect(preview.linkedTickets).toBe(1);
      expect(preview.requesters).toBeGreaterThanOrEqual(1);
      await admin.requestJson(`/status/incidents/${created.id}/updates`, {
        method: 'POST',
        body: JSON.stringify({ status: 'RESOLVED', message: 'Uzrok otklonjen (E2E).' }),
      });
      await poll(
        () => notifications(user),
        (items) => items.some((item) => item.type === 'status.incidentResolved' && (item.body ?? '').includes(title)),
      );
      const after = await user.requestJson<StatusOverview>('/status');
      expect(after.activeIncidents.map((incident) => incident.id)).not.toContain(created.id);
    } finally {
      await resolveLeftovers(admin);
    }
  });

  test('a plain user reads /status but cannot manage incidents', async () => {
    const env = readE2EEnvironment();
    const user = new ApiClient();
    await user.login(env.userEmail, env.userPassword);
    expect((await user.request('/status')).status).toBe(200);
    const refused = await user.request('/status/incidents', {
      method: 'POST',
      body: JSON.stringify({ title: 'Ne smije', impact: 'DOWN', serviceIds: ['x'], message: 'Ne smije proći' }),
    });
    expect(refused.status).toBe(403);
  });
});
