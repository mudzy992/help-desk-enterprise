import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { loadOrganizationalUnitPath } from '../authorization/load-authorization-scope';
import {
  changeLogActions,
  changeLogEntityTypes,
} from '../change-log/change-log.constants';
import { ticketSystemEventActions } from './collaboration.constants';
import type {
  TicketMessageRecord,
  TicketTimeLogResponse,
} from './collaboration.types';
import { calculateTimeLogDurationSeconds } from './calculate-time-log-duration';
import { insertSystemTicketEvent } from './insert-system-ticket-event';
import { loadAccessibleTicket } from './load-accessible-ticket';
import { recordCollaborationChange } from './record-collaboration-change';
import { isTicketStaffActor } from './resolve-ticket-actor-access';
import { ticketChangeLogReasons } from './tickets.constants';
import { TicketsError } from './tickets.error';
import { toTicketTimeLogResponse } from './to-collaboration-response';
import type { TicketMutationContext } from './tickets.types';

export async function stopTicketTimeLog(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  ticketId: string,
  timeLogId: string,
  context: TicketMutationContext,
  now: Date = new Date(),
): Promise<{
  timeLog: TicketTimeLogResponse;
  messages: readonly TicketMessageRecord[];
}> {
  const { ticket } = await loadAccessibleTicket(
    prisma,
    authorizationContextLoader,
    ticketId,
    context,
    { writable: true },
  );
  const authContext = await authorizationContextLoader.loadBySubjectId(
    context.actorUserId,
  );
  if (authContext === null) {
    throw new TicketsError('FORBIDDEN');
  }
  const originUnitPath = await loadOrganizationalUnitPath(
    prisma,
    ticket.originUnitId,
  );
  if (originUnitPath === null) {
    throw new TicketsError('ORIGIN_UNIT_NOT_FOUND');
  }
  if (
    !isTicketStaffActor({
      context: authContext,
      originUnitId: ticket.originUnitId,
      originUnitPath,
      serviceId: ticket.serviceId,
    })
  ) {
    throw new TicketsError('FORBIDDEN');
  }
  const current = await prisma.ticketTimeLog.findFirst({
    where: { id: timeLogId, ticketId },
  });
  if (current === null) {
    throw new TicketsError('TIME_LOG_NOT_FOUND');
  }
  if (current.endedAt !== null) {
    throw new TicketsError('TIME_LOG_IMMUTABLE');
  }
  if (
    current.userId !== context.actorUserId &&
    !authContext.isSuperAdmin
  ) {
    throw new TicketsError('FORBIDDEN');
  }
  const durationSeconds = calculateTimeLogDurationSeconds(
    current.startedAt,
    now,
  );
  const messages: TicketMessageRecord[] = [];
  const updated = await prisma.$transaction(async (transaction) => {
    const record = await transaction.ticketTimeLog.update({
      where: { id: timeLogId },
      data: { endedAt: now, durationSeconds },
    });
    await recordCollaborationChange(transaction as PrismaService, {
      entityType: changeLogEntityTypes.ticketTimeLog,
      entityId: record.id,
      action: changeLogActions.update,
      reason: ticketChangeLogReasons.timeStop,
      before: toTicketTimeLogResponse(current),
      after: toTicketTimeLogResponse(record),
      actorUserId: context.actorUserId,
    });
    messages.push(
      await insertSystemTicketEvent(transaction as PrismaService, {
        ticketId,
        action: ticketSystemEventActions.timeStopped,
        actorUserId: context.actorUserId,
      }),
    );
    return record;
  });
  return { timeLog: toTicketTimeLogResponse(updated), messages };
}
