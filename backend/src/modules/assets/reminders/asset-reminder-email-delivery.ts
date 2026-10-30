import { createHash, randomUUID } from 'node:crypto';
import type { PrismaService } from '../../../common/prisma/prisma.service';

export const assetReminderEmailDeliveryStatuses = {
  claimed: 'CLAIMED',
  sent: 'SENT',
  failed: 'FAILED',
} as const;

export const assetReminderEmailClaimStaleAfterMs = 10 * 60_000;

export type AssetReminderEmailDeliveryIdentity = {
  readonly recipientHash: string;
  readonly dedupeKey: string;
};

export type AssetReminderEmailClaim =
  | { readonly kind: 'claimed'; readonly claimToken: string }
  | { readonly kind: 'sent' }
  | { readonly kind: 'in_flight' };

/** A stable pseudonymous identity; the configured address itself is not persisted. */
export function assetReminderRecipientHash(address: string): string {
  return createHash('sha256').update(address.trim().toLowerCase()).digest('hex');
}

/**
 * Atomically creates or takes over the recipient/batch claim. A sent row is a
 * durable dedupe hit; a live claim belongs to another run; FAILED and stale
 * CLAIMED rows may be retried. The token fences a prior worker from changing a
 * claim after another worker has taken it over.
 */
export async function claimAssetReminderEmailDelivery(
  prisma: PrismaService,
  identity: AssetReminderEmailDeliveryIdentity,
  options: { readonly now?: Date; readonly staleAfterMs?: number } = {},
): Promise<AssetReminderEmailClaim> {
  const now = options.now ?? new Date();
  const staleBefore = new Date(now.getTime() - (options.staleAfterMs ?? assetReminderEmailClaimStaleAfterMs));
  const where = {
    recipientHash_dedupeKey: {
      recipientHash: identity.recipientHash,
      dedupeKey: identity.dedupeKey,
    },
  };
  const existing = await prisma.assetReminderEmailDelivery.findUnique({
    where,
    select: { status: true },
  });
  if (existing?.status === assetReminderEmailDeliveryStatuses.sent) return { kind: 'sent' };

  const claimToken = randomUUID();
  if (existing !== null) {
    const takenOver = await prisma.assetReminderEmailDelivery.updateMany({
      where: {
        recipientHash: identity.recipientHash,
        dedupeKey: identity.dedupeKey,
        OR: [
          { status: assetReminderEmailDeliveryStatuses.failed },
          {
            status: assetReminderEmailDeliveryStatuses.claimed,
            updatedAt: { lt: staleBefore },
          },
        ],
      },
      data: {
        status: assetReminderEmailDeliveryStatuses.claimed,
        claimToken,
        attempts: { increment: 1 },
        updatedAt: now,
      },
    });
    if (takenOver.count === 1) return { kind: 'claimed', claimToken };
    return (await readStatus(prisma, where)) === assetReminderEmailDeliveryStatuses.sent
      ? { kind: 'sent' }
      : { kind: 'in_flight' };
  }

  try {
    await prisma.assetReminderEmailDelivery.create({
      data: {
        recipientHash: identity.recipientHash,
        dedupeKey: identity.dedupeKey,
        status: assetReminderEmailDeliveryStatuses.claimed,
        attempts: 1,
        claimToken,
      },
    });
    return { kind: 'claimed', claimToken };
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    return (await readStatus(prisma, where)) === assetReminderEmailDeliveryStatuses.sent
      ? { kind: 'sent' }
      : { kind: 'in_flight' };
  }
}

export async function markAssetReminderEmailDeliverySent(
  prisma: PrismaService,
  identity: AssetReminderEmailDeliveryIdentity,
  claimToken: string,
  now: Date = new Date(),
): Promise<boolean> {
  const result = await prisma.assetReminderEmailDelivery.updateMany({
    where: {
      recipientHash: identity.recipientHash,
      dedupeKey: identity.dedupeKey,
      status: assetReminderEmailDeliveryStatuses.claimed,
      claimToken,
    },
    data: {
      status: assetReminderEmailDeliveryStatuses.sent,
      claimToken: null,
      updatedAt: now,
    },
  });
  return result.count === 1;
}

export async function markAssetReminderEmailDeliveryFailed(
  prisma: PrismaService,
  identity: AssetReminderEmailDeliveryIdentity,
  claimToken: string,
  now: Date = new Date(),
): Promise<boolean> {
  const result = await prisma.assetReminderEmailDelivery.updateMany({
    where: {
      recipientHash: identity.recipientHash,
      dedupeKey: identity.dedupeKey,
      status: assetReminderEmailDeliveryStatuses.claimed,
      claimToken,
    },
    data: {
      status: assetReminderEmailDeliveryStatuses.failed,
      claimToken: null,
      updatedAt: now,
    },
  });
  return result.count === 1;
}

async function readStatus(
  prisma: PrismaService,
  where: {
    readonly recipientHash_dedupeKey: AssetReminderEmailDeliveryIdentity;
  },
): Promise<string | null> {
  const row = await prisma.assetReminderEmailDelivery.findUnique({
    where,
    select: { status: true },
  });
  return row?.status ?? null;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2002'
  );
}
