import { PrismaService } from '../../../common/prisma/prisma.service';
import { emailDeliveryStatuses } from './email-template.constants';
import type { MailSendFailureKind } from './classify-mail-send-error';
import type { MailTransportResult } from './mail-transport';

/**
 * A claim older than this is ambiguous: the process may have died before SMTP,
 * or SMTP may have accepted the message before the process died. BA-07 therefore
 * never takes a stale claim over for another automatic send. A retry moves it to
 * `UNKNOWN`; an operator must reconcile the outcome before any explicit replay.
 */
export const notificationEmailClaimStaleAfterMs = 10 * 60_000;

export type NotificationEmailClaimResult =
  | 'CLAIMED'
  | 'DUPLICATE'
  | 'RETRY_PENDING'
  | 'UNKNOWN'
  | 'DEAD';

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

export async function countFailedNotificationEmailDeliveries(
  prisma: PrismaService,
): Promise<number> {
  return prisma.notificationEmailDelivery.count({
    where: { status: emailDeliveryStatuses.failed },
  });
}

export async function countPendingNotificationEmailRetries(
  prisma: PrismaService,
): Promise<number> {
  return prisma.notificationEmailDelivery.count({
    where: { status: emailDeliveryStatuses.pending },
  });
}

export async function countDeadNotificationEmailDeliveries(
  prisma: PrismaService,
): Promise<number> {
  return prisma.notificationEmailDelivery.count({
    where: { status: emailDeliveryStatuses.dead },
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
  const where = { userId: input.userId, dedupeKey: input.dedupeKey };

  // Preserve BA-07's no-blind-resend rule for ambiguous stale claims.
  const markedUnknown = await prisma.notificationEmailDelivery.updateMany({
    where: {
      ...where,
      ...stuckNotificationEmailClaimWhere(now, options.staleAfterMs),
    },
    data: {
      status: emailDeliveryStatuses.unknown,
      lastErrorCode: 'stale_claim',
      nextRetryAt: null,
      updatedAt: now,
    },
  });
  if (markedUnknown.count > 0) {
    return 'UNKNOWN';
  }

  const retryClaim = await claimScheduledRetry(prisma, where, now);
  if (retryClaim > 0) {
    return 'CLAIMED';
  }

  try {
    await prisma.notificationEmailDelivery.create({
      data: {
        ...input,
        status: emailDeliveryStatuses.claimed,
        attempts: 1,
        lastAttemptAt: now,
      },
    });
    return 'CLAIMED';
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }
  }

  // A concurrent worker may have inserted a first claim or made a retry due
  // while this worker attempted the unique insert. The conditional update lets
  // exactly one worker own a due retry; all other states remain no-send states.
  const racedRetryClaim = await claimScheduledRetry(prisma, where, now);
  if (racedRetryClaim > 0) {
    return 'CLAIMED';
  }
  const existing = await prisma.notificationEmailDelivery.findUnique({
    where: { userId_dedupeKey: where },
    select: { status: true, nextRetryAt: true },
  });
  return existing === null ? 'DUPLICATE' : existingClaimResult(existing, now);
}

async function claimScheduledRetry(
  prisma: PrismaService,
  where: { readonly userId: string; readonly dedupeKey: string },
  now: Date,
): Promise<number> {
  const claimed = await prisma.notificationEmailDelivery.updateMany({
    where: {
      ...where,
      status: { in: [emailDeliveryStatuses.pending, emailDeliveryStatuses.failed] },
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
    },
    data: {
      status: emailDeliveryStatuses.claimed,
      attempts: { increment: 1 },
      lastAttemptAt: now,
      nextRetryAt: null,
      updatedAt: now,
    },
  });
  return claimed.count;
}

function existingClaimResult(
  existing: { readonly status: string; readonly nextRetryAt: Date | null },
  now: Date,
): NotificationEmailClaimResult {
  if (existing.status === emailDeliveryStatuses.unknown) return 'UNKNOWN';
  if (existing.status === emailDeliveryStatuses.dead) return 'DEAD';
  if (
    (existing.status === emailDeliveryStatuses.pending ||
      existing.status === emailDeliveryStatuses.failed) &&
    existing.nextRetryAt !== null &&
    existing.nextRetryAt.getTime() > now.getTime()
  ) {
    return 'RETRY_PENDING';
  }
  return 'DUPLICATE';
}

export async function markNotificationEmailDeliverySent(
  prisma: PrismaService,
  input: { readonly userId: string; readonly dedupeKey: string },
  receipt: Pick<MailTransportResult, 'messageId' | 'responseCode'>,
  now: Date = new Date(),
): Promise<number> {
  const updated = await prisma.notificationEmailDelivery.updateMany({
    where: {
      userId: input.userId,
      dedupeKey: input.dedupeKey,
      status: emailDeliveryStatuses.claimed,
    },
    data: {
      status: emailDeliveryStatuses.sent,
      providerMessageId: receipt.messageId,
      providerResponseCode: receipt.responseCode,
      providerAcceptedAt: now,
      lastErrorCode: null,
      lastErrorResponseCode: null,
      nextRetryAt: null,
      updatedAt: now,
    },
  });
  return updated.count;
}

export async function markNotificationEmailDeliveryFailed(
  prisma: PrismaService,
  input: {
    readonly userId: string;
    readonly dedupeKey: string;
    readonly errorCode: MailSendFailureKind;
    readonly responseCode: number | null;
    readonly permanent: boolean;
  },
  now: Date = new Date(),
): Promise<number> {
  const updated = await prisma.notificationEmailDelivery.updateMany({
    where: {
      userId: input.userId,
      dedupeKey: input.dedupeKey,
      status: emailDeliveryStatuses.claimed,
    },
    data: {
      status: input.permanent ? emailDeliveryStatuses.dead : emailDeliveryStatuses.failed,
      lastErrorCode: input.errorCode,
      lastErrorResponseCode: input.responseCode,
      nextRetryAt: null,
      updatedAt: now,
    },
  });
  return updated.count;
}

export async function markNotificationEmailDeliveryUnknown(
  prisma: PrismaService,
  input: {
    readonly userId: string;
    readonly dedupeKey: string;
    readonly errorCode: 'ambiguous_outcome' | 'partial_acceptance' | 'missing_provider_receipt';
    readonly responseCode?: number | null;
    readonly providerMessageId?: string | null;
  },
  now: Date = new Date(),
): Promise<number> {
  const updated = await prisma.notificationEmailDelivery.updateMany({
    where: {
      userId: input.userId,
      dedupeKey: input.dedupeKey,
      status: emailDeliveryStatuses.claimed,
    },
    data: {
      status: emailDeliveryStatuses.unknown,
      lastErrorCode: input.errorCode,
      lastErrorResponseCode: input.responseCode ?? null,
      providerMessageId: input.providerMessageId ?? null,
      providerResponseCode: input.responseCode ?? null,
      nextRetryAt: null,
      updatedAt: now,
    },
  });
  return updated.count;
}

/** Mirror the integration queue's exact backoff time in the delivery ledger. */
export async function scheduleNotificationEmailDeliveryRetry(
  prisma: PrismaService,
  input: {
    readonly userId: string;
    readonly dedupeKey: string;
    readonly nextRetryAt: Date;
  },
): Promise<number> {
  const updated = await prisma.notificationEmailDelivery.updateMany({
    where: {
      userId: input.userId,
      dedupeKey: input.dedupeKey,
      status: { in: [emailDeliveryStatuses.pending, emailDeliveryStatuses.failed] },
    },
    data: {
      status: emailDeliveryStatuses.pending,
      nextRetryAt: input.nextRetryAt,
    },
  });
  return updated.count;
}

/** Explicit queue-admin replay resets only known non-accepted outcomes; UNKNOWN stays blocked. */
export async function resetNotificationEmailDeliveryForAdminRetry(
  prisma: PrismaService,
  input: { readonly userId: string; readonly dedupeKey: string },
): Promise<number> {
  const updated = await prisma.notificationEmailDelivery.updateMany({
    where: {
      userId: input.userId,
      dedupeKey: input.dedupeKey,
      status: {
        in: [emailDeliveryStatuses.pending, emailDeliveryStatuses.failed, emailDeliveryStatuses.dead],
      },
    },
    data: {
      status: emailDeliveryStatuses.pending,
      nextRetryAt: null,
    },
  });
  return updated.count;
}

/** Mark a retry exhausted by the integration queue as terminal in this ledger. */
export async function markNotificationEmailDeliveryDead(
  prisma: PrismaService,
  input: { readonly userId: string; readonly dedupeKey: string },
): Promise<number> {
  const updated = await prisma.notificationEmailDelivery.updateMany({
    where: {
      userId: input.userId,
      dedupeKey: input.dedupeKey,
      status: { in: [emailDeliveryStatuses.pending, emailDeliveryStatuses.failed] },
    },
    data: {
      status: emailDeliveryStatuses.dead,
      nextRetryAt: null,
    },
  });
  return updated.count;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2002'
  );
}
