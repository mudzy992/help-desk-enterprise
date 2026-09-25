import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import type { AuthorizationContext } from '../../authorization/authorization.types';
import { permissionKeys } from '../../authorization/authorization.constants';
import {
  changeLogActions,
  changeLogEntityTypes,
} from '../../change-log/change-log.constants';
import { calculateTimeLogDurationSeconds } from '../calculate-time-log-duration';
import { ticketSystemEventActions } from '../collaboration.constants';
import type {
  TicketMessageRecord,
  TicketTimeLogRecord,
  TicketTimeLogResponse,
} from '../collaboration.types';
import { insertSystemTicketEvent } from '../insert-system-ticket-event';
import { hasTicketPermission } from '../merge/has-ticket-permission';
import { recordCollaborationChange } from '../record-collaboration-change';
import { ticketChangeLogReasons } from '../tickets.constants';
import { TicketsError } from '../tickets.error';
import { toTicketTimeLogResponse } from '../to-collaboration-response';
import type { TicketMutationContext } from '../tickets.types';
import { loadTimeTrackingTicket } from './load-time-tracking-ticket';
import { assertWithinBackdate } from './manual-ticket-time-log';
import {
  findOverlappingTimeLog,
  lockUserTimeTracking,
  normalizeRequiredText,
  parseInstant,
} from './time-log-guards';
import type { TimeTrackingConfiguration } from './time-tracking.types';

export type CorrectTimeLogInput = {
  readonly startedAt?: unknown;
  readonly endedAt?: unknown;
  readonly note?: unknown;
  readonly reason?: unknown;
};

/**
 * T8: the owner corrects their own finished entries inside the backdate
 * window; `ticket.time.manage` corrects anyone's, without the window. Every
 * correction carries a reason, a change log entry and a system event.
 */
export async function correctTicketTimeLog(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  ticketId: string,
  timeLogId: string,
  input: CorrectTimeLogInput,
  context: TicketMutationContext,
  configuration: TimeTrackingConfiguration,
  now: Date = new Date(),
): Promise<{ timeLog: TicketTimeLogResponse; messages: readonly TicketMessageRecord[] }> {
  const reason = normalizeRequiredText(input.reason, 'TIME_LOG_REASON_REQUIRED');
  const { current, manager } = await loadEditableTimeLog(
    prisma,
    authorizationContextLoader,
    ticketId,
    timeLogId,
    context,
    configuration,
    now,
  );
  const startedAt = input.startedAt === undefined ? current.startedAt : parseInstant(input.startedAt);
  const endedAt =
    input.endedAt === undefined ? (current.endedAt as Date) : parseInstant(input.endedAt);
  const note =
    input.note === undefined
      ? (current.note ?? null)
      : typeof input.note === 'string' && input.note.trim().length > 0
        ? input.note.trim().slice(0, 500)
        : null;
  if ((current.source ?? 'TIMER') === 'MANUAL' && note === null) {
    throw new TicketsError('TIME_LOG_NOTE_REQUIRED');
  }
  if (manager) {
    if (endedAt.getTime() <= startedAt.getTime() || endedAt.getTime() > now.getTime()) {
      throw new TicketsError('TIME_LOG_INVALID_RANGE');
    }
  } else {
    assertWithinBackdate(startedAt, endedAt, now, configuration.maxBackdateDays);
  }
  const limitMinutes =
    (current.source ?? 'TIMER') === 'MANUAL'
      ? configuration.manualMaxMinutes
      : configuration.maxSessionHours * 60;
  if (endedAt.getTime() - startedAt.getTime() > limitMinutes * 60_000) {
    throw new TicketsError('TIME_LOG_INVALID_RANGE');
  }
  const messages: TicketMessageRecord[] = [];
  const updated = await prisma.$transaction(async (transaction) => {
    const tx = transaction as PrismaService;
    await lockUserTimeTracking(tx, current.userId);
    if (
      (await findOverlappingTimeLog(tx, {
        userId: current.userId,
        startedAt,
        endedAt,
        excludeId: current.id,
      })) !== null
    ) {
      throw new TicketsError('TIME_LOG_OVERLAP');
    }
    const record = (await tx.ticketTimeLog.update({
      where: { id: current.id },
      data: {
        startedAt,
        endedAt,
        durationSeconds: calculateTimeLogDurationSeconds(startedAt, endedAt),
        note,
        correctedAt: now,
        correctedByUserId: context.actorUserId,
        correctionReason: reason,
      },
    })) as TicketTimeLogRecord;
    await recordCollaborationChange(tx, {
      entityType: changeLogEntityTypes.ticketTimeLog,
      entityId: record.id,
      action: changeLogActions.update,
      reason: ticketChangeLogReasons.timeCorrect,
      before: toTicketTimeLogResponse(current),
      after: toTicketTimeLogResponse(record),
      actorUserId: context.actorUserId,
    });
    messages.push(
      await insertSystemTicketEvent(tx, {
        ticketId,
        action: ticketSystemEventActions.timeCorrected,
        actorUserId: context.actorUserId,
        detail: `${current.userId}:${reason}`,
      }),
    );
    return record;
  });
  return { timeLog: toTicketTimeLogResponse(updated), messages };
}

