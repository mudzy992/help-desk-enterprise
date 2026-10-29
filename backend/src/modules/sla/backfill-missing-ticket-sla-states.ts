import { PrismaService } from '../../common/prisma/prisma.service';
import { syncTicketSlaTimers } from './sync-ticket-sla-timers';
import { toTicketSlaTicketRef } from './to-ticket-sla-ticket-ref';
import { slaBackfillBatchSize } from './sla.constants';
import type { SlaConfiguration } from './sla.types';
import type { TicketSlaStateRecord } from './ticket-sla.types';
import { clearSlaScanFailure, loadBlockedSlaScanTicketIds, recordSlaScanFailure } from './sla-scan-failure-quarantine';

/**
 * Val 2 (M10/B2). `TicketSlaState` was created only from a ticket event
 * (`syncTicketSlaTimers`) and the scanner read *existing* states, so a ticket
 * created while its service had no active profile/rule/calendar — or before the
 * rule was added — never got a clock at all: invisible to SLA monitoring,
 * compliance and the watchlist until somebody happened to touch the ticket.
 *
 * The scanner now backfills a small, bounded batch of open tickets that have no
 * SLA state yet. The clock still starts from `createdAt` (the honest start of
 * the service window), a long-overdue ticket therefore appears with its real
 * history instead of a reset clock, and the batch bound keeps one cycle cheap.
 */
export async function backfillMissingTicketSlaStates(
  prisma: PrismaService,
  input: {
    readonly configuration: SlaConfiguration;
    readonly now: Date;
    readonly batchSize?: number;
  },
): Promise<readonly TicketSlaStateRecord[]> {
  if (!input.configuration.enabled) {
    return [];
  }
  const take = input.batchSize ?? slaBackfillBatchSize;
  if (take <= 0) {
    return [];
  }
  const durableQuarantine = (prisma as unknown as { slaScanFailure?: unknown }).slaScanFailure !== undefined;
  const tickets = (await prisma.ticket.findMany({
    where: {
      status: { notIn: ['RESOLVED', 'CLOSED', 'ARCHIVED'] },
      slaState: { is: null },
      ...(durableQuarantine ? { OR: [
        { slaScanFailure: { is: null } },
        { slaScanFailure: { is: { quarantinedAt: null, OR: [
          { nextAttemptAt: null }, { nextAttemptAt: { lte: input.now } },
        ] } } },
      ] } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take,
  })) as readonly Parameters<typeof toTicketSlaTicketRef>[0][];

  const blocked = await loadBlockedSlaScanTicketIds(prisma, tickets.map((ticket) => ticket.id), input.now);
  const started: TicketSlaStateRecord[] = [];
  for (const ticket of tickets) {
    if (blocked.has(ticket.id)) continue;
    try {
      // `scanned` is neutral: backfill cannot invent a first response.
      const state = await syncTicketSlaTimers(prisma, {
        ticket: toTicketSlaTicketRef(ticket),
        now: input.now,
        event: 'scanned',
        configuration: input.configuration,
      });
      if (state !== null) started.push(state);
      await clearSlaScanFailure(prisma, ticket.id);
    } catch (error) {
      await recordSlaScanFailure(prisma, { ticketId: ticket.id, phase: 'backfill', error, now: input.now });
    }
  }
  return started;
}
