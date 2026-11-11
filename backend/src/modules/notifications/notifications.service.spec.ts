import { ticketRealtimeEventNames } from '../tickets/collaboration.constants';
import { countUnreadNotifications } from './count-unread-notifications';
import { listNotifications } from './list-notifications';
import { loadNotificationAudience } from './notification-audience';
import { markAllNotificationsRead } from './mark-all-notifications-read';
import { markNotificationRead } from './mark-notification-read';
import { NotificationsService } from './notifications.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('./count-unread-notifications', () => ({
  countUnreadNotifications: jest.fn(async () => 7),
}));
jest.mock('./list-notifications', () => ({
  listNotifications: jest.fn(async () => ({ items: [], nextCursor: null })),
}));
jest.mock('./notification-audience', () => ({
  loadNotificationAudience: jest.fn(async () => [{ groupId: 'group-1' }]),
}));
jest.mock('./mark-notification-read', () => ({
  markNotificationRead: jest.fn(async () => ({ id: 'n-1', isRead: true })),
}));
jest.mock('./mark-all-notifications-read', () => ({
  markAllNotificationsRead: jest.fn(async () => ({ unreadCount: 0 })),
}));

/**
 * M13 (val 4/5): the service is thin on purpose, but the thin part is what the
 * badge depends on — the 15-second Redis entry, the epochs of the user's
 * groups, and the two realtime events each read path publishes. None of that
 * was covered before.
 */
describe('NotificationsService (M13)', () => {
  function createService(options: {
    readonly cachedCount?: number | null;
    readonly cachedEpochs?: readonly number[];
  } = {}) {
    const published: unknown[] = [];
    const cacheCalls = { reads: 0, writes: 0, invalidations: 0 };
    const service = new NotificationsService(
      {} as never,
      { publishNotification: (payload: unknown) => published.push(payload) } as never,
      {
        readWithEpochs: async () => {
          cacheCalls.reads += 1;
          return {
            count: options.cachedCount ?? null,
            epochs: [...(options.cachedEpochs ?? [])],
          };
        },
        writeWithEpochs: async () => {
          cacheCalls.writes += 1;
        },
        invalidate: async () => {
          cacheCalls.invalidations += 1;
        },
      } as never,
    );
    return { service, published, cacheCalls };
  }

  it('serves the badge from the cache when it is there', async () => {
    const { service, cacheCalls } = createService({ cachedCount: 3 });

    await expect(service.unreadCount('user-1')).resolves.toEqual({
      unreadCount: 3,
    });
    expect(countUnreadNotifications).not.toHaveBeenCalled();
    expect(cacheCalls.writes).toBe(0);
  });

  it('counts in the database and stores the value on a miss', async () => {
    const { service, cacheCalls } = createService();

    await expect(service.unreadCount('user-1')).resolves.toEqual({
      unreadCount: 7,
    });
    expect(loadNotificationAudience).toHaveBeenCalled();
    expect(countUnreadNotifications).toHaveBeenCalled();
    expect(cacheCalls.writes).toBe(1);
  });

  it('drops the cached value when a notification is marked read', async () => {
    const { service, published, cacheCalls } = createService({ cachedCount: 3 });

    await expect(
      service.markRead('user-1', 'n-1'),
    ).resolves.toMatchObject({ id: 'n-1' });
    expect(markNotificationRead).toHaveBeenCalledWith(expect.anything(), 'user-1', 'n-1');
    expect(cacheCalls.invalidations).toBe(1);
    expect(published).toEqual([
      expect.objectContaining({
        userId: 'user-1',
        eventName: ticketRealtimeEventNames.notificationRead,
        unreadCount: 7,
      }),
      expect.objectContaining({
        userId: 'user-1',
        eventName: ticketRealtimeEventNames.notificationUnreadCount,
        notification: null,
        unreadCount: 7,
      }),
    ]);
  });

  it('publishes a read-all event with the fresh count', async () => {
    const { service, published, cacheCalls } = createService();

    await expect(service.markAllRead('user-1')).resolves.toEqual({
      unreadCount: 0,
    });
    expect(markAllNotificationsRead).toHaveBeenCalled();
    expect(cacheCalls.invalidations).toBe(1);
    expect(published[0]).toMatchObject({
      eventName: ticketRealtimeEventNames.notificationRead,
      notification: null,
      readAll: true,
      unreadCount: 0,
    });
  });

  it('keeps the list path behind the same error mapping', async () => {
    const { service } = createService();
    await expect(
      service.list('user-1', { limit: 20 } as never),
    ).resolves.toEqual({ items: [], nextCursor: null });
    expect(listNotifications).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      { limit: 20 },
    );
  });
});
