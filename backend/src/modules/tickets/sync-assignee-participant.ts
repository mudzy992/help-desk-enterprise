import { PrismaService } from '../../common/prisma/prisma.service';
import type { TicketParticipantRecord } from './collaboration.types';
import type { TicketRecord } from './tickets.types';

export async function syncAssigneeParticipant(
  prisma: PrismaService,
  ticket: TicketRecord,
): Promise<TicketParticipantRecord | null> {
  if (ticket.assignedUserId === null) {
    return null;
  }
  const existing = await prisma.ticketParticipant.findFirst({
    where: {
      ticketId: ticket.id,
      role: 'ASSIGNEE',
      userId: ticket.assignedUserId,
    },
  });
  if (existing !== null) {
    return existing as TicketParticipantRecord;
  }
  return prisma.ticketParticipant.create({
    data: {
      ticketId: ticket.id,
      role: 'ASSIGNEE',
      userId: ticket.assignedUserId,
    },
  }) as Promise<TicketParticipantRecord>;
}
