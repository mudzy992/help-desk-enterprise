import { PrismaService } from '../../common/prisma/prisma.service';
import type { TicketParticipantRecord } from './collaboration.types';
import type { TicketRecord } from './tickets.types';

export async function syncHandlerGroupParticipant(
  prisma: PrismaService,
  ticket: TicketRecord,
): Promise<TicketParticipantRecord | null> {
  if (ticket.assignedGroupId === null) {
    return null;
  }
  const existing = await prisma.ticketParticipant.findFirst({
    where: {
      ticketId: ticket.id,
      role: 'HANDLER_GROUP',
      groupId: ticket.assignedGroupId,
    },
  });
  if (existing !== null) {
    return existing as TicketParticipantRecord;
  }
  return prisma.ticketParticipant.create({
    data: {
      ticketId: ticket.id,
      role: 'HANDLER_GROUP',
      groupId: ticket.assignedGroupId,
    },
  }) as Promise<TicketParticipantRecord>;
}
