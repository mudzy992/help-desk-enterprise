import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { loadOrganizationalUnitPath } from '../authorization/load-authorization-scope';
import {
  changeLogActions,
  changeLogEntityTypes,
} from '../change-log/change-log.constants';
import { ticketSystemEventActions } from './collaboration.constants';
import type {
  TicketCollaborationConfiguration,
  TicketMessageRecord,
} from './collaboration.types';
import { insertSystemTicketEvent } from './insert-system-ticket-event';
import { loadAccessibleTicket } from './load-accessible-ticket';
import { requireParticipantsEnabled } from './parse-ticket-collaboration-configuration';
import { recordCollaborationChange } from './record-collaboration-change';
import { isTicketStaffActor } from './resolve-ticket-actor-access';
import { ticketChangeLogReasons } from './tickets.constants';
import { TicketsError } from './tickets.error';
import { toTicketParticipantResponse } from './to-collaboration-response';
import type { TicketMutationContext } from './tickets.types';

export async function removeTicketParticipant(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  configuration: TicketCollaborationConfiguration,
  ticketId: string,
  participantId: string,
  context: TicketMutationContext,
): Promise<readonly TicketMessageRecord[]> {
  requireParticipantsEnabled(configuration.participantsEnabled);
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
    !(await isTicketStaffActor(prisma, {
      context: authContext,
      originUnitId: ticket.originUnitId,
      originUnitPath,
      serviceId: ticket.serviceId,
      assignedGroupId: ticket.assignedGroupId,
    }))
  ) {
    throw new TicketsError('FORBIDDEN');
  }
  const participant = await prisma.ticketParticipant.findFirst({
    where: { id: participantId, ticketId },
  });
  if (participant === null) {
    throw new TicketsError('PARTICIPANT_NOT_FOUND');
  }
  if (
    participant.role === 'REQUESTER' ||
    participant.role === 'SYSTEM' ||
    (participant.role === 'ASSIGNEE' &&
      participant.userId === ticket.assignedUserId) ||
    (participant.role === 'HANDLER_GROUP' &&
      participant.groupId === ticket.assignedGroupId)
  ) {
    throw new TicketsError('PARTICIPANT_LOCKED');
  }
  const messages: TicketMessageRecord[] = [];
  await prisma.$transaction(async (transaction) => {
    await transaction.ticketParticipant.delete({
      where: { id: participantId },
    });
    await recordCollaborationChange(transaction as PrismaService, {
      entityType: changeLogEntityTypes.ticketParticipant,
      entityId: participant.id,
      action: changeLogActions.delete,
      reason: ticketChangeLogReasons.participantRemove,
      before: toTicketParticipantResponse(participant),
      after: {},
      actorUserId: context.actorUserId,
    });
    messages.push(
      await insertSystemTicketEvent(transaction as PrismaService, {
        ticketId,
        action: ticketSystemEventActions.participantRemoved,
        actorUserId: context.actorUserId,
      }),
    );
  });
  return messages;
}
