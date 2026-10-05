import { PrismaService } from '../../../common/prisma/prisma.service';
import { emailDeliveryStatuses } from './email-template.constants';

/**
 * Val 3 (M12/B1): a row is claimed before the send; the claim is only released in
 * the `catch` of the same process. If the process dies in between (OOM, kill -9,
 * a redeploy) the row stayed `CLAIMED` forever, and every later attempt — even a
 * durable-queue retry — was a silent no-op, so the e-mail was lost without a
 * trace. A claim older than this is therefore treated as abandoned and taken
 * over; the same filter feeds the stuck-claim counter in ops-health.
 */
export const notificationEmailClaimStaleAfterMs = 10 * 60_000;

export function stuckNotificationEmailClaimWhere(
  now: Date,
  staleAfterMs: number = notificationEmailClaimStaleAfterMs,
): { status: string; updatedAt: { lt: Date } } {
  return {
    status: emailDeliveryStatuses.claimed,
    updatedAt: { lt: new Date(now.getTime() - staleAfterMs) },
  };
}

export async function countStuckNotificationEmailDeliveries(
  prisma: PrismaService,
  now: Date = new Date(),
  staleAfterMs: number = notificationEmailClaimStaleAfterMs,
): Promise<number> {
  return prisma.notificationEmailDelivery.count({
    where: stuckNotificationEmailClaimWhere(now, staleAfterMs),
  });
}

export async function claimNotificationEmailDelivery(
  prisma: PrismaService,
  input: {
    readonly userId: string;
    readonly dedupeKey: string;
    readonly toAddress: string;
    readonly templateKey: string;
  },
  options: { readonly now?: Date; readonly staleAfterMs?: number } = {},
): Promise<boolean> {
  const now = options.now ?? new Date();
  // First: take over a claim left behind by a process that died mid-send. The
  // update refreshes `updatedAt`, so a takeover cannot happen twice.
  const takenOver = await prisma.notificationEmailDelivery.updateMany({
    where: {
      userId: input.userId,
      dedupeKey: input.dedupeKey,
      ...stuckNotificationEmailClaimWhere(now, options.staleAfterMs),
    },
    data: { status: emailDeliveryStatuses.claimed, updatedAt: now },
  });
  if (takenOver.count > 0) {
    return true;
  }
  try {
    await prisma.notificationEmailDelivery.create({
      data: {
        userId: input.userId,
        dedupeKey: input.dedupeKey,
        toAddress: input.toAddress,
        templateKey: input.templateKey,
        status: emailDeliveryStatuses.claimed,
      },
    });
    return true;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return false;
    }
    throw error;
  }
}

export async function markNotificationEmailDeliverySent(
  prisma: PrismaService,
  input: { readonly userId: string; readonly dedupeKey: string },
): Promise<void> {
  await prisma.notificationEmailDelivery.updateMany({
    where: { userId: input.userId, dedupeKey: input.dedupeKey },
    data: { status: emailDeliveryStatuses.sent },
  });
}

export async function releaseNotificationEmailDeliveryClaim(
  prisma: PrismaService,
  input: { readonly userId: string; readonly dedupeKey: string },
): Promise<void> {
  await prisma.notificationEmailDelivery.deleteMany({
    where: {
      userId: input.userId,
      dedupeKey: input.dedupeKey,
      status: emailDeliveryStatuses.claimed,
    },
  });
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2002'
  );
}
