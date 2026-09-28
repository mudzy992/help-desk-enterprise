import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { createTicketViaApi, loadSeedCatalog } from '../helpers/create-ticket';
import { readE2EEnvironment } from '../helpers/environment';
import { nextTotpCode } from '../helpers/mfa';
import { signIn } from '../helpers/sign-in';

type DataSubjectRequest = {
  readonly id: string;
  readonly status: string;
  readonly subjectLabel: string;
  readonly receivedAt: string;
  readonly dueAt: string;
  readonly extendedDueAt: string | null;
  readonly daysLeft: number | null;
  readonly canExtend: boolean;
};
type PrivacyExport = { readonly id: string; readonly status: string; readonly error: string | null; readonly subjectUserId: string };
type RetentionRun = { readonly id: string; readonly category: string; readonly mode: string; readonly status: string; readonly startedAt: string };
type LegalHold = { readonly target: string; readonly id: string; readonly label: string };
type UserSummary = { readonly id: string; readonly email: string };
type TicketDetail = { readonly id: string; readonly ticketNumber: string; readonly privacy?: { readonly legalHold: boolean } };

const DAY_MS = 24 * 60 * 60 * 1000;

async function userId(api: ApiClient, email: string): Promise<string> {
  const users = await api.requestJson<UserSummary[]>('/users');
  const found = users.find((user) => user.email.toLowerCase() === email.toLowerCase());
  if (found === undefined) throw new Error(`user ${email} not found`);
  return found.id;
}

async function poll<T>(read: () => Promise<T>, done: (value: T) => boolean, timeoutMs = 90_000): Promise<T> {
  const until = Date.now() + timeoutMs;
  let value = await read();
  while (!done(value)) {
    if (Date.now() > until) throw new Error(`poll timed out, last value: ${JSON.stringify(value)}`);
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    value = await read();
  }
  return value;
}

/**
 * Paket 2.6 (§13 E2E 20): ZZLP BiH. Requests with the 30 + 60 day deadlines,
 * an export downloaded only after MFA, a legal hold placed by ticket number
 * (visible on the ticket), a retention dry run, the public notice, and a plain
 * user refused by the API.
 */
