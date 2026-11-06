import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../../generated/prisma/client';
import { markAllNotificationsRead } from './mark-all-notifications-read';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

type NotificationFixture = {
  readonly id: string;
  readonly userId: string | null;
  readonly groupId: string | null;
  readonly dedupeKey: string;
  readonly createdAt: Date;
};

function notificationData(fixture: NotificationFixture) {
  return {
    ...fixture,
    excludedUserIds: [],
    type: 'TICKET_CREATED',
    title: fixture.id,
    body: null,
    isRead: false,
    readAt: null,
  };
}

function withTransactionOverride(
  prisma: PrismaClient,
  wrap: (transaction: Prisma.TransactionClient) => unknown,
  onOptions?: (options: unknown) => void,
) {
  return {
    notification: prisma.notification,
    notificationReceipt: prisma.notificationReceipt,
    groupMember: prisma.groupMember,
    $transaction: (
      callback: (transaction: unknown) => Promise<unknown>,
      options?: unknown,
    ) => {
      onOptions?.(options);
      return prisma.$transaction(
        (transaction) => callback(wrap(transaction)),
        options as never,
      );
    },
  } as never;
}

describeIfDatabase('notification mark-all-read cutoff (PostgreSQL integration, BA-notifications-06)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  let userId: string;
  let groupId: string;
  let organizationalUnitId: string;
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const unit = await prisma.organizationalUnit.create({
      data: {
        name: `Notification mark all ${stamp}`,
        type: 'DIRECTORATE',
        distinguishedName: `OU=NMA${stamp}`,
        ouPath: `/nma${stamp}`,
      },
    });
    organizationalUnitId = unit.id;
    const user = await prisma.user.create({
      data: {
        email: `notification-mark-all-${stamp}@example.test`,
        displayName: 'Notification mark-all reader',
      },
    });
    userId = user.id;
    const group = await prisma.group.create({
      data: {
        name: `Notification mark all ${stamp}`,
        key: `notification-mark-all-${stamp}`,
        organizationalUnitId,
      },
    });
    groupId = group.id;
    await prisma.groupMember.create({
      data: {
        groupId,
        userId,
        createdAt: new Date(stamp - 60_000),
      },
    });
  });

  afterEach(async () => {
    await prisma.notificationReceipt.deleteMany({ where: { userId } });
    await prisma.notification.deleteMany({
      where: { OR: [{ userId }, { groupId }] },
    });
  });

  afterAll(async () => {
    await prisma.groupMember.deleteMany({ where: { groupId, userId } });
    await prisma.group.delete({ where: { id: groupId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.organizationalUnit
      .delete({ where: { id: organizationalUnitId } })
      .catch(() => undefined);
    await prisma.$disconnect();
  });

  it('keeps post-snapshot personal and group rows unread and returns the committed unread count', async () => {
    const cutoff = new Date(Date.now() + 20_000);
    const beforeAt = new Date(cutoff.getTime() - 1_000);
    const oldPersonalId = `mark-all-old-personal-${stamp}`;
    const oldGroupId = `mark-all-old-group-${stamp}`;
    const newPersonalId = `mark-all-new-personal-${stamp}`;
    const newGroupId = `mark-all-new-group-${stamp}`;
    await prisma.notification.createMany({
      data: [
        notificationData({
          id: oldPersonalId,
          userId,
          groupId: null,
          dedupeKey: oldPersonalId,
          createdAt: beforeAt,
        }),
        notificationData({
          id: oldGroupId,
          userId: null,
          groupId,
          dedupeKey: oldGroupId,
          createdAt: beforeAt,
        }),
      ],
    });

    let concurrentRowsInserted = false;
    let isolationLevel: unknown;
    const transactionalPrisma = withTransactionOverride(
      prisma,
      (transaction) => ({
        groupMember: {
          findMany: async (
            args: Parameters<typeof transaction.groupMember.findMany>[0],
          ) => {
            const memberships = await transaction.groupMember.findMany(args);
            if (!concurrentRowsInserted) {
              // These rows commit after the transaction's first query, yet share
              // the cutoff timestamp. RepeatableRead must keep them outside the
              // mark-all snapshot rather than marking the group receipt.
              await prisma.notification.createMany({
                data: [
                  notificationData({
                    id: newPersonalId,
                    userId,
                    groupId: null,
                    dedupeKey: newPersonalId,
                    createdAt: cutoff,
                  }),
                  notificationData({
                    id: newGroupId,
                    userId: null,
                    groupId,
                    dedupeKey: newGroupId,
                    createdAt: cutoff,
                  }),
                ],
              });
              concurrentRowsInserted = true;
            }
            return memberships;
          },
        },
        notification: transaction.notification,
        notificationReceipt: transaction.notificationReceipt,
      }),
      (options) => {
        isolationLevel = (options as { readonly isolationLevel?: unknown } | undefined)
          ?.isolationLevel;
      },
    );

    const result = await markAllNotificationsRead(
      transactionalPrisma,
      userId,
      () => cutoff,
    );

    expect(isolationLevel).toBe('RepeatableRead');
    expect(concurrentRowsInserted).toBe(true);
    expect(result).toEqual({ unreadCount: 2 });
    await expect(
      prisma.notification.findUniqueOrThrow({ where: { id: oldPersonalId } }),
    ).resolves.toMatchObject({ isRead: true, readAt: cutoff });
    await expect(
      prisma.notificationReceipt.findUnique({
        where: { notificationId_userId: { notificationId: oldGroupId, userId } },
      }),
    ).resolves.toMatchObject({ notificationId: oldGroupId, userId, readAt: cutoff });
    await expect(
      prisma.notification.findUniqueOrThrow({ where: { id: newPersonalId } }),
    ).resolves.toMatchObject({ isRead: false, readAt: null });
    await expect(
      prisma.notificationReceipt.findUnique({
        where: { notificationId_userId: { notificationId: newGroupId, userId } },
      }),
    ).resolves.toBeNull();
  });

  it('rolls back personal updates when the group receipt write fails', async () => {
    const cutoff = new Date(Date.now() + 20_000);
    const personalId = `mark-all-rollback-personal-${stamp}`;
    const groupNotificationId = `mark-all-rollback-group-${stamp}`;
    await prisma.notification.createMany({
      data: [
        notificationData({
          id: personalId,
          userId,
          groupId: null,
          dedupeKey: personalId,
          createdAt: new Date(cutoff.getTime() - 1_000),
        }),
        notificationData({
          id: groupNotificationId,
          userId: null,
          groupId,
          dedupeKey: groupNotificationId,
          createdAt: new Date(cutoff.getTime() - 1_000),
        }),
      ],
    });

    const transactionalPrisma = withTransactionOverride(prisma, (transaction) => ({
      groupMember: transaction.groupMember,
      notification: transaction.notification,
      notificationReceipt: {
        createMany: async () => {
          throw new Error('INJECTED_NOTIFICATION_RECEIPT_FAILURE');
        },
      },
    }));

    await expect(
      markAllNotificationsRead(transactionalPrisma, userId, () => cutoff),
    ).rejects.toThrow('INJECTED_NOTIFICATION_RECEIPT_FAILURE');
    await expect(
      prisma.notification.findUniqueOrThrow({ where: { id: personalId } }),
    ).resolves.toMatchObject({ isRead: false, readAt: null });
    await expect(
      prisma.notificationReceipt.findUnique({
        where: {
          notificationId_userId: {
            notificationId: groupNotificationId,
            userId,
          },
        },
      }),
    ).resolves.toBeNull();
  });
});
