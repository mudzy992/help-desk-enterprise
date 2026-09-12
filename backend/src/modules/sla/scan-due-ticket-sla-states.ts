import { PrismaService } from '../../common/prisma/prisma.service';
import { syncTicketSlaTimers } from './sync-ticket-sla-timers';
import type { SlaConfiguration } from './sla.types';
import { toTicketSlaTicketRef } from './to-ticket-sla-ticket-ref';
import type { TicketSlaStateRecord, TicketSlaTicketRef } from './ticket-sla.types';

export async function scanDueTicketSlaStates(
  prisma: PrismaService,
  input: {
    readonly configuration: SlaConfiguration;
    readonly now?: Date;
  },
): Promise<readonly TicketSlaStateRecord[]> {
  if (!input.configuration.enabled) {
    return [];
  }
  const now = input.now ?? new Date();
  const open = (await prisma.ticketSlaState.findMany({
    where: { resolutionCompletedAt: null },
  })) as TicketSlaStateRecord[];
  const updated: TicketSlaStateRecord[] = [];
  for (const state of open) {
    const ticket = (await prisma.ticket.findUnique({
      where: { id: state.ticketId },
    })) as TicketSlaTicketRef | null;
    if (ticket === null) {
      continue;
    }
    const next = await syncTicketSlaTimers(prisma, {
      ticket: toTicketSlaTicketRef(ticket),
      now,
      event: 'scanned',
      configuration: input.configuration,
    });
    if (next !== null) {
      updated.push(next);
    }
  }
  return updated;
}
