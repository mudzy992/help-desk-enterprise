import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { createTicketViaApi, loadSeedCatalog } from '../helpers/create-ticket';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

/** The test creates a disposable ticket and requires two test accounts. */
test('a ticket reply reaches the requester notification panel over the socket', async ({ page }) => {
  test.skip(process.env.E2E_VAL6_REALTIME !== '1', 'Requires an explicitly enabled disposable realtime fixture');
  const env = readE2EEnvironment();
  const requester = new ApiClient();
  const admin = new ApiClient();
  await requester.login(env.userEmail, env.userPassword);
  await admin.login(env.superAdminEmail, env.superAdminPassword);
  const catalog = await loadSeedCatalog(admin);
  const ticket = await createTicketViaApi(requester, {
    title: `Val 6 realtime ${randomUUID()}`,
    serviceId: catalog.serviceId,
    originUnitId: catalog.originUnitId,
    formVersionRef: catalog.formVersionRef,
  });

  const frames: string[] = [];
  page.on('websocket', (socket) => {
    socket.on('framereceived', (frame) => {
      if (typeof frame.payload === 'string') frames.push(frame.payload);
    });
  });
  await signIn(page, env.userEmail, env.userPassword);
  await page.goto(`/tickets/${ticket.id}`);
  const bell = page.getByRole('button', { name: /^(Obavještenja|Notifications)$/i });
  await expect(bell).toBeVisible();
  await bell.click();
  const panel = page.getByRole('region', { name: /^(Obavještenja|Notifications)$/i });
  await expect(panel).toBeVisible();
  await expect.poll(() => frames.some((frame) => frame.startsWith('40')), { timeout: 15_000 }).toBe(true);
  // The Socket.IO connect frame precedes async room joining. The same bounded
  // join allowance is used by the existing routing-room E2E 15.
  await page.waitForTimeout(1_500);
  const matchingRows = panel.getByText(ticket.title, { exact: true });
  const initialCount = await matchingRows.count();
  const message = await admin.requestJson<{ id: string }>(`/tickets/${ticket.id}/messages`, {
    method: 'POST',
    body: JSON.stringify({ idempotencyKey: randomUUID(), type: 'AGENT_REPLY', body: 'Disposable realtime test reply' }),
  });
  await expect.poll(
    () => frames.some((frame) => frame.includes('notification.created') && frame.includes(ticket.id) && frame.includes(message.id)),
    { timeout: 30_000 },
  ).toBe(true);
  // The already-open panel is not reopened or refreshed by this test.
  await expect.poll(() => matchingRows.count(), { timeout: 15_000 }).toBeGreaterThan(initialCount);
});
