import { PrismaService } from '../../common/prisma/prisma.service';
import type { TicketMessageRecord } from './collaboration.types';
import { publishPersistedTicketMessages } from './publish-persisted-ticket-messages';
import { TicketRealtimeHub } from './ticket-realtime.hub';
import type { TicketRecord } from './tickets.types';

export async function publishForTicketId(
  prisma: PrismaService,
  hub: TicketRealtimeHub,
  ticketId: string,
  messages: readonly TicketMessageRecord[],
): Promise<void> {
  if (messages.length === 0) {
    return;
  }
  const ticket = (await prisma.ticket.findUnique({
    where: { id: ticketId },
  })) as TicketRecord | null;
  if (ticket !== null) {
    publishPersistedTicketMessages(hub, ticket, messages);
  }
}
