import { PrismaService } from '../../../common/prisma/prisma.service';
import type { AuthorizationContext } from '../../authorization/authorization.types';
import { canChangeTicketStatus } from '../authorize-ticket-actor';
import { TicketsError } from '../tickets.error';
import type { TicketRecord } from '../tickets.types';
import { claimableTicketStatuses } from './assignment.constants';

export async function assertCanClaimTicket(
  prisma: PrismaService,
  input: {
    readonly context: AuthorizationContext;
    readonly ticket: TicketRecord;
    readonly originUnitPath: string;
    readonly groupInboxEnabled: boolean;
  },
): Promise<void> {
  if (!input.groupInboxEnabled) {
    throw new TicketsError('GROUP_INBOX_DISABLED');
  }
  if (input.ticket.assignedGroupId === null) {
    throw new TicketsError('TICKET_NOT_CLAIMABLE');
  }
  if (
    !claimableTicketStatuses.includes(
      input.ticket.status as (typeof claimableTicketStatuses)[number],
    )
  ) {
    throw new TicketsError('TICKET_NOT_CLAIMABLE');
  }
  if (!canChangeTicketStatus(input.context)) {
    throw new TicketsError('FORBIDDEN');
  }
  if (input.context.isSuperAdmin) {
    return;
  }
  // Group membership is required below; with it, a member of the assigned
  // group may claim even outside the ticket's OU scope (decision D1, 1.1).
  const membership = await prisma.groupMember.findFirst({
    where: {
      groupId: input.ticket.assignedGroupId,
      userId: input.context.subjectId,
    },
    select: { id: true },
  });
  if (membership === null) {
    throw new TicketsError('FORBIDDEN');
  }
}
