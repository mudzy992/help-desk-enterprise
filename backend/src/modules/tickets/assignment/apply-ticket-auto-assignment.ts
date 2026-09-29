import type { AutoAssignStrategy } from '../../../generated/prisma/enums';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { changeLogActions } from '../../change-log/change-log.constants';
import { loadOrganizationalUnitPath } from '../../authorization/load-authorization-scope';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { assertTicketStatusTransition } from '../assert-ticket-status-transition';
import { recordTicketChange } from '../record-ticket-change';
import { TicketsError } from '../tickets.error';
import type { TicketRecord } from '../tickets.types';
import { ticketAssignmentChangeLogReasons } from './assignment.constants';
import { listEligibleAssignmentAgents } from './list-eligible-assignment-agents';
import {
  loadBusyCountByUserId,
  loadLastAssignedUserIdInGroup,
} from './load-assignment-selection-state';
import { resolveEffectiveAutoAssignStrategy } from './resolve-effective-auto-assign-strategy';
import {
  selectLeastBusyAgent,
  selectRoundRobinAgent,
} from './select-auto-assign-agent';
import { TicketAssignmentConfigurationLoader } from './ticket-assignment-configuration.loader';
import { syncAssigneeParticipant } from '../sync-assignee-participant';
import { insertSystemTicketEvent } from '../insert-system-ticket-event';
import { ticketSystemEventActions } from '../collaboration.constants';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { resolveOutsideHoursOnCallAssignee } from '../../on-call/resolve-outside-hours-on-call';

export async function applyTicketAutoAssignment(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  configurationLoader: TicketAssignmentConfigurationLoader,
  ticket: TicketRecord,
  actorUserId: string,
  messages: TicketPersistedMessageSink = [],
): Promise<TicketRecord> {
  if (
    ticket.status !== 'PENDING' ||
    ticket.assignedGroupId === null ||
    ticket.assignedUserId !== null
  ) {
    return ticket;
  }
  // Paket 2.9 (K3, §4.3): outside business hours a group may hand new tickets
  // to its on-call agent. Checked before the assignment configuration; if the
  // on-call agent cannot see the ticket, the normal strategy applies.
  const onCallUserId = await resolveOutsideHoursOnCallAssignee(prisma, {
    groupId: ticket.assignedGroupId,
    serviceId: ticket.serviceId,
  }).catch(() => null);
  if (onCallUserId !== null) {
    const eligible = await listEligibleForTicket(prisma, authorizationContextLoader, ticket, ticket.assignedGroupId);
    if (eligible.includes(onCallUserId)) {
      return assignTicket(prisma, ticket, onCallUserId, actorUserId, messages);
    }
  }
  let configuration: Awaited<
    ReturnType<TicketAssignmentConfigurationLoader['load']>
  >;
  try {
    configuration = await configurationLoader.load();
  } catch (error) {
    if (error instanceof TicketsError && error.code === 'ASSIGNMENT_UNAVAILABLE') {
      return ticket;
    }
    throw error;
  }
  const [service, group] = await Promise.all([
    prisma.service.findUnique({
      where: { id: ticket.serviceId },
      select: { autoAssignStrategy: true },
    }),
    prisma.group.findUnique({
      where: { id: ticket.assignedGroupId },
      select: { autoAssignStrategy: true },
    }),
  ]);
  const strategy = resolveEffectiveAutoAssignStrategy({
    configuration,
    serviceStrategy: (service?.autoAssignStrategy ?? null) as AutoAssignStrategy | null,
    groupStrategy: (group?.autoAssignStrategy ?? null) as AutoAssignStrategy | null,
  });
  if (strategy === 'NONE') {
    return ticket;
  }
  const eligibleUserIds = await listEligibleForTicket(
    prisma,
    authorizationContextLoader,
    ticket,
    ticket.assignedGroupId,
  );
  if (eligibleUserIds.length === 0) {
    return ticket;
  }
  const assignedUserId = await selectAssignedUserId(
    prisma,
    strategy,
    ticket.assignedGroupId,
    eligibleUserIds,
  );
  if (assignedUserId === null) {
    return ticket;
  }
  return assignTicket(prisma, ticket, assignedUserId, actorUserId, messages);
}

async function listEligibleForTicket(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  ticket: TicketRecord,
  groupId: string,
): Promise<readonly string[]> {
  const originUnitPath = await loadOrganizationalUnitPath(
    prisma,
    ticket.originUnitId,
  );
  if (originUnitPath === null) {
    return [];
  }
  return listEligibleAssignmentAgents(prisma, authorizationContextLoader, {
    groupId,
    originUnitId: ticket.originUnitId,
    originUnitPath,
    serviceId: ticket.serviceId,
  });
}

async function assignTicket(
  prisma: PrismaService,
  ticket: TicketRecord,
  assignedUserId: string,
  actorUserId: string,
  messages: TicketPersistedMessageSink,
): Promise<TicketRecord> {
  const nextStatus = ticket.status === 'PENDING' ? 'ASSIGNED' : ticket.status;
  assertTicketStatusTransition(ticket.status, nextStatus);
  return prisma.$transaction(async (transaction) => {
    const updated = (await transaction.ticket.update({
      where: { id: ticket.id },
      data: { assignedUserId, status: nextStatus },
    })) as TicketRecord;
    await recordTicketChange(transaction as PrismaService, {
      action: changeLogActions.update,
      reason: ticketAssignmentChangeLogReasons.assign,
      before: ticket,
      after: updated,
      actorUserId,
    });
    await syncAssigneeParticipant(transaction as PrismaService, updated);
    messages.push(
      await insertSystemTicketEvent(transaction as PrismaService, {
        ticketId: updated.id,
        action: ticketSystemEventActions.assigned,
        // Automatic routing is not an action of the person who opened the
        // ticket, so the event has no author and names the chosen assignee.
        actorUserId: null,
        detail: assignedUserId,
      }),
    );
    return updated;
  });
}

async function selectAssignedUserId(
  prisma: PrismaService,
  strategy: Exclude<AutoAssignStrategy, 'NONE'>,
  groupId: string,
  eligibleUserIds: readonly string[],
): Promise<string | null> {
  if (strategy === 'LEAST_BUSY') {
    return selectLeastBusyAgent({
      eligibleUserIds,
      busyCountByUserId: await loadBusyCountByUserId(prisma, eligibleUserIds),
    });
  }
  return selectRoundRobinAgent({
    eligibleUserIds,
    lastAssignedUserId: await loadLastAssignedUserIdInGroup(prisma, groupId),
  });
}
