import { PrismaService } from '../../common/prisma/prisma.service';
import type { ParticipantRole } from '../../generated/prisma/enums';
import { defaultTicketCollaborationConfiguration } from './collaboration.constants';
import type { TicketParticipantRecord } from './collaboration.types';
import type { TicketRecord } from './tickets.types';

export async function seedDefaultTicketParticipants(
  prisma: PrismaService,
  ticket: TicketRecord,
  roles: readonly ParticipantRole[] = defaultTicketCollaborationConfiguration.defaultParticipantRoles,
): Promise<readonly TicketParticipantRecord[]> {
  const created: TicketParticipantRecord[] = [];
  if (roles.includes('REQUESTER')) {
    created.push(
      (await prisma.ticketParticipant.create({
        data: {
          ticketId: ticket.id,
          role: 'REQUESTER',
          userId: ticket.requesterId,
        },
      })) as TicketParticipantRecord,
    );
  }
  if (roles.includes('HANDLER_GROUP') && ticket.assignedGroupId !== null) {
    created.push(
      (await prisma.ticketParticipant.create({
        data: {
          ticketId: ticket.id,
          role: 'HANDLER_GROUP',
          groupId: ticket.assignedGroupId,
        },
      })) as TicketParticipantRecord,
    );
  }
  return created;
}
