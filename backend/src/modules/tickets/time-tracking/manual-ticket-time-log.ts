import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import {
  changeLogActions,
  changeLogEntityTypes,
} from '../../change-log/change-log.constants';
import { ticketSystemEventActions } from '../collaboration.constants';
import type {
  TicketMessageRecord,
  TicketTimeLogRecord,
  TicketTimeLogResponse,
} from '../collaboration.types';
import { insertSystemTicketEvent } from '../insert-system-ticket-event';
import { recordCollaborationChange } from '../record-collaboration-change';
import { ticketChangeLogReasons } from '../tickets.constants';
import { TicketsError } from '../tickets.error';
import { toTicketTimeLogResponse } from '../to-collaboration-response';
import type { TicketMutationContext } from '../tickets.types';
import { loadTimeTrackingTicket } from './load-time-tracking-ticket';
import {
  findOverlappingTimeLog,
  lockUserTimeTracking,
  normalizeRequiredText,
  parseInstant,
} from './time-log-guards';
import type { TimeTrackingConfiguration } from './time-tracking.types';

export type ManualTimeLogInput = {
  readonly startedAt?: unknown;
  readonly durationMinutes?: unknown;
  readonly note?: unknown;
};

/** T7: past work (a phone call, an on-site visit) with a required note. */
export async function addManualTicketTimeLog(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  ticketId: string,
  input: ManualTimeLogInput,
  context: TicketMutationContext,
  configuration: TimeTrackingConfiguration,
  now: Date = new Date(),
): Promise<{ timeLog: TicketTimeLogResponse; messages: readonly TicketMessageRecord[] }> {
  if (!configuration.manualEntryEnabled) {
    throw new TicketsError('MANUAL_TIME_DISABLED');
  }
  const { ticket } = await loadTimeTrackingTicket(
    prisma,
    authorizationContextLoader,
    ticketId,
    context,
    { writable: true },
  );
  if (ticket.status === 'ARCHIVED' || (ticket.mergedIntoTicketId ?? null) !== null) {
    throw new TicketsError('TIME_TRACKING_NOT_ALLOWED_IN_STATUS');
  }
  const note = normalizeRequiredText(input.note, 'TIME_LOG_NOTE_REQUIRED');
  const startedAt = parseInstant(input.startedAt);
  const minutes = input.durationMinutes;
  if (
    typeof minutes !== 'number' ||
    !Number.isInteger(minutes) ||
    minutes < 1 ||
    minutes > configuration.manualMaxMinutes
  ) {
    throw new TicketsError('TIME_LOG_INVALID_RANGE');
  }
  const endedAt = new Date(startedAt.getTime() + minutes * 60_000);
  assertWithinBackdate(startedAt, endedAt, now, configuration.maxBackdateDays);
  const messages: TicketMessageRecord[] = [];
  const created = await prisma.$transaction(async (transaction) => {
    const tx = transaction as PrismaService;
    await lockUserTimeTracking(tx, context.actorUserId);
    if (
      (await findOverlappingTimeLog(tx, { userId: context.actorUserId, startedAt, endedAt })) !==
      null
    ) {
      throw new TicketsError('TIME_LOG_OVERLAP');
    }
    const record = (await tx.ticketTimeLog.create({
      data: {
        ticketId,
        userId: context.actorUserId,
        startedAt,
        endedAt,
        durationSeconds: minutes * 60,
        source: 'MANUAL',
        stopReason: 'MANUAL',
        note,
      },
    })) as TicketTimeLogRecord;
    await recordCollaborationChange(tx, {
      entityType: changeLogEntityTypes.ticketTimeLog,
      entityId: record.id,
      action: changeLogActions.create,
      reason: ticketChangeLogReasons.timeManualAdd,
      before: {},
      after: toTicketTimeLogResponse(record),
      actorUserId: context.actorUserId,
    });
    messages.push(
      await insertSystemTicketEvent(tx, {
        ticketId,
        action: ticketSystemEventActions.timeManualAdded,
        actorUserId: context.actorUserId,
        detail: String(minutes),
      }),
    );
    return record;
  });
  return { timeLog: toTicketTimeLogResponse(created), messages };
}

/** Not in the future, not older than the correction window. */
export function assertWithinBackdate(
  startedAt: Date,
  endedAt: Date,
  now: Date,
  maxBackdateDays: number,
): void {
  if (endedAt.getTime() <= startedAt.getTime() || endedAt.getTime() > now.getTime()) {
    throw new TicketsError('TIME_LOG_INVALID_RANGE');
  }
  if (startedAt.getTime() < now.getTime() - maxBackdateDays * 86_400_000) {
    throw new TicketsError('TIME_LOG_EDIT_WINDOW_EXPIRED');
  }
}
