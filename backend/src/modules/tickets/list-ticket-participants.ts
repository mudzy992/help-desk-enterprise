import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import type { TicketParticipantResponse } from './collaboration.types';
import { loadAccessibleTicket } from './load-accessible-ticket';
import { toTicketParticipantResponse } from './to-collaboration-response';
import type { TicketMutationContext } from './tickets.types';

export async function listTicketParticipants(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  ticketId: string,
  context: TicketMutationContext,
): Promise<readonly TicketParticipantResponse[]> {
  await loadAccessibleTicket(
    prisma,
    authorizationContextLoader,
    ticketId,
    context,
  );
  const records = await prisma.ticketParticipant.findMany({
    where: { ticketId },
    orderBy: { createdAt: 'asc' },
  });
  return records.map(toTicketParticipantResponse);
}
