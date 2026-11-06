import {
  createInMemoryNotificationDelegate,
  createInMemoryNotificationReceiptDelegate,
  type InMemoryNotificationReceipt,
} from './create-in-memory-notification-delegate';
import { listNotifications } from './list-notifications';
import type { NotificationRecord } from './notifications.types';

const userId = 'notification-pagination-user';
const groupId = 'notification-pagination-group';
const createdAt = new Date('2026-11-06T10:20:30.123Z');

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('notification inbox cursor pagination', () => {
  it('walks tied timestamps once in a stable (createdAt, id) order', async () => {
    const { prisma } = createInbox([
      notification('notification-1'),
      notification('notification-2'),
      notification('notification-3'),
      notification('notification-4'),
      notification('notification-5'),
    ]);

    const first = await listNotifications(prisma, userId, { limit: 2 });
    const second = await listNotifications(prisma, userId, {
      limit: 2,
      cursor: first.nextCursor ?? undefined,
    });
    const third = await listNotifications(prisma, userId, {
      limit: 2,
      cursor: second.nextCursor ?? undefined,
    });

    expect(first.items.map((item) => item.id)).toEqual(['notification-5', 'notification-4']);
    expect(first).toMatchObject({ hasMore: true, unreadCount: 5 });
    expect(second.items.map((item) => item.id)).toEqual(['notification-3', 'notification-2']);
    expect(second).toMatchObject({ hasMore: true, unreadCount: 5 });
    expect(third.items.map((item) => item.id)).toEqual(['notification-1']);
    expect(third).toMatchObject({
      hasMore: false,
      nextCursor: null,
      unreadCount: 5,
    });
    expect([...first.items, ...second.items, ...third.items].map((item) => item.id)).toHaveLength(
      5,
    );
  });

  it('keeps the unread predicate on every personal-inbox page', async () => {
    const { prisma } = createInbox([
      notification('notification-1', false),
      notification('notification-2', true),
      notification('notification-3', false),
      notification('notification-4', true),
      notification('notification-5', false),
    ]);

    const first = await listNotifications(prisma, userId, {
      limit: 2,
      unreadOnly: true,
    });
    const second = await listNotifications(prisma, userId, {
      limit: 2,
      unreadOnly: true,
      cursor: first.nextCursor ?? undefined,
    });

    expect(first.items.map((item) => item.id)).toEqual(['notification-5', 'notification-3']);
    expect(first.items.every((item) => !item.isRead)).toBe(true);
    expect(first).toMatchObject({ hasMore: true, unreadCount: 3 });
    expect(second.items.map((item) => item.id)).toEqual(['notification-1']);
    expect(second).toMatchObject({
      hasMore: false,
      nextCursor: null,
      unreadCount: 3,
    });
  });

  it('uses per-user group receipts for unread cursor pages', async () => {
    const { prisma, notificationReceipt } = createInbox(
      [
        groupNotification('notification-1'),
        notification('notification-2', true),
        notification('notification-3'),
        groupNotification('notification-4'),
        groupNotification('notification-5'),
      ],
      [{ id: 'membership-1', groupId, userId, createdAt: new Date(0) }],
    );
    await notificationReceipt.createMany({
      data: [{ notificationId: 'notification-4', userId, readAt: createdAt }],
    });

    const first = await listNotifications(prisma, userId, {
      limit: 2,
      unreadOnly: true,
    });
    const second = await listNotifications(prisma, userId, {
      limit: 2,
      unreadOnly: true,
      cursor: first.nextCursor ?? undefined,
    });

    expect(first.items.map((item) => item.id)).toEqual(['notification-5', 'notification-3']);
    expect(second.items.map((item) => item.id)).toEqual(['notification-1']);
    expect(first.items.every((item) => !item.isRead)).toBe(true);
    expect(second.unreadCount).toBe(3);
  });
});

function createInbox(
  rows: readonly NotificationRecord[],
  memberships: readonly {
    readonly id: string;
    readonly groupId: string;
    readonly userId: string;
    readonly createdAt: Date;
  }[] = [],
) {
  const records = new Map(rows.map((row) => [row.id, row]));
  const receipts = new Map<string, InMemoryNotificationReceipt>();
  const notification = createInMemoryNotificationDelegate(
    records,
    () => 'generated-notification-id',
    () => createdAt,
    receipts,
  );
  const notificationReceipt = createInMemoryNotificationReceiptDelegate(receipts);
  const prisma = {
    notification,
    notificationReceipt,
    groupMember: {
      findMany: async ({ where }: { where?: { userId?: string } } = {}) =>
        memberships.filter(
          (membership) => where?.userId === undefined || membership.userId === where.userId,
        ),
    },
  };
  return { prisma: prisma as never, notificationReceipt };
}

function notification(id: string, isRead = false): NotificationRecord {
  return {
    id,
    userId,
    groupId: null,
    excludedUserIds: [],
    type: 'ticket.created',
    title: id,
    body: null,
    isRead,
    readAt: isRead ? createdAt : null,
    ticketId: null,
    payload: {},
    dedupeKey: id,
    createdAt,
  };
}

function groupNotification(id: string): NotificationRecord {
  return {
    ...notification(id),
    userId: null,
    groupId,
  };
}
