import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TimeTrackingConfiguration } from './time-tracking.types';

export type ActiveTimerResponse = {
  readonly timer: {
    readonly timeLogId: string;
    readonly ticketId: string;
    readonly ticketNumber: string;
    readonly ticketTitle: string;
    readonly startedAt: string;
  } | null;
  /** What the browser needs to run the idle guard (T3). */
  readonly policy: {
    readonly idleAutoPauseMinutes: number;
    readonly autoResume: boolean;
    readonly maxSessionHours: number;
    readonly singleActivePerUser: boolean;
    readonly manualEntryEnabled: boolean;
    readonly maxBackdateDays: number;
    readonly manualMaxMinutes: number;
  };
};

/** T10: the caller's running timer (index `userId, endedAt`) plus the policy. */
export async function loadActiveTimer(
  prisma: PrismaService,
  userId: string,
  configuration: TimeTrackingConfiguration,
): Promise<ActiveTimerResponse> {
  const record = await prisma.ticketTimeLog.findFirst({
    where: { userId, endedAt: null, deletedAt: null },
    orderBy: { startedAt: 'desc' },
    select: {
      id: true,
      ticketId: true,
      startedAt: true,
      ticket: { select: { ticketNumber: true, title: true, isConfidential: true } },
    },
  });
  return {
    timer:
      record === null
        ? null
        : {
            timeLogId: record.id,
            ticketId: record.ticketId,
            ticketNumber: record.ticket.ticketNumber,
            ticketTitle: record.ticket.isConfidential ? '' : record.ticket.title,
            startedAt: record.startedAt.toISOString(),
          },
    policy: { ...configuration },
  };
}
