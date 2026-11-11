import type { PrismaService } from '../../../common/prisma/prisma.service';
import {
  claimNotificationEmailDelivery,
  countDeadNotificationEmailDeliveries,
  countFailedNotificationEmailDeliveries,
  countPendingNotificationEmailRetries,
  countStuckNotificationEmailDeliveries,
  countUnknownNotificationEmailDeliveries,
  markNotificationEmailDeliveryDead,
  notificationEmailClaimStaleAfterMs,
  resetNotificationEmailDeliveryForAdminRetry,
  scheduleNotificationEmailDeliveryRetry,
  stuckNotificationEmailClaimWhere,
} from './persist-notification-email-delivery';

type FakeDeliveryDelegate = {
  updateMany: jest.Mock;
  create: jest.Mock;
  count: jest.Mock;
  findUnique: jest.Mock;
};

function createPrisma(delegate: Partial<FakeDeliveryDelegate> = {}): {
  prisma: PrismaService;
  delivery: FakeDeliveryDelegate;
} {
  const delivery: FakeDeliveryDelegate = {
    updateMany: jest.fn(async () => ({ count: 0 })),
    create: jest.fn(async () => ({ id: 'delivery-1' })),
    count: jest.fn(async () => 0),
    findUnique: jest.fn(async () => null),
    ...delegate,
  };
  return {
    prisma: { notificationEmailDelivery: delivery } as unknown as PrismaService,
    delivery,
  };
}

