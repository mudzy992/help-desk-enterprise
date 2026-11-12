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
  const readySockets = new Set<object>();
  page.on('websocket', (socket) => {
    if (!socket.url().includes('/socket.io/')) return;
    socket.on('framereceived', (frame) => {
      if (typeof frame.payload !== 'string') return;
      frames.push(frame.payload);
      // Direct WebSocket transport receives the Socket.IO connect packet here.
      if (frame.payload.startsWith('40')) readySockets.add(socket);
    });
    socket.on('framesent', (frame) => {
      // With the default polling-first transport the connect packet may have
      // already arrived over HTTP; Engine.IO packet 5 completes the upgrade.
      if (frame.payload === '5') readySockets.add(socket);
    });
    socket.on('close', () => readySockets.delete(socket));
  });
  await signIn(page, env.userEmail, env.userPassword);
  await page.goto(`/tickets/${ticket.id}`);
  const bell = page.getByRole('button', { name: /^(Obavještenja|Notifications)$/i });
  await expect(bell).toBeVisible();
  await bell.click();
  const panel = page.locator('#notifications-panel[role="region"]');
  await expect(panel).toBeVisible();
  await expect.poll(() => readySockets.size, {
    timeout: 15_000,
    message: 'No active Socket.IO WebSocket connection or completed transport upgrade',
  }).toBeGreaterThan(0);
  // A transport handshake does not prove room readiness. Allow time for the
  // asynchronous join, then require the correlated event itself below.
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
