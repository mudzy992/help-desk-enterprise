import type { PrismaService } from '../../../common/prisma/prisma.service';
import {
  claimNotificationEmailDelivery,
  countStuckNotificationEmailDeliveries,
  notificationEmailClaimStaleAfterMs,
  stuckNotificationEmailClaimWhere,
} from './persist-notification-email-delivery';

type FakeDeliveryDelegate = {
  updateMany: jest.Mock;
  create: jest.Mock;
  count: jest.Mock;
};

function createPrisma(delegate: Partial<FakeDeliveryDelegate> = {}): {
  prisma: PrismaService;
  delivery: FakeDeliveryDelegate;
} {
  const delivery: FakeDeliveryDelegate = {
    updateMany: jest.fn(async () => ({ count: 0 })),
    create: jest.fn(async () => ({ id: 'delivery-1' })),
    count: jest.fn(async () => 0),
    ...delegate,
  };
  return {
    prisma: { notificationEmailDelivery: delivery } as unknown as PrismaService,
    delivery,
  };
}

describe('notification e-mail claim (Val 3, M12/B1)', () => {
  const now = new Date('2026-10-04T10:00:00.000Z');
  const input = {
    userId: 'user-1',
    dedupeKey: 'ticket.sla:1',
    toAddress: 'user@example.com',
    templateKey: 'ticket.sla',
  };

  it('creates a fresh claim when nothing is stuck', async () => {
    const { prisma, delivery } = createPrisma();
    await expect(
      claimNotificationEmailDelivery(prisma, input, { now }),
    ).resolves.toBe(true);
    expect(delivery.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        dedupeKey: 'ticket.sla:1',
        status: 'CLAIMED',
        updatedAt: { lt: new Date(now.getTime() - notificationEmailClaimStaleAfterMs) },
      },
      data: { status: 'CLAIMED', updatedAt: now },
    });
    expect(delivery.create).toHaveBeenCalledTimes(1);
  });

  it('takes over a claim left behind by a dead process', async () => {
    const { prisma, delivery } = createPrisma({
      updateMany: jest.fn(async () => ({ count: 1 })),
    });
    await expect(
      claimNotificationEmailDelivery(prisma, input, { now }),
    ).resolves.toBe(true);
    // Takeover means send again — the row already exists, so no create.
    expect(delivery.create).not.toHaveBeenCalled();
  });

  it('answers false for a duplicate that is not stale', async () => {
    const { prisma, delivery } = createPrisma({
      create: jest.fn(async () => {
        throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      }),
    });
    await expect(
      claimNotificationEmailDelivery(prisma, input, { now }),
    ).resolves.toBe(false);
    expect(delivery.updateMany).toHaveBeenCalledTimes(1);
  });

  it('rethrows anything that is not a unique violation', async () => {
    const failure = new Error('database is on fire');
    const { prisma } = createPrisma({
      create: jest.fn(async () => {
        throw failure;
      }),
    });
    await expect(
      claimNotificationEmailDelivery(prisma, input, { now }),
    ).rejects.toBe(failure);
  });

  it('counts stuck claims with the same ten-minute cut-off', async () => {
    const { prisma, delivery } = createPrisma({
      count: jest.fn(async () => 3),
    });
    await expect(countStuckNotificationEmailDeliveries(prisma, now)).resolves.toBe(3);
    expect(delivery.count).toHaveBeenCalledWith({
      where: stuckNotificationEmailClaimWhere(now),
    });
  });
});
