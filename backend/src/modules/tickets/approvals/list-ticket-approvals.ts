import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { loadOrganizationalUnitPath } from '../../authorization/load-authorization-scope';
import { loadAccessibleTicket } from '../load-accessible-ticket';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext } from '../tickets.types';
import { canDecideTicketApproval } from './assert-can-decide-ticket-approval';
import type { TicketApprovalRecord, TicketApprovalResponse } from './approvals.types';
import type { TicketApprovalsConfiguration } from './approvals.types';
import { toTicketApprovalResponse } from './to-ticket-approval-response';

export async function listTicketApprovals(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  ticketId: string,
  context: TicketMutationContext,
  configuration: TicketApprovalsConfiguration,
): Promise<readonly TicketApprovalResponse[]> {
  const { ticket } = await loadAccessibleTicket(
    prisma,
    authorizationContextLoader,
    ticketId,
    context,
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
  const canDecide = canDecideTicketApproval({
    context: authContext,
    ticket,
    originUnitPath,
    configuration,
  });
  const records = (await prisma.ticketApproval.findMany({
    where: { ticketId: ticket.id },
    orderBy: { stepOrder: 'asc' },
  })) as TicketApprovalRecord[];
  return records.map((record) => toTicketApprovalResponse(record, canDecide));
}
