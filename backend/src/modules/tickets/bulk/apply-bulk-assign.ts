import { authorizationRoleKeys } from '../../authorization/authorization.constants';
import type { AuthorizationContext } from '../../authorization/authorization.types';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { TicketsError } from '../tickets.error';
import { syncAssigneeParticipant } from '../sync-assignee-participant';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';
import {
  auditBulkTicketChange,
  ticketChangeLogReasons,
  ticketSystemEventActions,
} from './audit-bulk-ticket-change';
import {
  applyTicketForward,
  planTicketForward,
  type TicketForwardPlan,
} from '../forwarding/forward-ticket';
import type {
  BulkForwardingDependencies,
  ExecuteTicketBulkInput,
} from './bulk.types';

export async function applyBulkAssign(input: {
  readonly prisma: PrismaService;
  readonly context: AuthorizationContext;
  readonly actor: TicketMutationContext;
  readonly tickets: readonly TicketRecord[];
  readonly body: ExecuteTicketBulkInput;
  readonly batchId: string | null;
  readonly messages: TicketPersistedMessageSink;
  readonly forwarding: BulkForwardingDependencies;
}): Promise<readonly TicketRecord[]> {
  if (input.body.actionType === 'assign_group') {
    return forwardBulkTickets(input);
  }
  const updated: TicketRecord[] = [];
  for (const ticket of input.tickets) {
    await assertAgentGroupMembership(input.prisma, input.context, ticket);
    const next = await assignUser(
      input.prisma,
      ticket,
      input.body.assignedUserId,
    );
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

/**
 * Every ticket is validated first (status, group membership, cross-OU
 * permission, reason), so one bad ticket rejects the batch before any write.
 */
async function forwardBulkTickets(input: {
  readonly prisma: PrismaService;
  readonly context: AuthorizationContext;
  readonly actor: TicketMutationContext;
  readonly tickets: readonly TicketRecord[];
  readonly body: ExecuteTicketBulkInput;
  readonly batchId: string | null;
  readonly messages: TicketPersistedMessageSink;
  readonly forwarding: BulkForwardingDependencies;
}): Promise<readonly TicketRecord[]> {
  const configuration = input.forwarding.configuration;
  if (configuration === null) {
    throw new TicketsError('FORWARDING_UNAVAILABLE');
  }
  const targetGroupId = input.body.assignedGroupId?.trim() ?? '';
  if (targetGroupId.length === 0) {
    throw new TicketsError('HANDLER_GROUP_NOT_FOUND');
  }
  const plans: TicketForwardPlan[] = [];
  for (const ticket of input.tickets) {
    if (ticket.assignedGroupId === targetGroupId) {
      continue;
    }
    plans.push(
      await planTicketForward({
        prisma: input.prisma,
        authorizationContextLoader: input.forwarding.authorizationContextLoader,
        configuration,
        authContext: input.context,
        ticket,
        body: { targetGroupId, reason: input.body.reason },
      }),
    );
  }
  const updated: TicketRecord[] = [];
  for (const plan of plans) {
    updated.push(
      await applyTicketForward({
        prisma: input.prisma,
        plan,
        configuration,
        actorUserId: input.actor.actorUserId,
        keepMeAsWatcher: false,
        viaBulk: true,
        batchId: input.batchId,
        messages: input.messages,
      }),
    );
  }
  const unchanged = input.tickets.filter(
    (ticket) => !plans.some((plan) => plan.ticket.id === ticket.id),
  );
  return [...updated, ...unchanged];
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
