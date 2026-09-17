import { PrismaService } from '../../common/prisma/prisma.service';
import type { TicketSlaStateRecord } from '../sla/ticket-sla.types';
import type { TicketSlaClientSnapshot } from './tickets.types';

type TicketSlaStateRow = Pick<
  TicketSlaStateRecord,
  | 'ticketId'
  | 'slaProfileId'
  | 'startedAt'
  | 'responseDueAt'
  | 'resolutionDueAt'
  | 'respondedAt'
  | 'resolutionCompletedAt'
  | 'pausedAt'
  | 'isResponseBreached'
  | 'isResolutionBreached'
  | 'isResponseAtRisk'
  | 'isResolutionAtRisk'
>;

export function toTicketSlaClientSnapshot(
  state: TicketSlaStateRow,
): TicketSlaClientSnapshot {
  return {
    slaProfileId: state.slaProfileId,
    startedAt: state.startedAt.toISOString(),
    responseDueAt: toIso(state.responseDueAt),
    resolutionDueAt: toIso(state.resolutionDueAt),
    respondedAt: toIso(state.respondedAt),
    resolutionCompletedAt: toIso(state.resolutionCompletedAt),
    pausedAt: toIso(state.pausedAt),
    isResponseBreached: state.isResponseBreached,
    isResolutionBreached: state.isResolutionBreached,
    isResponseAtRisk: state.isResponseAtRisk,
    isResolutionAtRisk: state.isResolutionAtRisk,
  };
}

export async function loadTicketSlaSnapshots(
  prisma: PrismaService,
  ticketIds: readonly string[],
): Promise<ReadonlyMap<string, TicketSlaClientSnapshot>> {
  if (ticketIds.length === 0) {
    return new Map();
  }
  const rows = (await prisma.ticketSlaState.findMany({
    where: { ticketId: { in: [...ticketIds] } },
  })) as TicketSlaStateRow[];
  return new Map(
    rows.map((row) => [row.ticketId, toTicketSlaClientSnapshot(row)]),
  );
}

function toIso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}
