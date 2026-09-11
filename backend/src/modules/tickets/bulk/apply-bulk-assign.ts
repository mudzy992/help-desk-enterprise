import { authorizationRoleKeys } from '../../authorization/authorization.constants';
import type { AuthorizationContext } from '../../authorization/authorization.types';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { TicketsError } from '../tickets.error';
import { syncAssigneeParticipant } from '../sync-assignee-participant';
import { syncHandlerGroupParticipant } from '../sync-handler-group-participant';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';
import {
  auditBulkTicketChange,
  ticketChangeLogReasons,
  ticketSystemEventActions,
} from './audit-bulk-ticket-change';
import type { ExecuteTicketBulkInput } from './bulk.types';

export async function applyBulkAssign(input: {
  readonly prisma: PrismaService;
  readonly context: AuthorizationContext;
  readonly actor: TicketMutationContext;
  readonly tickets: readonly TicketRecord[];
  readonly body: ExecuteTicketBulkInput;
  readonly batchId: string | null;
  readonly messages: TicketPersistedMessageSink;
}): Promise<readonly TicketRecord[]> {
  const updated: TicketRecord[] = [];
  for (const ticket of input.tickets) {
    await assertAgentGroupMembership(input.prisma, input.context, ticket);
    const next =
      input.body.actionType === 'assign_group'
        ? await assignGroup(input.prisma, ticket, input.body.assignedGroupId)
        : await assignUser(input.prisma, ticket, input.body.assignedUserId);
    await syncHandlerGroupParticipant(input.prisma, next);
    await syncAssigneeParticipant(input.prisma, next);
    await auditBulkTicketChange({
      prisma: input.prisma,
      before: ticket,
      after: next,
      context: input.actor,
      reason: ticketChangeLogReasons.bulkAssign,
      action: ticketSystemEventActions.ticketBulkAssign,
      batchId: input.batchId,
      messages: input.messages,
    });
    updated.push(next);
  }
  return updated;
}

async function assignGroup(
  prisma: PrismaService,
  ticket: TicketRecord,
  assignedGroupId: string | undefined,
): Promise<TicketRecord> {
  const groupId = assignedGroupId?.trim() ?? '';
  if (groupId.length === 0) {
    throw new TicketsError('HANDLER_GROUP_NOT_FOUND');
  }
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true },
  });
  if (group === null) {
    throw new TicketsError('HANDLER_GROUP_NOT_FOUND');
  }
  return prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      assignedGroupId: group.id,
      assignedUserId: null,
      status: ticket.status === 'UNROUTED' ? 'PENDING' : ticket.status,
    },
  }) as Promise<TicketRecord>;
}

async function assignUser(
  prisma: PrismaService,
  ticket: TicketRecord,
  assignedUserId: string | undefined,
): Promise<TicketRecord> {
  const userId = assignedUserId?.trim() ?? '';
  if (userId.length === 0) {
    throw new TicketsError('REQUESTER_NOT_FOUND');
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (user === null) {
    throw new TicketsError('REQUESTER_NOT_FOUND');
  }
  return prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      assignedUserId: user.id,
      status: ticket.status === 'PENDING' ? 'ASSIGNED' : ticket.status,
    },
  }) as Promise<TicketRecord>;
}

async function assertAgentGroupMembership(
  prisma: PrismaService,
  context: AuthorizationContext,
  ticket: TicketRecord,
): Promise<void> {
  if (context.isSuperAdmin) {
    return;
  }
  const isAgentOnly = context.assignments.every(
    (assignment) => assignment.roleKey === authorizationRoleKeys.agent,
  );
  if (!isAgentOnly || ticket.assignedGroupId === null) {
    return;
  }
  const membership = await prisma.groupMember.findFirst({
    where: { groupId: ticket.assignedGroupId, userId: context.subjectId },
    select: { id: true },
  });
  if (membership === null) {
    throw new TicketsError('FORBIDDEN');
  }
}
