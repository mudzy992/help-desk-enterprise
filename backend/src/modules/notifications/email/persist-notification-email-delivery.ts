import { PrismaService } from '../../../common/prisma/prisma.service';
import { emailDeliveryStatuses } from './email-template.constants';

/**
 * A claim older than this is ambiguous: the process may have died before SMTP,
 * or SMTP may have accepted the message before the process died. BA-07 therefore
 * never takes a stale claim over for another automatic send. A retry moves it to
 * `UNKNOWN`; an operator must reconcile the outcome before any explicit replay.
 */
export const notificationEmailClaimStaleAfterMs = 10 * 60_000;

export type NotificationEmailClaimResult = 'CLAIMED' | 'DUPLICATE' | 'UNKNOWN';

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

export async function countUnknownNotificationEmailDeliveries(
  prisma: PrismaService,
): Promise<number> {
  return prisma.notificationEmailDelivery.count({
    where: { status: emailDeliveryStatuses.unknown },
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
): Promise<NotificationEmailClaimResult> {
  const now = options.now ?? new Date();
  // Do not convert a stale claim back to CLAIMED: SMTP's outcome is unknowable
  // after a process crash, so the row is preserved as operator-visible evidence.
  const markedUnknown = await prisma.notificationEmailDelivery.updateMany({
    where: {
      userId: input.userId,
      dedupeKey: input.dedupeKey,
      ...stuckNotificationEmailClaimWhere(now, options.staleAfterMs),
    },
    data: { status: emailDeliveryStatuses.unknown, updatedAt: now },
  });
  if (markedUnknown.count > 0) {
    return 'UNKNOWN';
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
    return 'CLAIMED';
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return 'DUPLICATE';
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
