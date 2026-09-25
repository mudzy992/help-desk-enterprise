import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketMessageRecord, TicketTimeLogRecord } from '../collaboration.types';
import { closeTimeLog } from './close-time-log';
import { lockUserTimeTracking } from './time-log-guards';
import { timeTrackingConstants } from './time-tracking.constants';
import type { TimeTrackingConfiguration } from './time-tracking.types';

export type TimeLogSweepResult = {
  readonly idleClosed: number;
  readonly maxDurationClosed: number;
  readonly messages: readonly TicketMessageRecord[];
  /** Owners whose timer stopped — their browsers re-read the active timer. */
  readonly ownerUserIds: readonly string[];
};

/**
 * T3 + T4 safety net, run by the worker every 5 minutes:
 *  1. segments older than `maxSessionHours` end at start + limit (AUTO_MAX_DURATION);
 *  2. with the idle guard on, segments without a heartbeat for
 *     idle + grace minutes end at their last heartbeat (AUTO_IDLE).
 * Each row closes in its own short transaction and re-checks `endedAt`, so a
 * parallel stop or a second worker never closes a segment twice.
 */
export async function sweepTimeLogs(
  prisma: PrismaService,
  configuration: TimeTrackingConfiguration,
  now: Date = new Date(),
): Promise<TimeLogSweepResult> {
  const messages: TicketMessageRecord[] = [];
  const owners = new Set<string>();
  const maxCutoff = new Date(now.getTime() - configuration.maxSessionHours * 3_600_000);
  const tooLong = (await prisma.ticketTimeLog.findMany({
    where: { endedAt: null, deletedAt: null, startedAt: { lt: maxCutoff } },
    orderBy: { startedAt: 'asc' },
    take: timeTrackingConstants.sweepBatchSize,
  })) as TicketTimeLogRecord[];
  let maxDurationClosed = 0;
  for (const record of tooLong) {
    const end = new Date(record.startedAt.getTime() + configuration.maxSessionHours * 3_600_000);
    if (await closeIfRunning(prisma, record, end, 'AUTO_MAX_DURATION', configuration, messages)) {
      maxDurationClosed += 1;
      owners.add(record.userId);
    }
  }
  let idleClosed = 0;
  if (configuration.idleAutoPauseMinutes > 0) {
    const idleCutoff = new Date(
      now.getTime() -
        (configuration.idleAutoPauseMinutes + timeTrackingConstants.heartbeatGraceMinutes) * 60_000,
    );
    const candidates = (await prisma.ticketTimeLog.findMany({
      where: {
        endedAt: null,
        deletedAt: null,
        source: 'TIMER',
        startedAt: { lt: idleCutoff },
        OR: [{ lastHeartbeatAt: null }, { lastHeartbeatAt: { lt: idleCutoff } }],
      },
      orderBy: { startedAt: 'asc' },
      take: timeTrackingConstants.sweepBatchSize,
    })) as TicketTimeLogRecord[];
    for (const record of candidates) {
      const end = record.lastHeartbeatAt ?? record.startedAt;
      if (await closeIfRunning(prisma, record, end, 'AUTO_IDLE', configuration, messages)) {
        idleClosed += 1;
        owners.add(record.userId);
      }
    }
  }
  return { idleClosed, maxDurationClosed, messages, ownerUserIds: [...owners] };
}

async function closeIfRunning(
  prisma: PrismaService,
  record: TicketTimeLogRecord,
  endedAt: Date,
  reason: 'AUTO_IDLE' | 'AUTO_MAX_DURATION',
  configuration: TimeTrackingConfiguration,
  messages: TicketMessageRecord[],
): Promise<boolean> {
  return prisma.$transaction(async (transaction) => {
    const tx = transaction as PrismaService;
    await lockUserTimeTracking(tx, record.userId);
    const fresh = (await tx.ticketTimeLog.findFirst({
      where: { id: record.id, endedAt: null, deletedAt: null },
    })) as TicketTimeLogRecord | null;
    if (fresh === null) {
      return false;
    }
    await closeTimeLog(tx, {
      record: fresh,
      endedAt,
      reason,
      actorUserId: null,
      maxSessionHours: configuration.maxSessionHours,
      messages,
    });
    return true;
  });
}