describe('notification e-mail claim and retry lifecycle (BA-notifications-10)', () => {
  const now = new Date('2026-10-04T10:00:00.000Z');
  const input = {
    userId: 'user-1',
    dedupeKey: 'ticket.sla:1',
    toAddress: 'user@example.com',
    templateKey: 'ticket.sla',
  };

  it('creates a fresh claim with the first attempt recorded', async () => {
    const { prisma, delivery } = createPrisma();
    await expect(claimNotificationEmailDelivery(prisma, input, { now })).resolves.toBe('CLAIMED');

    expect(delivery.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        userId: input.userId,
        dedupeKey: input.dedupeKey,
        status: 'CLAIMED',
        updatedAt: { lt: new Date(now.getTime() - notificationEmailClaimStaleAfterMs) },
      },
      data: {
        status: 'UNKNOWN',
        lastErrorCode: 'stale_claim',
        nextRetryAt: null,
        updatedAt: now,
      },
    });
    expect(delivery.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        userId: input.userId,
        dedupeKey: input.dedupeKey,
        status: { in: ['PENDING', 'FAILED'] },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      },
      data: {
        status: 'CLAIMED',
        attempts: { increment: 1 },
        lastAttemptAt: now,
        nextRetryAt: null,
        updatedAt: now,
      },
    });
    expect(delivery.create).toHaveBeenCalledWith({
      data: {
        ...input,
        status: 'CLAIMED',
        attempts: 1,
        lastAttemptAt: now,
      },
    });
  });

  it('marks a stale claim UNKNOWN instead of taking it over for another send', async () => {
    const { prisma, delivery } = createPrisma({
      updateMany: jest.fn(async () => ({ count: 1 })),
    });
    await expect(claimNotificationEmailDelivery(prisma, input, { now })).resolves.toBe('UNKNOWN');
    expect(delivery.updateMany).toHaveBeenCalledTimes(1);
    expect(delivery.create).not.toHaveBeenCalled();
  });

  it('atomically claims a due retry and increments its attempt count', async () => {
    const { prisma, delivery } = createPrisma({
      updateMany: jest.fn().mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 }),
    });
    await expect(claimNotificationEmailDelivery(prisma, input, { now })).resolves.toBe('CLAIMED');
    expect(delivery.updateMany).toHaveBeenLastCalledWith({
      where: {
        userId: input.userId,
        dedupeKey: input.dedupeKey,
        status: { in: ['PENDING', 'FAILED'] },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      },
      data: {
        status: 'CLAIMED',
        attempts: { increment: 1 },
        lastAttemptAt: now,
        nextRetryAt: null,
        updatedAt: now,
      },
    });
    expect(delivery.create).not.toHaveBeenCalled();
  });

  it('does not claim a retry before its scheduled queue time', async () => {
    const nextRetryAt = new Date(now.getTime() + 60_000);
    const { prisma, delivery } = createPrisma({
      create: jest.fn(async () => {
        throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      }),
      findUnique: jest.fn(async () => ({ status: 'PENDING', nextRetryAt })),
    });
    await expect(claimNotificationEmailDelivery(prisma, input, { now })).resolves.toBe('RETRY_PENDING');
    expect(delivery.findUnique).toHaveBeenCalledWith({
      where: { userId_dedupeKey: { userId: input.userId, dedupeKey: input.dedupeKey } },
      select: { status: true, nextRetryAt: true },
    });
    expect(delivery.create).toHaveBeenCalledTimes(1);
  });

  it('answers DUPLICATE for an existing non-retryable claim', async () => {
    const { prisma, delivery } = createPrisma({
      create: jest.fn(async () => {
        throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      }),
      findUnique: jest.fn(async () => ({ status: 'SENT', nextRetryAt: null })),
    });
    await expect(claimNotificationEmailDelivery(prisma, input, { now })).resolves.toBe('DUPLICATE');
    expect(delivery.updateMany).toHaveBeenCalledTimes(3);
  });

  it('rethrows anything that is not a unique violation', async () => {
    const failure = new Error('database is on fire');
    const { prisma } = createPrisma({
      create: jest.fn(async () => {
        throw failure;
      }),
    });
    await expect(claimNotificationEmailDelivery(prisma, input, { now })).rejects.toBe(failure);
  });

  it('copies the exact integration queue retry timestamp to the delivery ledger', async () => {
    const { prisma, delivery } = createPrisma();
    const nextRetryAt = new Date(now.getTime() + 120_000);
    await scheduleNotificationEmailDeliveryRetry(prisma, { ...input, nextRetryAt });
    expect(delivery.updateMany).toHaveBeenCalledWith({
      where: {
        userId: input.userId,
        dedupeKey: input.dedupeKey,
        status: { in: ['PENDING', 'FAILED'] },
      },
      data: { status: 'PENDING', nextRetryAt },
    });
  });

  it('moves retry exhaustion to DEAD and clears its next retry', async () => {
    const { prisma, delivery } = createPrisma();
    await markNotificationEmailDeliveryDead(prisma, input);
    expect(delivery.updateMany).toHaveBeenCalledWith({
      where: {
        userId: input.userId,
        dedupeKey: input.dedupeKey,
        status: { in: ['PENDING', 'FAILED'] },
      },
      data: { status: 'DEAD', nextRetryAt: null },
    });
  });

  it('allows an explicit admin replay of known failures but never reopens UNKNOWN', async () => {
    const { prisma, delivery } = createPrisma();
    await resetNotificationEmailDeliveryForAdminRetry(prisma, input);
    expect(delivery.updateMany).toHaveBeenCalledWith({
      where: {
        userId: input.userId,
        dedupeKey: input.dedupeKey,
        status: { in: ['PENDING', 'FAILED', 'DEAD'] },
      },
      data: { status: 'PENDING', nextRetryAt: null },
    });
    expect(delivery.updateMany.mock.calls[0]?.[0].where.status.in).not.toContain('UNKNOWN');
  });

  it('counts stale, unknown, failed, pending-retry, and dead rows by their status contract', async () => {
    const { prisma, delivery } = createPrisma({
      count: jest.fn(async () => 2),
    });
    await expect(countStuckNotificationEmailDeliveries(prisma, now)).resolves.toBe(2);
    await expect(countUnknownNotificationEmailDeliveries(prisma)).resolves.toBe(2);
    await expect(countPendingNotificationEmailRetries(prisma)).resolves.toBe(2);
    await expect(countFailedNotificationEmailDeliveries(prisma)).resolves.toBe(2);
    await expect(countDeadNotificationEmailDeliveries(prisma)).resolves.toBe(2);
    expect(delivery.count).toHaveBeenNthCalledWith(1, {
      where: stuckNotificationEmailClaimWhere(now),
    });
    expect(delivery.count).toHaveBeenNthCalledWith(2, { where: { status: 'UNKNOWN' } });
    expect(delivery.count).toHaveBeenNthCalledWith(3, { where: { status: 'PENDING' } });
    expect(delivery.count).toHaveBeenNthCalledWith(4, { where: { status: 'FAILED' } });
    expect(delivery.count).toHaveBeenNthCalledWith(5, { where: { status: 'DEAD' } });
  });
});
