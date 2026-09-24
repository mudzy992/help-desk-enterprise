import type { NotificationUnreadCountCache } from './notification-unread-count.cache';
import { NotificationsService } from './notifications.service';
import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from '../tickets/create-tickets-service-harness';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const { agentIt, agentHr } = ticketsTestIds;

/**
 * Phase 1.3 (plan §1.3): the badge is served from the 15-second Redis entry when
 * there is one and from the database when there is not. These specs drive the
 * service with a fake cache, so both paths are visible from the outside.
 */
function createFakeUnreadCountCache(initial: readonly [string, number][] = []) {
  const entries = new Map<string, number>(initial);
  const reads: string[] = [];
  const writes: { userId: string; unreadCount: number }[] = [];
  const invalidations: string[] = [];
  const cache = {
    read: async (userId: string) => {
      reads.push(userId);
      return entries.get(userId) ?? null;
    },
    write: async (userId: string, unreadCount: number) => {
      writes.push({ userId, unreadCount });
      entries.set(userId, unreadCount);
    },
    readWithEpochs: async (userId: string) => {
      reads.push(userId);
      return { count: entries.get(userId) ?? null, epochs: null };
    },
    writeWithEpochs: async (userId: string, unreadCount: number) => {
      writes.push({ userId, unreadCount });
      entries.set(userId, unreadCount);
    },
    bumpGroup: async () => undefined,
    invalidate: async (userId: string) => {
      invalidations.push(userId);
      entries.delete(userId);
    },
  } as unknown as NotificationUnreadCountCache;
  return { cache, entries, reads, writes, invalidations };
}

function seedNotification(
  memory: ReturnType<typeof createTicketsServiceHarness>['memory'],
  id: string,
  userId: string,
  isRead = false,
): void {
  memory.notifications.set(id, {
    id,
    userId,
    isRead,
    type: 'TICKET_CREATED',
    title: 'Naslov',
    body: 'Tijelo',
    readAt: isRead ? new Date('2026-03-01T10:00:00.000Z') : null,
    ticketId: null,
    payload: {},
    createdAt: new Date('2026-03-01T09:00:00.000Z'),
  } as never);
}

function setup(initial?: readonly [string, number][]) {
  const harness = createTicketsServiceHarness();
  const memory = harness.memory;
  const fake = createFakeUnreadCountCache(initial);
  const service = new NotificationsService(
    memory.prisma as never,
    harness.realtimeHub,
    fake.cache,
  );
  // Counts the database reads so a cache hit can be told apart from a miss.
  let databaseReads = 0;
  const delegate = memory.prisma.notification as { count: unknown };
  const original = delegate.count;
  delegate.count = (async (args?: unknown) => {
    databaseReads += 1;
    return (original as (input?: unknown) => Promise<number>)(args);
  }) as never;
  return {
    service,
    memory,
    harness,
    databaseReads: () => databaseReads,
    ...fake,
  };
}

describe('GET /notifications/unread-count with the phase 1.3 cache', () => {
  it('answers from the cache and does not touch the database on a hit', async () => {
    const { service, reads, databaseReads } = setup([[agentIt, 5]]);
    expect(await service.unreadCount(agentIt)).toEqual({ unreadCount: 5 });
    expect(reads).toEqual([agentIt]);
    expect(databaseReads()).toBe(0);
  });

  it('reads the database and fills the cache on a miss', async () => {
    const { service, memory, writes, databaseReads } = setup();
    seedNotification(memory, 'n1', agentIt);
    seedNotification(memory, 'n2', agentIt);
    expect(await service.unreadCount(agentIt)).toEqual({ unreadCount: 2 });
    expect(databaseReads()).toBe(1);
    expect(writes).toEqual([{ userId: agentIt, unreadCount: 2 }]);
  });

  it('serves the filled entry without a second database read', async () => {
    const { service, memory, databaseReads } = setup();
    seedNotification(memory, 'n1', agentIt);
    await service.unreadCount(agentIt);
    expect(await service.unreadCount(agentIt)).toEqual({ unreadCount: 1 });
    expect(databaseReads()).toBe(1);
  });

  it('drops the entry when a notification is read and when all are read', async () => {
    const { service, memory, invalidations } = setup([[agentIt, 4]]);
    seedNotification(memory, 'n1', agentIt);

    await service.markRead(agentIt, 'n1');
    expect(invalidations).toContain(agentIt);

    invalidations.length = 0;
    await service.markAllRead(agentIt);
    expect(invalidations).toContain(agentIt);
  });

  it('still answers when the cache is unavailable', async () => {
    const { memory, harness } = setup();
    const failing = {
      read: async () => null,
      write: async () => undefined,
      readWithEpochs: async () => ({ count: null, epochs: null }),
      writeWithEpochs: async () => undefined,
      invalidate: async () => undefined,
    } as unknown as NotificationUnreadCountCache;
    const serviceWithoutRedis = new NotificationsService(
      memory.prisma as never,
      harness.realtimeHub,
      failing,
    );
    seedNotification(memory, 'n1', agentIt);
    expect(await serviceWithoutRedis.unreadCount(agentIt)).toEqual({
      unreadCount: 1,
    });
  });

  it('counts only the unread notifications of that user', async () => {
    const { service, memory } = setup();
    seedNotification(memory, 'a', agentIt);
    seedNotification(memory, 'b', agentIt, true);
    seedNotification(memory, 'c', agentHr);
    expect(await service.unreadCount(agentIt)).toEqual({ unreadCount: 1 });
    expect(await service.unreadCount(agentHr)).toEqual({ unreadCount: 1 });
  });
});