/** T8: soft delete — kept in the database and the change log, left out of sums. */
export async function deleteTicketTimeLog(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  ticketId: string,
  timeLogId: string,
  input: { readonly reason?: unknown },
  context: TicketMutationContext,
  configuration: TimeTrackingConfiguration,
  now: Date = new Date(),
): Promise<{ timeLog: TicketTimeLogResponse; messages: readonly TicketMessageRecord[] }> {
  const reason = normalizeRequiredText(input.reason, 'TIME_LOG_REASON_REQUIRED');
  const { current } = await loadEditableTimeLog(
    prisma,
    authorizationContextLoader,
    ticketId,
    timeLogId,
    context,
    configuration,
    now,
  );
  const messages: TicketMessageRecord[] = [];
  const updated = await prisma.$transaction(async (transaction) => {
    const tx = transaction as PrismaService;
    const record = (await tx.ticketTimeLog.update({
      where: { id: current.id },
      data: { deletedAt: now, deletedByUserId: context.actorUserId, deleteReason: reason },
    })) as TicketTimeLogRecord;
    await recordCollaborationChange(tx, {
      entityType: changeLogEntityTypes.ticketTimeLog,
      entityId: record.id,
      action: changeLogActions.update,
      reason: ticketChangeLogReasons.timeDelete,
      before: toTicketTimeLogResponse(current),
      after: toTicketTimeLogResponse(record),
      actorUserId: context.actorUserId,
    });
    messages.push(
      await insertSystemTicketEvent(tx, {
        ticketId,
        action: ticketSystemEventActions.timeDeleted,
        actorUserId: context.actorUserId,
        detail: `${current.userId}:${reason}`,
      }),
    );
    return record;
  });
  return { timeLog: toTicketTimeLogResponse(updated), messages };
}

export function canManageTimeLogs(authContext: AuthorizationContext): boolean {
  return hasTicketPermission(authContext, permissionKeys.ticketTimeManage);
}

async function loadEditableTimeLog(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  ticketId: string,
  timeLogId: string,
  context: TicketMutationContext,
  configuration: TimeTrackingConfiguration,
  now: Date,
): Promise<{ readonly current: TicketTimeLogRecord; readonly manager: boolean }> {
  const { authContext } = await loadTimeTrackingTicket(
    prisma,
    authorizationContextLoader,
    ticketId,
    context,
    { writable: true },
  );
  const current = (await prisma.ticketTimeLog.findFirst({
    where: { id: timeLogId, ticketId },
  })) as TicketTimeLogRecord | null;
  if (current === null || (current.deletedAt ?? null) !== null) {
    throw new TicketsError('TIME_LOG_NOT_FOUND');
  }
  if (current.endedAt === null) {
    throw new TicketsError('TIME_LOG_IMMUTABLE');
  }
  const manager = canManageTimeLogs(authContext);
  if (!manager) {
    if (current.userId !== context.actorUserId) {
      throw new TicketsError('FORBIDDEN');
    }
    if (current.startedAt.getTime() < now.getTime() - configuration.maxBackdateDays * 86_400_000) {
      throw new TicketsError('TIME_LOG_EDIT_WINDOW_EXPIRED');
    }
  }
  return { current, manager };
}
