import { PrismaService } from '../../../common/prisma/prisma.service';
import { ticketApprovalConstants } from './approvals.constants';
import type { TicketApprovalRecord } from './approvals.types';
import type { TicketRecord } from '../tickets.types';

export async function createPendingTicketApproval(
  prisma: PrismaService,
  ticket: TicketRecord,
): Promise<TicketApprovalRecord> {
  return prisma.ticketApproval.create({
    data: {
      ticketId: ticket.id,
      stepOrder: ticketApprovalConstants.firstStepOrder,
      status: 'PENDING',
    },
  }) as Promise<TicketApprovalRecord>;
}
