import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import type { AuthorizationContext } from '../../authorization/authorization.types';
import { loadOrganizationalUnitPath } from '../../authorization/load-authorization-scope';
import { loadAccessibleTicket } from '../load-accessible-ticket';
import { isTicketStaffActor } from '../resolve-ticket-actor-access';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';

/**
 * Time is staff data: the actor must see the ticket and handle it as staff
 * (OU/service scope or handler-group membership). Shared by every time
 * tracking operation so the rule lives in one place.
 */
export async function loadTimeTrackingTicket(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  ticketId: string,
  context: TicketMutationContext,
  options: { readonly writable?: boolean } = {},
): Promise<{ readonly ticket: TicketRecord; readonly authContext: AuthorizationContext }> {
  const { ticket } = await loadAccessibleTicket(
    prisma,
    authorizationContextLoader,
    ticketId,
    context,
    options,
  );
  const authContext = await authorizationContextLoader.loadBySubjectId(
    context.actorUserId,
  );
  if (authContext === null) {
    throw new TicketsError('FORBIDDEN');
  }
  const originUnitPath = await loadOrganizationalUnitPath(prisma, ticket.originUnitId);
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
  return { ticket: ticket as TicketRecord, authContext };
}
