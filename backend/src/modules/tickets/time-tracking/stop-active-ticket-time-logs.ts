import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketStatus } from '../../../generated/prisma/enums';
import type { TicketMessageRecord, TicketTimeLogRecord } from '../collaboration.types';
import { closeTimeLog } from './close-time-log';
import { timeTrackingSettingRanges } from '../../settings/definitions/time-tracking-settings';
import { timeTrackingLockedStatuses } from './time-tracking.constants';

/**
 * T6: a ticket that is resolved, closed, archived or merged stops every timer
 * running on it, inside the caller's transaction. Returns the owners whose
 * timer ended (for realtime).
 */
export async function stopActiveTicketTimeLogs(
  tx: PrismaService,
  input: {
    readonly ticketIds: readonly string[];
    readonly actorUserId: string | null;
    readonly now: Date;
    readonly messages?: TicketMessageRecord[];
    readonly maxSessionHours?: number;
  },
): Promise<readonly string[]> {
  if (input.ticketIds.length === 0) {
    return [];
  }
  const running = (await tx.ticketTimeLog.findMany({
    where: { ticketId: { in: [...input.ticketIds] }, endedAt: null, deletedAt: null },
  })) as TicketTimeLogRecord[];
  for (const record of running) {
    await closeTimeLog(tx, {
      record,
      endedAt: input.now,
      reason: 'AUTO_TICKET_CLOSED',
      actorUserId: input.actorUserId,
      // The configured limit is enforced by the sweep; here only the absolute
      // ceiling applies, so a status change never shortens a legal segment.
      maxSessionHours: input.maxSessionHours ?? timeTrackingSettingRanges.maxSessionHours.max,
      messages: input.messages,
    });
  }
  return running.map((record) => record.userId);
}

export function stopsTimeTracking(status: TicketStatus): boolean {
  return timeTrackingLockedStatuses.includes(status);
}
