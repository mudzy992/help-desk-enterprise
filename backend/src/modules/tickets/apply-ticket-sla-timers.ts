import type { TicketStatus } from '../../generated/prisma/enums';
import type { TicketSlaTimerEvent } from '../sla/ticket-sla.types';
import type { TicketMutationContext, TicketRecord } from './tickets.types';

export async function applyTicketSlaTimers(
  context: TicketMutationContext,
  input: {
    readonly ticket: TicketRecord;
    readonly previousStatus?: TicketStatus;
    readonly now?: Date;
    readonly event: TicketSlaTimerEvent;
  },
): Promise<void> {
  await context.slaTimers?.apply({
    ticket: {
      id: input.ticket.id,
      status: input.ticket.status,
      priority: input.ticket.priority,
      serviceId: input.ticket.serviceId,
      originUnitId: input.ticket.originUnitId,
      createdAt: input.ticket.createdAt,
      firstResponseAt: input.ticket.firstResponseAt,
      resolvedAt: input.ticket.resolvedAt,
    },
    previousStatus: input.previousStatus,
    now: input.now,
    event: input.event,
  });
}
