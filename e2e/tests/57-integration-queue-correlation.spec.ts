import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { Client } from 'pg';
import { ApiClient } from '../helpers/api-client';
import { createTicketViaApi, loadSeedCatalog } from '../helpers/create-ticket';
import { readE2EEnvironment } from '../helpers/environment';

/**
 * Opt-in only: this test creates a ticket and reads its queue job from the DB.
 * Enable only on an isolated disposable stack with notification delivery and
 * the integration queue configured; never point it at production.
 */
test('a ticket message produces a correlated queue job processed by the worker', async () => {
  test.skip(process.env.E2E_VAL6_QUEUE !== '1', 'Requires an explicitly enabled disposable Val 6 queue fixture');
  const env = readE2EEnvironment();
  if (!env.databaseUrl) throw new Error('E2E_VAL6_QUEUE requires DATABASE_URL for correlation');
  const db = new Client({ connectionString: env.databaseUrl });
  await db.connect();
  try {
    const requester = new ApiClient();
    const admin = new ApiClient();
    await requester.login(env.userEmail, env.userPassword);
    await admin.login(env.superAdminEmail, env.superAdminPassword);
    const catalog = await loadSeedCatalog(admin);
    const ticket = await createTicketViaApi(requester, {
      title: `E2E queue correlation ${randomUUID()}`,
      serviceId: catalog.serviceId,
      originUnitId: catalog.originUnitId,
      formVersionRef: catalog.formVersionRef,
    });
    const message = await admin.requestJson<{ id: string }>(`/tickets/${ticket.id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ idempotencyKey: randomUUID(), type: 'AGENT_REPLY', body: 'Disposable queue correlation test' }),
    });
    expect(message.id).toBeTruthy();

    // Never print payloads or addresses. EMAIL uses the message-id dedupe key;
    // EDGE_EVENT includes the ticket id and the notification's source message.
    await expect.poll(async () => {
      const result = await db.query<{ status: string }>(
        `SELECT status::text AS status FROM "IntegrationJob"
         WHERE (type = 'EMAIL' AND payload->>'dedupeKey' = $1)
            OR (type = 'EDGE_EVENT' AND payload->>'ticketId' = $2
                AND payload->'data'->'notification'->'payload'->>'messageId' = $3)
         ORDER BY "createdAt" DESC LIMIT 20`,
        [`ticket.message:${message.id}`, ticket.id, message.id],
      );
      return result.rows.some((row) => row.status === 'COMPLETED' || row.status === 'PUBLISHED_BEST_EFFORT');
    }, { timeout: 60_000, message: 'No successful correlated queue job: verify queue, delivery channel and worker on the isolated stack' }).toBe(true);
  } finally {
    await db.end();
  }
});
