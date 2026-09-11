import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import type { TicketMessageResponse } from './collaboration.types';
import { loadAccessibleTicket } from './load-accessible-ticket';
import { canViewTicketMessage } from './ticket-message-visibility';
import { toTicketMessageResponse } from './to-collaboration-response';
import type { TicketMutationContext } from './tickets.types';

export async function listTicketMessages(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  ticketId: string,
  context: TicketMutationContext,
): Promise<readonly TicketMessageResponse[]> {
  const { access } = await loadAccessibleTicket(
    prisma,
    authorizationContextLoader,
    ticketId,
    context,
  );
  const records = await prisma.ticketMessage.findMany({
    where: { ticketId },
    orderBy: { createdAt: 'asc' },
  });
  return records
    .filter((record) => canViewTicketMessage(access.visibility, record.type))
    .map(toTicketMessageResponse);
}
