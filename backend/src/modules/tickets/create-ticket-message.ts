import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import type {
  CreateTicketMessageInput,
  TicketCollaborationConfiguration,
  TicketMessageRecord,
} from './collaboration.types';
import { loadAccessibleTicket } from './load-accessible-ticket';
import { normalizeTicketMessageInput } from './normalize-ticket-message-input';
import type { TicketMutationContext, TicketRecord } from './tickets.types';

export async function createTicketMessage(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  configuration: TicketCollaborationConfiguration,
  ticketId: string,
  input: CreateTicketMessageInput,
  context: TicketMutationContext,
): Promise<{ ticket: TicketRecord; message: TicketMessageRecord }> {
  const { ticket, access } = await loadAccessibleTicket(
    prisma,
    authorizationContextLoader,
    ticketId,
    context,
  );
  const normalized = normalizeTicketMessageInput(input, access, configuration);
  const message = (await prisma.ticketMessage.create({
    data: {
      ticketId: ticket.id,
      type: normalized.type,
      body: normalized.body,
      authorUserId: context.actorUserId,
    },
  })) as TicketMessageRecord;
  return { ticket, message };
}
