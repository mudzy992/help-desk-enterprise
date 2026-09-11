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

export async function applyTicketAutoAssignment(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  configurationLoader: TicketAssignmentConfigurationLoader,
  ticket: TicketRecord,
  actorUserId: string,
): Promise<TicketRecord> {
  if (ticket.assignedGroupId === null || ticket.assignedUserId !== null) {
    return ticket;
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
  const service = await prisma.service.findUnique({
    where: { id: ticket.serviceId },
    select: { autoAssignStrategy: true },
  });
  const strategy = resolveEffectiveAutoAssignStrategy({
    configuration,
    serviceStrategy: (service?.autoAssignStrategy ?? null) as AutoAssignStrategy | null,
  });
  if (strategy === 'NONE') {
    return ticket;
  }
  const originUnitPath = await loadOrganizationalUnitPath(
    prisma,
    ticket.originUnitId,
  );
  if (originUnitPath === null) {
    return ticket;
  }
  const eligibleUserIds = await listEligibleAssignmentAgents(
    prisma,
    authorizationContextLoader,
    {
      groupId: ticket.assignedGroupId,
      originUnitId: ticket.originUnitId,
      originUnitPath,
      serviceId: ticket.serviceId,
    },
  );
  const assignedUserId = await selectAssignedUserId(
    prisma,
    strategy,
    ticket.assignedGroupId,
    eligibleUserIds,
  );
  if (assignedUserId === null) {
    return ticket;
  }
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
