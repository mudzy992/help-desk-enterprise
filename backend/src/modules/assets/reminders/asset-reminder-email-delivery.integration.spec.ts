import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';
import {
  assetReminderEmailDeliveryStatuses,
  assetReminderRecipientHash,
  claimAssetReminderEmailDelivery,
  markAssetReminderEmailDeliveryFailed,
  markAssetReminderEmailDeliverySent,
} from './asset-reminder-email-delivery';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('asset reminder extra-email durable dedupe (PostgreSQL acceptance, W7.11)', () => {
  jest.setTimeout(30_000);
  let prisma: PrismaClient;
  const recipientHashes: string[] = [];

  beforeAll(() => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  });

  afterEach(async () => {
    if (recipientHashes.length > 0) {
      await prisma.assetReminderEmailDelivery.deleteMany({
        where: { recipientHash: { in: [...recipientHashes] } },
      });
      recipientHashes.length = 0;
    }
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  function identity() {
    const token = randomUUID().replaceAll('-', '');
    const recipientHash = assetReminderRecipientHash(`w711-${token}@example.invalid`);
    recipientHashes.push(recipientHash);
    return {
      recipientHash,
      dedupeKey: `asset-expiring:${token}`,
    };
  }

  it('allows only one concurrent recipient/batch claim and dedupes after SENT', async () => {
    const key = identity();
    const now = new Date('2026-10-30T10:00:00.000Z');
    const claims = await Promise.all([
      claimAssetReminderEmailDelivery(prisma, key, { now }),
      claimAssetReminderEmailDelivery(prisma, key, { now }),
    ]);

    expect(claims.map((claim) => claim.kind).sort()).toEqual(['claimed', 'in_flight']);
    const owner = claims.find((claim) => claim.kind === 'claimed');
    expect(owner?.kind).toBe('claimed');
    if (owner?.kind !== 'claimed') throw new Error('concurrent claim has no owner');
    expect(await markAssetReminderEmailDeliverySent(prisma, key, owner.claimToken, now)).toBe(true);
    await expect(claimAssetReminderEmailDelivery(prisma, key, { now })).resolves.toEqual({
      kind: 'sent',
    });

    const row = await prisma.assetReminderEmailDelivery.findUniqueOrThrow({
      where: { recipientHash_dedupeKey: key },
    });
    expect(row).toMatchObject({
      status: assetReminderEmailDeliveryStatuses.sent,
      attempts: 1,
      claimToken: null,
    });
    expect(row).not.toHaveProperty('toAddress');
    expect(row).not.toHaveProperty('message');
  });

  it('retains FAILED status, permits retry, and fences the previous claim token', async () => {
    const key = identity();
    const now = new Date('2026-10-30T10:00:00.000Z');
    const first = await claimAssetReminderEmailDelivery(prisma, key, { now });
    expect(first.kind).toBe('claimed');
    if (first.kind !== 'claimed') throw new Error('initial claim was not acquired');
    expect(await markAssetReminderEmailDeliveryFailed(prisma, key, first.claimToken, now)).toBe(true);

    const failed = await prisma.assetReminderEmailDelivery.findUniqueOrThrow({
      where: { recipientHash_dedupeKey: key },
    });
    expect(failed).toMatchObject({ status: assetReminderEmailDeliveryStatuses.failed, attempts: 1, claimToken: null });

    const retry = await claimAssetReminderEmailDelivery(prisma, key, { now: new Date(now.getTime() + 60_000) });
    expect(retry.kind).toBe('claimed');
    if (retry.kind !== 'claimed') throw new Error('FAILED delivery was not reclaimable');
    expect(retry.claimToken).not.toBe(first.claimToken);
    expect(await markAssetReminderEmailDeliverySent(prisma, key, first.claimToken, now)).toBe(false);
    expect(await markAssetReminderEmailDeliverySent(prisma, key, retry.claimToken, now)).toBe(true);

    const sent = await prisma.assetReminderEmailDelivery.findUniqueOrThrow({
      where: { recipientHash_dedupeKey: key },
    });
    expect(sent).toMatchObject({ status: assetReminderEmailDeliveryStatuses.sent, attempts: 2, claimToken: null });
  });

  it('takes over a stale CLAIMED record after a process crash', async () => {
    const key = identity();
    const now = new Date('2026-10-30T10:00:00.000Z');
    const first = await claimAssetReminderEmailDelivery(prisma, key, { now });
    expect(first.kind).toBe('claimed');
    if (first.kind !== 'claimed') throw new Error('initial claim was not acquired');
    await prisma.assetReminderEmailDelivery.update({
      where: { recipientHash_dedupeKey: key },
      data: { updatedAt: new Date(now.getTime() - 11 * 60_000) },
    });

    const retry = await claimAssetReminderEmailDelivery(prisma, key, { now });
    expect(retry.kind).toBe('claimed');
    if (retry.kind !== 'claimed') throw new Error('stale claim was not recovered');
    expect(retry.claimToken).not.toBe(first.claimToken);
    expect(await markAssetReminderEmailDeliveryFailed(prisma, key, first.claimToken, now)).toBe(false);
    expect(await markAssetReminderEmailDeliverySent(prisma, key, retry.claimToken, now)).toBe(true);

    const row = await prisma.assetReminderEmailDelivery.findUniqueOrThrow({
      where: { recipientHash_dedupeKey: key },
    });
    expect(row).toMatchObject({ status: assetReminderEmailDeliveryStatuses.sent, attempts: 2, claimToken: null });
  });
});
