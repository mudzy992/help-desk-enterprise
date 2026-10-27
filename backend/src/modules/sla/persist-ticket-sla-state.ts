import { PrismaService } from '../../common/prisma/prisma.service';
import { isPrismaUniqueConstraintError } from './is-prisma-unique-constraint-error';
import type { TicketSlaStateRecord } from './ticket-sla.types';

export async function loadTicketSlaState(
  prisma: PrismaService,
  ticketId: string,
): Promise<TicketSlaStateRecord | null> {
  const record = await prisma.ticketSlaState.findUnique({
    where: { ticketId },
  });
  return record as TicketSlaStateRecord | null;
}

export async function persistTicketSlaState(
  prisma: PrismaService,
  state: Omit<TicketSlaStateRecord, 'id' | 'updatedAt'> & {
    readonly id?: string;
  },
): Promise<TicketSlaStateRecord> {
  const data = {
    slaProfileId: state.slaProfileId,
    slaRuleId: state.slaRuleId,
    responseMinutes: state.responseMinutes,
    resolutionMinutes: state.resolutionMinutes,
    startedAt: state.startedAt,
    responseDueAt: state.responseDueAt,
    resolutionDueAt: state.resolutionDueAt,
    respondedAt: state.respondedAt,
    resolutionCompletedAt: state.resolutionCompletedAt,
    pausedAt: state.pausedAt,
    pausedBusinessMinutes: state.pausedBusinessMinutes,
    isResponseBreached: state.isResponseBreached,
    isResolutionBreached: state.isResolutionBreached,
    isResponseAtRisk: state.isResponseAtRisk,
    isResolutionAtRisk: state.isResolutionAtRisk,
    firedEscalationKeys: [...(state.firedEscalationKeys ?? [])],
    // Phase 2.1: the scheduling column the scanner filters on.
    nextDueAt: state.nextDueAt,
  };
  if (state.id !== undefined && state.id.length > 0) {
    return (await prisma.ticketSlaState.update({
      where: { id: state.id },
      data,
    })) as TicketSlaStateRecord;
  }
  const delegate = prisma.ticketSlaState as typeof prisma.ticketSlaState & {
    upsert?: (args: {
      where: { ticketId: string };
      create: typeof data & { ticketId: string };
      update: Record<string, never>;
    }) => Promise<TicketSlaStateRecord>;
  };
  // Production Prisma translates this to a database-native conflict-safe
  // first-writer-wins operation. The empty update deliberately preserves every
  // field selected by the winner instead of applying the loser's stale state.
  try {
    if (typeof delegate.upsert === 'function') {
      return await delegate.upsert({
        where: { ticketId: state.ticketId },
        create: { ticketId: state.ticketId, ...data },
        update: {},
      });
    }
    return (await delegate.create({
      data: { ticketId: state.ticketId, ...data },
    })) as TicketSlaStateRecord;
  } catch (error) {
    // Prisma may emulate upsert as read/create with driver adapters. A parallel
    // winner can therefore still surface P2002; reload it without overwriting.
    if (!isPrismaUniqueConstraintError(error)) {
      throw error;
    }
    const winner = await delegate.findUnique({
      where: { ticketId: state.ticketId },
    });
    if (winner === null) {
      throw error;
    }
    return winner as TicketSlaStateRecord;
  }
}

export async function persistTicketFirstResponseAt(
  prisma: PrismaService,
  ticketId: string,
  firstResponseAt: Date,
): Promise<void> {
  // Monotone first-writer-wins update: a delayed scanner/request must never
  // replace the timestamp persisted by the first agent response.
  const ticket = prisma.ticket as typeof prisma.ticket & {
    updateMany?: (args: {
      where: { id: string; firstResponseAt: null };
      data: { firstResponseAt: Date };
    }) => Promise<unknown>;
  };
  if (typeof ticket.updateMany === 'function') {
    await ticket.updateMany({
      where: { id: ticketId, firstResponseAt: null },
      data: { firstResponseAt },
    });
    return;
  }
  // In-memory domain adapter; its single-threaded update preserves test parity.
  await ticket.update({ where: { id: ticketId }, data: { firstResponseAt } });
}