test.describe('20 privacy (ZZLP BiH)', () => {
  test('request register: create in UI → 30-day deadline → extend by 60 → close', async ({ page }) => {
    const env = readE2EEnvironment();
    const api = new ApiClient();
    await api.login(env.superAdminEmail, env.superAdminPassword);
    const label = `E2E nosilac ${Date.now()}`;

    await signIn(page, env.superAdminEmail, env.superAdminPassword);
    await page.goto('/privacy?tab=requests');
    await expect(page.getByTestId('privacy-requests')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('privacy-request-create').click();
    const sheet = page.getByTestId('privacy-request-sheet');
    await expect(sheet).toBeVisible();
    await sheet.getByTestId('privacy-request-subject-label').fill(label);
    await sheet.getByTestId('privacy-request-save').click();
    await expect(sheet).toBeHidden({ timeout: 20_000 });

    const row = page.getByTestId('privacy-request-row').filter({ hasText: label });
    await expect(row).toBeVisible();
    await expect(row.getByTestId('privacy-request-deadline')).toContainText(/\d/);

    const open = await api.requestJson<DataSubjectRequest[]>('/privacy/requests?scope=open');
    const created = open.find((item) => item.subjectLabel === label);
    expect(created).toBeDefined();
    // ZZLP čl. 14 st. 3: 30 days from receipt.
    expect(Math.round((Date.parse(created!.dueAt) - Date.parse(created!.receivedAt)) / DAY_MS)).toBe(30);
    expect(created!.canExtend).toBe(true);

    const extended = await api.requestJson<DataSubjectRequest>(`/privacy/requests/${created!.id}/extend`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Složen zahtjev, potrebno prikupljanje iz arhive' }),
    });
    expect(extended.status).toBe('EXTENDED');
    expect(Math.round((Date.parse(extended.extendedDueAt!) - Date.parse(extended.dueAt)) / DAY_MS)).toBe(60);
    expect(extended.canExtend).toBe(false);

    const closed = await api.requestJson<DataSubjectRequest>(`/privacy/requests/${created!.id}/close`, {
      method: 'POST',
      body: JSON.stringify({ outcome: 'COMPLETED', resultRef: 'E2E-REF-1' }),
    });
    expect(closed.status).toBe('COMPLETED');
    expect(closed.daysLeft).toBeNull();
  });

  test('export: queued → READY → download needs MFA → ZIP; the row shows in the UI', async ({ page }) => {
    test.setTimeout(180_000);
    const env = readE2EEnvironment();
    const api = new ApiClient();
    await api.login(env.superAdminEmail, env.superAdminPassword);
    const subjectUserId = await userId(api, env.userEmail);

    const queued = await api.requestJson<PrivacyExport>('/privacy/exports', {
      method: 'POST',
      body: JSON.stringify({ subjectUserId, includeAttachments: false }),
    });
    const ready = await poll(
      () => api.requestJson<PrivacyExport>(`/privacy/exports/${queued.id}`),
      (item) => item.status === 'READY' || item.status === 'FAILED',
    );
    expect(ready.status, ready.error ?? '').toBe('READY');

    // Without a code: the server asks for identity confirmation (§5.1).
    const withoutCode = await api.request(`/privacy/exports/${queued.id}/download`, { method: 'POST', body: '{}' });
    expect(withoutCode.status).toBe(400);
    expect(((await withoutCode.json()) as { code: string }).code).toBe('IDENTITY_CONFIRMATION_REQUIRED');

    const wrongCode = await api.request(`/privacy/exports/${queued.id}/download`, {
      method: 'POST',
      body: JSON.stringify({ code: '000000' }),
    });
    expect(wrongCode.status).toBe(403);
    expect(((await wrongCode.json()) as { code: string }).code).toBe('IDENTITY_CONFIRMATION_FAILED');

    const download = await api.request(`/privacy/exports/${queued.id}/download`, {
      method: 'POST',
      body: JSON.stringify({ code: await nextTotpCode(env.superAdminEmail) }),
    });
    expect(download.status).toBe(200);
    expect(download.headers.get('content-type')).toContain('application/zip');
    const bytes = new Uint8Array(await download.arrayBuffer());
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x50, 0x4b]); // "PK"

    await signIn(page, env.superAdminEmail, env.superAdminPassword);
    await page.goto('/privacy?tab=exports');
    await expect(page.getByTestId('privacy-exports')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('privacy-export-row').first()).toBeVisible();
  });

  test('legal hold by ticket number in UI → badge on the ticket → cleared', async ({ page }) => {
    const env = readE2EEnvironment();
    const requester = new ApiClient();
    await requester.login(env.userEmail, env.userPassword);
    const catalog = await loadSeedCatalog(requester);
    const created = await createTicketViaApi(requester, {
      title: `E2E legal hold ${Date.now()}`,
      serviceId: catalog.serviceId,
      formVersionRef: catalog.formVersionRef,
    });
    const admin = new ApiClient();
    await admin.login(env.superAdminEmail, env.superAdminPassword);
    const ticket = await admin.requestJson<TicketDetail>(`/tickets/${created.id}`);

    await signIn(page, env.superAdminEmail, env.superAdminPassword);
    await page.goto('/privacy?tab=holds');
    await expect(page.getByTestId('privacy-holds')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('privacy-hold-ticket').fill(ticket.ticketNumber);
    await page.getByTestId('privacy-hold-new').click();
    const dialog = page.getByTestId('privacy-hold-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('privacy-hold-reason').fill('Spor pred sudom, predmet E2E');
    await dialog.getByTestId('privacy-hold-confirm').click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });
    await expect(page.getByTestId('privacy-hold-row').filter({ hasText: ticket.ticketNumber })).toBeVisible();

    const holds = await admin.requestJson<LegalHold[]>('/privacy/legal-holds');
    expect(holds).toEqual(expect.arrayContaining([expect.objectContaining({ target: 'ticket', id: ticket.id })]));

    // privacy.view sees the marker; the requester does not.
    await page.goto(`/tickets/${ticket.id}`);
    await expect(page.getByTestId('ticket-legal-hold')).toBeVisible({ timeout: 20_000 });
    const asRequester = await requester.requestJson<TicketDetail>(`/tickets/${ticket.id}`);
    expect(asRequester.privacy?.legalHold ?? false).toBe(false);

    const cleared = await admin.request(`/privacy/legal-holds/ticket/${ticket.id}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason: 'Predmet okončan, E2E čišćenje' }),
    });
    expect(cleared.ok).toBe(true);
    const after = await admin.requestJson<LegalHold[]>('/privacy/legal-holds');
    expect(after.some((hold) => hold.id === ticket.id)).toBe(false);
  });

  test('retention: a dry run of sessions completes and is listed', async () => {
    test.setTimeout(150_000);
    const env = readE2EEnvironment();
    const api = new ApiClient();
    await api.login(env.superAdminEmail, env.superAdminPassword);
    const since = Date.now() - 5_000;
    await api.requestJson('/privacy/retention/sessions/dry-run', { method: 'POST' });
    const run = await poll(
      async () =>
        (await api.requestJson<RetentionRun[]>('/privacy/retention/runs?category=sessions')).find(
          (item) => item.mode === 'DRY_RUN' && Date.parse(item.startedAt) >= since,
        ),
      (item) => item !== undefined && item.status !== 'RUNNING',
    );
    expect(run!.status).toBe('COMPLETED');
  });

  test('public notice without signing in; a plain user is refused', async ({ browser }) => {
    const env = readE2EEnvironment();
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/login');
    await page.getByTestId('login-privacy-notice').click();
    await expect(page).toHaveURL(/\/privacy-notice$/);
    // The page ends in one of two states: the notice text, or an "unavailable/failed" box.
    // Wait for either, then require the text (the operator's markdown need not contain an h1).
    const content = page.getByTestId('privacy-notice-content');
    const unavailable = page.getByTestId('privacy-notice-unavailable');
    await expect(content.or(unavailable)).toBeVisible({ timeout: 20_000 });
    if (await unavailable.isVisible()) {
      throw new Error(`privacy notice not served (state=${await unavailable.getAttribute('data-state')}) — is privacy enabled and GET /privacy/notice public?`);
    }
    await expect(content).not.toBeEmpty();
    await context.close();

    const user = new ApiClient();
    await user.login(env.userEmail, env.userPassword);
    const refused = await user.request('/privacy/requests?scope=open');
    expect(refused.status).toBe(403);
  });
});
