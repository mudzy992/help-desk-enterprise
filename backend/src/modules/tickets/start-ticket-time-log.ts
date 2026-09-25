import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import {
  changeLogActions,
  changeLogEntityTypes,
} from '../change-log/change-log.constants';
import { ticketSystemEventActions } from './collaboration.constants';
import type {
  TicketMessageRecord,
  TicketTimeLogRecord,
  TicketTimeLogResponse,
} from './collaboration.types';
import { insertSystemTicketEvent } from './insert-system-ticket-event';
import { recordCollaborationChange } from './record-collaboration-change';
import { ticketChangeLogReasons } from './tickets.constants';
import { TicketsError } from './tickets.error';
import { toTicketTimeLogResponse } from './to-collaboration-response';
import type { TicketMutationContext } from './tickets.types';
import { closeTimeLog } from './time-tracking/close-time-log';
import { loadTimeTrackingTicket } from './time-tracking/load-time-tracking-ticket';
import { lockUserTimeTracking } from './time-tracking/time-log-guards';
import {
  defaultTimeTrackingConfiguration,
  timeTrackingLockedStatuses,
} from './time-tracking/time-tracking.constants';
import type { TimeTrackingConfiguration } from './time-tracking/time-tracking.types';

export type StartTicketTimeLogOptions = {
  /** T5: stop the timer running on another ticket and start here. */
  readonly switchFromActive?: boolean;
  readonly configuration?: TimeTrackingConfiguration;
};

/**
 * Starts a timer segment (package 1.3): not on a resolved/closed/archived or
 * merged ticket (T6), at most one running timer per user across tickets when
 * configured (T5, under a per-user advisory lock).
 */
export async function startTicketTimeLog(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  ticketId: string,
  context: TicketMutationContext,
  now: Date = new Date(),
  options: StartTicketTimeLogOptions = {},
): Promise<{
  timeLog: TicketTimeLogResponse;
  messages: readonly TicketMessageRecord[];
  /** Ticket of a timer that was switched off, for realtime publishing. */
  switchedTicketId: string | null;
}> {
  const configuration = options.configuration ?? defaultTimeTrackingConfiguration;
  const { ticket } = await loadTimeTrackingTicket(
    prisma,
    authorizationContextLoader,
    ticketId,
    context,
    { writable: true },
  );
  if (
    timeTrackingLockedStatuses.includes(ticket.status) ||
    (ticket.mergedIntoTicketId ?? null) !== null
  ) {
    throw new TicketsError('TIME_TRACKING_NOT_ALLOWED_IN_STATUS');
  }
  const messages: TicketMessageRecord[] = [];
  let switchedTicketId: string | null = null;
  const created = await prisma.$transaction(async (transaction) => {
    const tx = transaction as PrismaService;
    await lockUserTimeTracking(tx, context.actorUserId);
    const running = (await tx.ticketTimeLog.findMany({
      where: { userId: context.actorUserId, endedAt: null, deletedAt: null },
    })) as TicketTimeLogRecord[];
    if (running.some((log) => log.ticketId === ticketId)) {
      throw new TicketsError('OVERLAPPING_TIMER');
    }
    const elsewhere = configuration.singleActivePerUser ? running : [];
    if (elsewhere.length > 0 && options.switchFromActive !== true) {
      const first = elsewhere[0];
      const other = await tx.ticket.findFirst({
        where: { id: first.ticketId },
        select: { ticketNumber: true },
      });
      throw new TicketsError('ACTIVE_TIMER_ELSEWHERE', undefined, {
        ticketId: first.ticketId,
        ticketNumber: other?.ticketNumber ?? null,
        timeLogId: first.id,
        startedAt: first.startedAt.toISOString(),
      });
    }
    for (const log of elsewhere) {
      await closeTimeLog(tx, {
        record: log,
        endedAt: now,
        reason: 'AUTO_SWITCHED',
        actorUserId: context.actorUserId,
        maxSessionHours: configuration.maxSessionHours,
        messages,
      });
      switchedTicketId = log.ticketId;
    }
    const record = (await tx.ticketTimeLog.create({
      data: {
        ticketId,
        userId: context.actorUserId,
        startedAt: now,
        endedAt: null,
        durationSeconds: null,
        source: 'TIMER',
        lastHeartbeatAt: now,
      },
    })) as TicketTimeLogRecord;
    await recordCollaborationChange(tx, {
      entityType: changeLogEntityTypes.ticketTimeLog,
      entityId: record.id,
      action: changeLogActions.create,
      reason: ticketChangeLogReasons.timeStart,
      before: {},
      after: toTicketTimeLogResponse(record),
      actorUserId: context.actorUserId,
    });
    messages.push(
      await insertSystemTicketEvent(tx, {
        ticketId,
        action: ticketSystemEventActions.timeStarted,
        actorUserId: context.actorUserId,
      }),
    );
    return record;
  });
  return { timeLog: toTicketTimeLogResponse(created), messages, switchedTicketId };
}
