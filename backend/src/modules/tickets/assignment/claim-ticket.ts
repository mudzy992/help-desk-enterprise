import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { loadOrganizationalUnitPath } from '../../authorization/load-authorization-scope';
import { changeLogActions } from '../../change-log/change-log.constants';
import { assertTicketStatusTransition } from '../assert-ticket-status-transition';
import { loadTicketRecord } from '../load-ticket-record';
import { recordTicketChange } from '../record-ticket-change';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';
import { ticketAssignmentChangeLogReasons } from './assignment.constants';
import { assertCanClaimTicket } from './assert-can-claim-ticket';
import { TicketAssignmentConfigurationLoader } from './ticket-assignment-configuration.loader';

export async function claimTicket(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  configurationLoader: TicketAssignmentConfigurationLoader,
  ticketId: string,
  context: TicketMutationContext,
): Promise<TicketRecord> {
  const authContext = await authorizationContextLoader.loadBySubjectId(
    context.actorUserId,
  );
  if (authContext === null) {
    throw new TicketsError('FORBIDDEN');
  }
  const configuration = await configurationLoader.load();
  const current = await loadTicketRecord(prisma, ticketId);
  const originUnitPath = await loadOrganizationalUnitPath(
    prisma,
    current.originUnitId,
  );
  if (originUnitPath === null) {
    throw new TicketsError('ORIGIN_UNIT_NOT_FOUND');
  }
  await assertCanClaimTicket(prisma, {
    context: authContext,
    ticket: current,
    originUnitPath,
    groupInboxEnabled: configuration.groupInboxEnabled,
  });
  if (current.assignedUserId === context.actorUserId) {
    return current;
  }
  const nextStatus = current.status === 'PENDING' ? 'ASSIGNED' : current.status;
  assertTicketStatusTransition(current.status, nextStatus);
  return prisma.$transaction(async (transaction) => {
    const updated = (await transaction.ticket.update({
      where: { id: ticketId },
      data: {
        assignedUserId: context.actorUserId,
        status: nextStatus,
      },
    })) as TicketRecord;
    await recordTicketChange(transaction as PrismaService, {
      action: changeLogActions.update,
      reason: ticketAssignmentChangeLogReasons.claim,
      before: current,
      after: updated,
      actorUserId: context.actorUserId,
    });
    return updated;
  });
}
