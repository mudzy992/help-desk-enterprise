import type { TicketMessageRecord } from './collaboration.types';
import { createInMemoryTicketMessageDelegate } from './create-in-memory-ticket-message-delegate';

describe('in-memory ticket message delegate', () => {
  it('replays an upsert for the same ticket and idempotency key without duplicating the event', async () => {
    const records = new Map<string, TicketMessageRecord>();
    let nextId = 0;
    const now = new Date('2026-01-01T00:00:00.000Z');
    const delegate = createInMemoryTicketMessageDelegate(
      records,
      () => `message-${++nextId}`,
      () => now,
    );
    const where = {
      ticketId_idempotencyKey: {
        ticketId: 'ticket-1',
        idempotencyKey: 'reopen:ticket-1:request-1',
      },
    };

    const first = await delegate.upsert({
      where,
      create: {
        ticketId: 'ticket-1',
        type: 'SYSTEM_EVENT',
        body: 'ticket_reopened',
        authorUserId: 'actor-1',
        idempotencyKey: 'reopen:ticket-1:request-1',
      },
      update: {},
    });
    const replay = await delegate.upsert({
      where,
      create: {
        ticketId: 'ticket-1',
        type: 'SYSTEM_EVENT',
        body: 'duplicate event must not replace the original',
        authorUserId: 'actor-2',
        idempotencyKey: 'reopen:ticket-1:request-1',
      },
      update: {},
    });

    expect(replay).toBe(first);
    expect(records.size).toBe(1);
    expect(records.get(first.id)).toMatchObject({
      id: 'message-1',
      ticketId: 'ticket-1',
      body: 'ticket_reopened',
      authorUserId: 'actor-1',
      idempotencyKey: 'reopen:ticket-1:request-1',
    });
  });
});
