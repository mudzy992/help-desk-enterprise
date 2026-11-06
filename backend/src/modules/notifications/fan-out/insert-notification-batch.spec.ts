import { insertNotificationBatch } from './insert-notification-batch';
import { notificationTypes } from '../notifications.constants';
import { registerNotificationCreatedSink } from './notification-created-sinks';

type Inserted = Record<string, unknown>;
type CreateManyAndReturn = (input: {
  readonly data: readonly Inserted[];
}) => readonly Inserted[];

function createPrismaStub(
  resolveInserted?: CreateManyAndReturn,
  alreadyNotified: readonly { readonly userId: string }[] = [],
) {
  const persisted: Inserted[] = [];
  const findMany = jest.fn(async () => [...alreadyNotified]);
  const createManyAndReturn = jest.fn(
    async ({ data }: { data: readonly Inserted[] }) => {
      const inserted = resolveInserted?.({ data }) ?? data;
      persisted.push(...inserted);
      return inserted;
    },
  );
  const prisma = {
    notification: { findMany, createManyAndReturn },
  };
  return { prisma, persisted, findMany, createManyAndReturn };
}

function input(userIds: readonly string[]) {
  let id = 0;
  return {
    userIds,
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
    nextId: () => `notification-${++id}`,
    now: new Date('2026-09-24T12:00:00.000Z'),
  };
}

describe('insertNotificationBatch', () => {
  it('writes one batch and returns the rows reported as inserted by Prisma', async () => {
    const { prisma, persisted, createManyAndReturn } = createPrismaStub();
    const records = await insertNotificationBatch(
      prisma as never,
      input(['user-1', 'user-2', 'user-3']),
    );

    expect(createManyAndReturn).toHaveBeenCalledTimes(1);
    expect(createManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
    expect(createManyAndReturn.mock.calls[0]?.[0].data).toHaveLength(3);
    expect(records).toEqual(persisted);
    expect(records.map((record) => record.userId)).toEqual([
      'user-1',
      'user-2',
      'user-3',
    ]);
    expect(records.map((record) => record.id)).toEqual([
      'notification-1',
      'notification-2',
      'notification-3',
    ]);
    expect(records.every((record) => record.isRead === false)).toBe(true);
  });

  it('keeps the existing replay pre-read optimization', async () => {
    const { prisma, createManyAndReturn } = createPrismaStub(undefined, [
      { userId: 'user-1' },
    ]);
    await insertNotificationBatch(prisma as never, input(['user-1', 'user-2']));

    expect(createManyAndReturn.mock.calls[0]?.[0].data).toHaveLength(1);
    expect(createManyAndReturn.mock.calls[0]?.[0].data[0]?.userId).toBe('user-2');
  });

  it('publishes only the rows Prisma says this statement inserted', async () => {
    const { prisma, persisted } = createPrismaStub(({ data }) => [data[1]!]);
    const sink = jest.fn(async () => undefined);
    const unregister = registerNotificationCreatedSink(sink);

    try {
      const records = await insertNotificationBatch(
        prisma as never,
        input(['user-1', 'user-2']),
      );

      expect(records).toEqual(persisted);
      expect(records.map((record) => record.userId)).toEqual(['user-2']);
      expect(sink).toHaveBeenCalledTimes(1);
      expect(sink).toHaveBeenCalledWith(records);
    } finally {
      unregister();
    }
  });

  it('does not publish anything when every candidate loses the dedupe insert', async () => {
    const { prisma } = createPrismaStub(() => []);
    const sink = jest.fn(async () => undefined);
    const unregister = registerNotificationCreatedSink(sink);

    try {
      await expect(
        insertNotificationBatch(prisma as never, input(['user-1', 'user-2'])),
      ).resolves.toEqual([]);
      expect(sink).not.toHaveBeenCalled();
    } finally {
      unregister();
    }
  });

  it('writes nothing when there is no recipient', async () => {
    const { prisma, findMany, createManyAndReturn } = createPrismaStub();
    await expect(insertNotificationBatch(prisma as never, input([]))).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
    expect(createManyAndReturn).not.toHaveBeenCalled();
  });
});
