import type { AssetReminderEmailDeliveryPrisma } from './asset-reminder-email-delivery';
import {
  assetReminderEmailClaimStaleAfterMs,
  assetReminderEmailDeliveryStatuses,
  assetReminderRecipientHash,
  claimAssetReminderEmailDelivery,
  markAssetReminderEmailDeliveryFailed,
  markAssetReminderEmailDeliverySent,
} from './asset-reminder-email-delivery';

type DeliveryDelegate = {
  findUnique: jest.Mock;
  create: jest.Mock;
  updateMany: jest.Mock;
};

function createPrisma(delegate: Partial<DeliveryDelegate> = {}): {
  prisma: AssetReminderEmailDeliveryPrisma;
  delivery: DeliveryDelegate;
} {
  const delivery: DeliveryDelegate = {
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'delivery-1' }),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    ...delegate,
  };
  return {
    prisma: { assetReminderEmailDelivery: delivery } as unknown as AssetReminderEmailDeliveryPrisma,
    delivery,
  };
}

const identity = {
  recipientHash: 'a'.repeat(64),
  dedupeKey: 'asset-expiring:0123456789abcdef0123456789abcdef',
};
const now = new Date('2026-10-30T10:00:00.000Z');

describe('durable extra asset-reminder e-mail delivery (W7.11)', () => {
  it('hashes normalized addresses without retaining the address itself', () => {
    expect(assetReminderRecipientHash(' Ops@Example.com ')).toBe(
      assetReminderRecipientHash('ops@example.com'),
    );
    expect(assetReminderRecipientHash('ops@example.com')).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('creates the first claim before sending', async () => {
    const { prisma, delivery } = createPrisma();
    const claim = await claimAssetReminderEmailDelivery(prisma, identity, { now });

    expect(claim).toMatchObject({ kind: 'claimed', claimToken: expect.any(String) });
    expect(delivery.create).toHaveBeenCalledWith({
      data: {
        ...identity,
        status: assetReminderEmailDeliveryStatuses.claimed,
        attempts: 1,
        claimToken: expect.any(String),
      },
    });
    expect(delivery.updateMany).not.toHaveBeenCalled();
  });

  it('treats a durable SENT row as a dedupe hit', async () => {
    const { prisma, delivery } = createPrisma({
      findUnique: jest.fn().mockResolvedValue({ status: assetReminderEmailDeliveryStatuses.sent }),
    });

    await expect(claimAssetReminderEmailDelivery(prisma, identity, { now })).resolves.toEqual({
      kind: 'sent',
    });
    expect(delivery.create).not.toHaveBeenCalled();
    expect(delivery.updateMany).not.toHaveBeenCalled();
  });

  it('reclaims a FAILED row and increments attempts', async () => {
    const { prisma, delivery } = createPrisma({
      findUnique: jest.fn().mockResolvedValue({ status: assetReminderEmailDeliveryStatuses.failed }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    });

    const claim = await claimAssetReminderEmailDelivery(prisma, identity, { now });

    expect(claim.kind).toBe('claimed');
    expect(delivery.updateMany).toHaveBeenCalledWith({
      where: {
        ...identity,
        OR: [
          { status: assetReminderEmailDeliveryStatuses.failed },
          {
            status: assetReminderEmailDeliveryStatuses.claimed,
            updatedAt: { lt: new Date(now.getTime() - assetReminderEmailClaimStaleAfterMs) },
          },
        ],
      },
      data: {
        status: assetReminderEmailDeliveryStatuses.claimed,
        claimToken: expect.any(String),
        attempts: { increment: 1 },
        updatedAt: now,
      },
    });
    expect(delivery.create).not.toHaveBeenCalled();
  });

  it('takes over a stale claim but leaves a live claim to its owner', async () => {
    const stale = createPrisma({
      findUnique: jest.fn().mockResolvedValue({ status: assetReminderEmailDeliveryStatuses.claimed }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    });
    await expect(claimAssetReminderEmailDelivery(stale.prisma, identity, { now })).resolves.toMatchObject({
      kind: 'claimed',
    });

    const live = createPrisma({
      findUnique: jest.fn().mockResolvedValue({ status: assetReminderEmailDeliveryStatuses.claimed }),
    });
    await expect(claimAssetReminderEmailDelivery(live.prisma, identity, { now })).resolves.toEqual({
      kind: 'in_flight',
    });
  });

  it('turns a concurrent unique-key loser into an in-flight dedupe result', async () => {
    const { prisma, delivery } = createPrisma({
      findUnique: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ status: assetReminderEmailDeliveryStatuses.claimed }),
      create: jest.fn().mockRejectedValue(Object.assign(new Error('duplicate'), { code: 'P2002' })),
    });

    await expect(claimAssetReminderEmailDelivery(prisma, identity, { now })).resolves.toEqual({
      kind: 'in_flight',
    });
    expect(delivery.findUnique).toHaveBeenCalledTimes(2);
  });

  it('fences SENT/FAILED updates to the current claim token', async () => {
    const { prisma, delivery } = createPrisma({
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    });
    const claimToken = 'd40d3d7c-a170-450d-a754-fab728641f15';

    await expect(
      markAssetReminderEmailDeliverySent(prisma, identity, claimToken, now),
    ).resolves.toBe(true);
    expect(delivery.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        ...identity,
        status: assetReminderEmailDeliveryStatuses.claimed,
        claimToken,
      },
      data: {
        status: assetReminderEmailDeliveryStatuses.sent,
        claimToken: null,
        updatedAt: now,
      },
    });

    await expect(
      markAssetReminderEmailDeliveryFailed(prisma, identity, claimToken, now),
    ).resolves.toBe(true);
    expect(delivery.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        ...identity,
        status: assetReminderEmailDeliveryStatuses.claimed,
        claimToken,
      },
      data: {
        status: assetReminderEmailDeliveryStatuses.failed,
        claimToken: null,
        updatedAt: now,
      },
    });
  });
});
