import { runWithRequestId } from '../../common/request-context/request-context.storage';
import { loadActorGroupMemberships } from '../../common/cache/scope-catalog-cache';
import { NotificationUnreadCountCache } from './notification-unread-count.cache';
import { unreadCountCacheKey } from './unread-count-cache';
import { NotificationsService } from './notifications.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

function createRedis() {
  const store = new Map<string, string>();
  return {
    status: 'ready',
    store,
    connect: jest.fn(async () => undefined),
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    },
    del: async (key: string) => store.delete(key),
    mget: async (...keys: string[]) => keys.map((key) => store.get(key) ?? null),
    incr: async (key: string) => {
      const next = Number(store.get(key) ?? '0') + 1;
      store.set(key, String(next));
      return next;
    },
  };
}

describe('notification unread badge after membership revocation', () => {
  it('misses a warm badge when the authoritative membership snapshot changes', async () => {
    const userId = 'agent-1';
    const membership = {
      id: 'membership-1',
      userId,
      groupId: 'group-1',
      createdAt: new Date('2026-11-01T12:00:00.000Z'),
    };
    let currentMemberships = [membership];
    const groupMemberFindMany = jest.fn(async ({ where }: { where: { userId: string } }) =>
      currentMemberships.filter((row) => row.userId === where.userId),
    );
    const notificationCount = jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      'OR' in where ? 3 : 0,
    );
    const prisma = {
      groupMember: { findMany: groupMemberFindMany },
      notification: { count: notificationCount },
    };
    const redis = createRedis();
    const service = new NotificationsService(
      prisma as never,
      {} as never,
      new NotificationUnreadCountCache(redis as never),
    );

    await runWithRequestId('notification-count-before-revoke', async () => {
      await loadActorGroupMemberships(prisma as never, userId);
      await expect(service.unreadCount(userId)).resolves.toEqual({ unreadCount: 3 });
    });
    expect(notificationCount).toHaveBeenCalledTimes(1);
    expect(redis.store.has(unreadCountCacheKey(userId))).toBe(true);

    // Simulate the database commit on another process: this process' old WeakMap entry
    // is intentionally left untouched, just as it would be on a remote app instance.
    currentMemberships = [];

    await runWithRequestId('notification-count-after-revoke', async () => {
      await expect(loadActorGroupMemberships(prisma as never, userId)).resolves.toEqual([
        expect.objectContaining({ groupId: 'group-1' }),
      ]);
      await expect(service.unreadCount(userId)).resolves.toEqual({ unreadCount: 0 });
    });
    expect(notificationCount).toHaveBeenCalledTimes(2);
    expect(notificationCount.mock.calls[1]?.[0]?.where).toEqual({
      userId,
      isRead: false,
    });
  });
});
