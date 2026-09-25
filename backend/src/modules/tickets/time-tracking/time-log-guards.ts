import { PrismaService } from '../../../common/prisma/prisma.service';
import { TicketsError } from '../tickets.error';
import type { TicketTimeLogRecord } from '../collaboration.types';
import { timeTrackingConstants } from './time-tracking.constants';

/**
 * T5: one transaction per user at a time touches the running timers, so two
 * parallel starts cannot both see "no active timer". A partial unique index
 * would say the same, but it drifts the Prisma schema (seen before).
 */
export async function lockUserTimeTracking(tx: PrismaService, userId: string): Promise<void> {
  const raw = (tx as unknown as { $queryRaw?: unknown }).$queryRaw;
  if (typeof raw !== 'function') {
    return; // in-memory test client: single-threaded, nothing to lock
  }
  const key = `ticket-time:${userId}`;
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${key}))`;
}

/** A running entry counts as open-ended. Touching ends are not an overlap. */
export async function findOverlappingTimeLog(
  tx: PrismaService,
  input: {
    readonly userId: string;
    readonly startedAt: Date;
    readonly endedAt: Date;
    readonly excludeId?: string;
  },
): Promise<TicketTimeLogRecord | null> {
  return (await tx.ticketTimeLog.findFirst({
    where: {
      userId: input.userId,
      deletedAt: null,
      ...(input.excludeId === undefined ? {} : { id: { not: input.excludeId } }),
      startedAt: { lt: input.endedAt },
      OR: [{ endedAt: null }, { endedAt: { gt: input.startedAt } }],
    },
  })) as TicketTimeLogRecord | null;
}

export function normalizeRequiredText(
  value: unknown,
  code: 'TIME_LOG_REASON_REQUIRED' | 'TIME_LOG_NOTE_REQUIRED',
): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (
    text.length < timeTrackingConstants.minimumReasonLength ||
    text.length > timeTrackingConstants.maximumReasonLength
  ) {
    throw new TicketsError(code);
  }
  return text;
}

export function parseInstant(value: unknown): Date {
  if (typeof value !== 'string' && !(value instanceof Date)) {
    throw new TicketsError('TIME_LOG_INVALID_RANGE');
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TicketsError('TIME_LOG_INVALID_RANGE');
  }
  return date;
}

/** T4: no segment may be longer than the hard limit, whoever ends it. */
export function capSegmentEnd(startedAt: Date, endedAt: Date, maxSessionHours: number): Date {
  const limit = startedAt.getTime() + maxSessionHours * 3_600_000;
  return endedAt.getTime() > limit ? new Date(limit) : endedAt;
}
