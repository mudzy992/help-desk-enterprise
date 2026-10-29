import { PrismaService } from '../../common/prisma/prisma.service';
import { syncTicketSlaTimers } from './sync-ticket-sla-timers';
import type { SlaConfiguration } from './sla.types';
import { slaScanBatchSize } from './sla.constants';
import { toTicketSlaTicketRef } from './to-ticket-sla-ticket-ref';
import type { TicketSlaStateRecord, TicketSlaTicketRef } from './ticket-sla.types';
import { clearSlaScanFailure, loadBlockedSlaScanTicketIds, recordSlaScanFailure } from './sla-scan-failure-quarantine';

/**
 * Phase 2.1 (plan §2.1): one bounded batch instead of "all open states".
 *
 * Before: `findMany({ where: { resolutionCompletedAt: null } })` (every open
 * record) followed by one `ticket.findUnique` per record — a sequential N+1 that
 * grew with the table.
 *
 * Now: the states whose next transition is due (`nextDueAt <= now`, the column
 * `computeSlaNextDueAt` maintains) are read in one indexed, ordered, limited
 * query, and their tickets are loaded in a second query with `id: { in: … }`.
 * The per-ticket business-hours logic itself is untouched.
 */
export async function scanDueTicketSlaStates(
  prisma: PrismaService,
  input: {
    readonly configuration: SlaConfiguration;
    readonly now?: Date;
    readonly batchSize?: number;
  },
): Promise<readonly TicketSlaStateRecord[]> {
  if (!input.configuration.enabled) {
    return [];
  }
  const now = input.now ?? new Date();
  const batchSize = input.batchSize ?? slaScanBatchSize;
  const durableQuarantine = (prisma as unknown as { slaScanFailure?: unknown }).slaScanFailure !== undefined;
  const due = (await prisma.ticketSlaState.findMany({
    where: {
      resolutionCompletedAt: null,
      nextDueAt: { lte: now },
      ...(durableQuarantine ? {
        ticket: { is: { OR: [
          { slaScanFailure: { is: null } },
          { slaScanFailure: { is: { quarantinedAt: null, OR: [
            { nextAttemptAt: null }, { nextAttemptAt: { lte: now } },
          ] } } },
        ] } },
      } : {}),
    },
    orderBy: { nextDueAt: 'asc' },
    take: batchSize,
  })) as TicketSlaStateRecord[];
  if (due.length === 0) {
    return [];
  }
  const tickets = (await prisma.ticket.findMany({
    where: { id: { in: due.map((state) => state.ticketId) } },
  })) as TicketSlaTicketRef[];
  const ticketById = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  const blocked = await loadBlockedSlaScanTicketIds(prisma, due.map((state) => state.ticketId), now);
  const updated: TicketSlaStateRecord[] = [];
  for (const state of due) {
    const ticket = ticketById.get(state.ticketId);
    if (ticket === undefined || blocked.has(state.ticketId)) continue;
    try {
      const next = await syncTicketSlaTimers(prisma, {
        ticket: toTicketSlaTicketRef(ticket),
        now,
        event: 'scanned',
        configuration: input.configuration,
      });
      if (next !== null) updated.push(next);
      await clearSlaScanFailure(prisma, state.ticketId);
    } catch (error) {
      await recordSlaScanFailure(prisma, { ticketId: state.ticketId, phase: 'scan', error, now });
    }
  }
  return updated;
}
