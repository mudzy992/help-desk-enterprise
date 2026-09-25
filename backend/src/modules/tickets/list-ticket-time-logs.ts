import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import type { TicketTimeLogResponse } from './collaboration.types';
import { toTicketTimeLogResponse } from './to-collaboration-response';
import type { TicketMutationContext } from './tickets.types';
import { canManageTimeLogs } from './time-tracking/correct-ticket-time-log';
import { loadTimeTrackingTicket } from './time-tracking/load-time-tracking-ticket';

/**
 * Every staff member on the ticket sees every entry; deleted entries only
 * with `ticket.time.manage` and on request (package 1.3, T11).
 */
export async function listTicketTimeLogs(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  ticketId: string,
  context: TicketMutationContext,
  options: { readonly includeDeleted?: boolean } = {},
): Promise<readonly TicketTimeLogResponse[]> {
  const { authContext } = await loadTimeTrackingTicket(
    prisma,
    authorizationContextLoader,
    ticketId,
    context,
  );
  const includeDeleted = options.includeDeleted === true && canManageTimeLogs(authContext);
  const records = await prisma.ticketTimeLog.findMany({
    where: includeDeleted ? { ticketId } : { ticketId, deletedAt: null },
    orderBy: { startedAt: 'asc' },
  });
  return records.map(toTicketTimeLogResponse);
}
