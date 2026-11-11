import { insertNotificationBatch } from './insert-notification-batch';
import { notificationTypes } from '../notifications.constants';

type Inserted = Record<string, unknown>;

/**
 * Phase 2.3 (plan §2.3): the whole recipient list is written with one statement,
 * and a re-ingest of the same event inserts nothing.
 */
function createPrismaStub(existing: readonly { readonly userId: string; readonly dedupeKey: string }[]) {
  const inserted: Inserted[] = [];
  const createMany = jest.fn(
    async ({ data }: { data: readonly Inserted[] }) => {
      inserted.push(...data);
      return { count: data.length };
    },
  );
  const prisma = {
    notification: {
      findMany: async () => [...existing],
      createMany,
    },
  };
  return { prisma, inserted, createMany };
}

describe('insertNotificationBatch', () => {
  it('writes every recipient with a single createMany', async () => {
    const { prisma, inserted, createMany } = createPrismaStub([]);
    const records = await insertNotificationBatch(prisma as never, {
      userIds: ['user-1', 'user-2', 'user-3'],
      type: notificationTypes.ticketCreated,
      title: 'New ticket',
      body: 'body',
      ticketId: 'ticket-1',
      payload: {
        ticketId: 'ticket-1',
        ticketNumber: 'T-1',
        event: 'created',
        messageId: 'message-1',
        actorUserId: 'user-1',
        confidential: false,
      },
      dedupeKey: 'ticketCreated:message-1',
      nextId: () => 'notification-1',
      now: new Date('2026-09-24T12:00:00.000Z'),
    });
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(inserted).toHaveLength(3);
    expect(records).toHaveLength(3);
    expect(records.every((record) => record.isRead === false)).toBe(true);
  });

  it('skips recipients that already have the same event', async () => {
    const { prisma, inserted } = createPrismaStub([
      { userId: 'user-1', dedupeKey: 'ticketCreated:message-1' },
    ]);
    const records = await insertNotificationBatch(prisma as never, {
      userIds: ['user-1', 'user-2'],
      type: notificationTypes.ticketCreated,
      title: 'New ticket',
      body: null,
      ticketId: 'ticket-1',
      payload: {
        ticketId: 'ticket-1',
        ticketNumber: 'T-1',
        event: 'created',
        messageId: 'message-1',
        actorUserId: null,
        confidential: false,
      },
      dedupeKey: 'ticketCreated:message-1',
      nextId: () => 'notification-1',
    });
    expect(inserted.map((row) => row.userId)).toEqual(['user-2']);
    expect(records.map((record) => record.userId)).toEqual(['user-2']);
  });

  it('writes nothing when there is no recipient (and when the event is a re-ingest)', async () => {
    const { prisma, createMany } = createPrismaStub([]);
    const empty = await insertNotificationBatch(prisma as never, {
      userIds: [],
      type: notificationTypes.ticketCreated,
      title: 'New ticket',
      body: null,
      ticketId: 'ticket-1',
      payload: {
        ticketId: 'ticket-1',
        ticketNumber: 'T-1',
        event: 'created',
        messageId: 'message-1',
        actorUserId: null,
        confidential: false,
      },
      dedupeKey: 'ticketCreated:message-1',
    });
    expect(empty).toEqual([]);
    expect(createMany).not.toHaveBeenCalled();
  });
});
