import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { changeLogActions, changeLogEntityTypes } from '../change-log/change-log.constants';
import type { AddTicketParticipantInput, TicketParticipantResponse } from './collaboration.types';
import { ticketSystemEventActions } from './collaboration.constants';
import { insertSystemTicketEvent } from './insert-system-ticket-event';
import { isTicketStaffActor } from './resolve-ticket-actor-access';
import { loadAccessibleTicket } from './load-accessible-ticket';
import { loadOrganizationalUnitPath } from '../authorization/load-authorization-scope';
import { normalizeParticipantInput } from './normalize-participant-input';
import { requireParticipantsEnabled } from './parse-ticket-collaboration-configuration';
import { recordCollaborationChange } from './record-collaboration-change';
import { ticketChangeLogReasons } from './tickets.constants';
import { TicketsError } from './tickets.error';
import { toTicketParticipantResponse } from './to-collaboration-response';
import type { TicketCollaborationConfiguration } from './collaboration.types';
import type { TicketMessageRecord } from './collaboration.types';
import type { TicketMutationContext } from './tickets.types';

export async function addTicketParticipant(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  configuration: TicketCollaborationConfiguration,
  ticketId: string,
  input: AddTicketParticipantInput,
  context: TicketMutationContext,
): Promise<{
  participant: TicketParticipantResponse;
  messages: readonly TicketMessageRecord[];
}> {
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
  const identity = normalizeParticipantInput(input);
  if (identity.userId !== null) {
    const user = await prisma.user.findUnique({
      where: { id: identity.userId },
      select: { id: true },
    });
    if (user === null) {
      throw new TicketsError('PARTICIPANT_USER_NOT_FOUND');
    }
  }
  if (identity.groupId !== null) {
    const group = await prisma.group.findUnique({
      where: { id: identity.groupId },
      select: { id: true },
    });
    if (group === null) {
      throw new TicketsError('PARTICIPANT_GROUP_NOT_FOUND');
    }
  }
  const duplicate = await prisma.ticketParticipant.findFirst({
    where: {
      ticketId,
      role: identity.role,
      userId: identity.userId,
      groupId: identity.groupId,
    },
  });
  if (duplicate !== null) {
    throw new TicketsError('PARTICIPANT_DUPLICATE');
  }
  const messages: TicketMessageRecord[] = [];
  const participant = await prisma.$transaction(async (transaction) => {
    const created = await transaction.ticketParticipant.create({
      data: {
        ticketId,
        role: identity.role,
        userId: identity.userId,
        groupId: identity.groupId,
      },
    });
    await recordCollaborationChange(transaction as PrismaService, {
      entityType: changeLogEntityTypes.ticketParticipant,
      entityId: created.id,
      action: changeLogActions.create,
      reason: ticketChangeLogReasons.participantAdd,
      before: {},
      after: toTicketParticipantResponse(created),
      actorUserId: context.actorUserId,
    });
    messages.push(
      await insertSystemTicketEvent(transaction as PrismaService, {
        ticketId,
        action: ticketSystemEventActions.participantAdded,
        actorUserId: context.actorUserId,
      }),
    );
    return created;
  });
  return {
    participant: toTicketParticipantResponse(participant),
    messages,
  };
}
