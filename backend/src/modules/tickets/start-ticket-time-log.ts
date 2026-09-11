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
import { insertSystemTicketEvent } from './insert-system-ticket-event';
import { loadAccessibleTicket } from './load-accessible-ticket';
import { recordCollaborationChange } from './record-collaboration-change';
import { isTicketStaffActor } from './resolve-ticket-actor-access';
import { ticketChangeLogReasons } from './tickets.constants';
import { TicketsError } from './tickets.error';
import { toTicketTimeLogResponse } from './to-collaboration-response';
import type { TicketMutationContext } from './tickets.types';

export async function startTicketTimeLog(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  ticketId: string,
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
  const overlapping = await prisma.ticketTimeLog.findFirst({
    where: {
      ticketId,
      userId: context.actorUserId,
      endedAt: null,
    },
  });
  if (overlapping !== null) {
    throw new TicketsError('OVERLAPPING_TIMER');
  }
  const messages: TicketMessageRecord[] = [];
  const created = await prisma.$transaction(async (transaction) => {
    const record = await transaction.ticketTimeLog.create({
      data: {
        ticketId,
        userId: context.actorUserId,
        startedAt: now,
        endedAt: null,
        durationSeconds: null,
      },
    });
    await recordCollaborationChange(transaction as PrismaService, {
      entityType: changeLogEntityTypes.ticketTimeLog,
      entityId: record.id,
      action: changeLogActions.create,
      reason: ticketChangeLogReasons.timeStart,
      before: {},
      after: toTicketTimeLogResponse(record),
      actorUserId: context.actorUserId,
    });
    messages.push(
      await insertSystemTicketEvent(transaction as PrismaService, {
        ticketId,
        action: ticketSystemEventActions.timeStarted,
        actorUserId: context.actorUserId,
      }),
    );
    return record;
  });
  return { timeLog: toTicketTimeLogResponse(created), messages };
}
