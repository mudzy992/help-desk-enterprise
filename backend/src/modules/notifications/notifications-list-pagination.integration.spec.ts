import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { listNotifications } from './list-notifications';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase(
  'notification inbox pagination (PostgreSQL integration, BA-notifications-08)',
  () => {
    jest.setTimeout(120_000);
    let prisma: PrismaClient;
    let userId: string;
    const stamp = Date.now();
    const notificationPrefix = `notification-page-${stamp}`;

    beforeAll(async () => {
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: url! }),
      });
      const user = await prisma.user.create({
        data: {
          email: `notification-page-${stamp}@example.test`,
          displayName: 'Notification pagination reader',
        },
      });
      userId = user.id;
    });

    afterEach(async () => {
      await prisma.notification.deleteMany({ where: { userId } });
    });

    afterAll(async () => {
      await prisma.notification.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
      await prisma.$disconnect();
    });

    it('returns every row once across tied timestamps and preserves unread filtering on later pages', async () => {
      const createdAt = new Date(Date.now() - 60_000);
      const readAt = new Date(Date.now() - 30_000);
      const rows = ['a', 'b', 'c', 'd', 'e'].map((suffix) => ({
        id: `${notificationPrefix}-${suffix}`,
        userId,
        groupId: null,
        excludedUserIds: [],
        type: 'ticket.created',
        title: `Notification ${suffix}`,
        body: null,
        isRead: ['b', 'd'].includes(suffix),
        readAt: ['b', 'd'].includes(suffix) ? readAt : null,
        ticketId: null,
        payload: {},
        dedupeKey: `${notificationPrefix}-${suffix}`,
        createdAt,
      }));
      await prisma.notification.createMany({ data: rows });

      const first = await listNotifications(prisma as never, userId, {
        limit: 2,
      });
      const second = await listNotifications(prisma as never, userId, {
        limit: 2,
        cursor: first.nextCursor ?? undefined,
      });
      const third = await listNotifications(prisma as never, userId, {
        limit: 2,
        cursor: second.nextCursor ?? undefined,
      });
      const unreadFirst = await listNotifications(prisma as never, userId, {
        limit: 2,
        unreadOnly: true,
      });
      const unreadSecond = await listNotifications(prisma as never, userId, {
        limit: 2,
        unreadOnly: true,
        cursor: unreadFirst.nextCursor ?? undefined,
      });

      expect(first.items.map((item) => item.id)).toEqual([
        `${notificationPrefix}-e`,
        `${notificationPrefix}-d`,
      ]);
      expect(second.items.map((item) => item.id)).toEqual([
        `${notificationPrefix}-c`,
        `${notificationPrefix}-b`,
      ]);
      expect(third.items.map((item) => item.id)).toEqual([`${notificationPrefix}-a`]);
      expect([first, second, third].map((page) => page.hasMore)).toEqual([true, true, false]);
      expect(third.nextCursor).toBeNull();
      expect(unreadFirst.items.map((item) => item.id)).toEqual([
        `${notificationPrefix}-e`,
        `${notificationPrefix}-c`,
      ]);
      expect(unreadSecond.items.map((item) => item.id)).toEqual([`${notificationPrefix}-a`]);
      expect(unreadFirst.items.every((item) => !item.isRead)).toBe(true);
      expect(unreadFirst.unreadCount).toBe(3);
      expect(unreadSecond.unreadCount).toBe(3);
      expect(unreadSecond.hasMore).toBe(false);
    });
  },
);
