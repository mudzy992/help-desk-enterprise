import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  changeLogActions,
  changeLogEntityTypes,
} from '../../change-log/change-log.constants';
import { calculateTimeLogDurationSeconds } from '../calculate-time-log-duration';
import { ticketSystemEventActions } from '../collaboration.constants';
import type {
  TicketMessageRecord,
  TicketTimeLogRecord,
  TimeLogStopReason,
} from '../collaboration.types';
import { insertSystemTicketEvent } from '../insert-system-ticket-event';
import { recordCollaborationChange } from '../record-collaboration-change';
import { ticketChangeLogReasons } from '../tickets.constants';
import { toTicketTimeLogResponse } from '../to-collaboration-response';
import { capSegmentEnd } from './time-log-guards';

/**
 * Ends one running segment inside the caller's transaction: caps it at the
 * hard limit (T4), stores why it ended, writes the change log and one system
 * event. A manual stop keeps the old `ticket_time_stopped` event; automatic
 * stops write `ticket_time_auto_stopped:<reason>:<ownerUserId>` so the owner
 * can be notified and the activity can say why.
 */
export async function closeTimeLog(
  tx: PrismaService,
  input: {
    readonly record: TicketTimeLogRecord;
    readonly endedAt: Date;
    readonly reason: TimeLogStopReason;
    /** null for the scheduler. */
    readonly actorUserId: string | null;
    readonly maxSessionHours: number;
    readonly messages?: TicketMessageRecord[];
  },
): Promise<TicketTimeLogRecord> {
  const { record } = input;
  const requestedEnd =
    input.endedAt.getTime() < record.startedAt.getTime() ? record.startedAt : input.endedAt;
  const endedAt = capSegmentEnd(record.startedAt, requestedEnd, input.maxSessionHours);
  const reason: TimeLogStopReason =
    endedAt.getTime() < requestedEnd.getTime() && input.reason === 'MANUAL'
      ? 'AUTO_MAX_DURATION'
      : input.reason;
  const updated = (await tx.ticketTimeLog.update({
    where: { id: record.id },
    data: {
      endedAt,
      durationSeconds: calculateTimeLogDurationSeconds(record.startedAt, endedAt),
      stopReason: reason,
    },
  })) as TicketTimeLogRecord;
  await recordCollaborationChange(tx, {
    entityType: changeLogEntityTypes.ticketTimeLog,
    entityId: record.id,
    action: changeLogActions.update,
    reason:
      reason === 'MANUAL' ? ticketChangeLogReasons.timeStop : ticketChangeLogReasons.timeAutoStop,
    before: toTicketTimeLogResponse(record),
    after: toTicketTimeLogResponse(updated),
    actorUserId: input.actorUserId,
  });
  const message =
    reason === 'MANUAL'
      ? await insertSystemTicketEvent(tx, {
          ticketId: record.ticketId,
          action: ticketSystemEventActions.timeStopped,
          actorUserId: input.actorUserId,
        })
      : await insertSystemTicketEvent(tx, {
          ticketId: record.ticketId,
          action: ticketSystemEventActions.timeAutoStopped,
          actorUserId: input.actorUserId,
          detail: `${reason}:${record.userId}`,
        });
  input.messages?.push(message);
  return updated;
}
