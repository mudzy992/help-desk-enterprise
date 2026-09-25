import { PrismaService } from '../../common/prisma/prisma.service';
import type { ForwardPingPongTicket, ReportWindow } from './reports.types';

/**
 * Package 1.6 (plan §3 D10): tickets forwarded group-to-group at least
 * `threshold` times inside the window, into a unit of the requested scope.
 * Three queries regardless of volume: events, tickets, names.
 */
export async function loadForwardPingPongTickets(
  prisma: PrismaService,
  input: {
    readonly organizationalUnitIds: readonly string[];
    readonly window: ReportWindow;
    readonly threshold: number;
  },
): Promise<readonly ForwardPingPongTicket[]> {
  if (input.organizationalUnitIds.length === 0) {
    return [];
  }
  const events = await prisma.ticketForwardEvent.findMany({
    where: {
      toUnitId: { in: [...input.organizationalUnitIds] },
      createdAt: { gte: input.window.from, lte: input.window.to },
    },
    select: {
      ticketId: true,
      fromGroupId: true,
      fromGroupName: true,
      fromUnitId: true,
      toGroupId: true,
      toGroupName: true,
      toUnitId: true,
      isCrossOu: true,
      createdAt: true,
    },
    orderBy: [{ ticketId: 'asc' }, { createdAt: 'asc' }],
  });
  const byTicket = new Map<string, (typeof events)[number][]>();
  for (const event of events) {
    // A reassignment inside the same group is not a forward.
    if (event.fromGroupId === event.toGroupId) {
      continue;
    }
    const list = byTicket.get(event.ticketId) ?? [];
    list.push(event);
    byTicket.set(event.ticketId, list);
  }
  const ticketIds = [...byTicket.entries()]
    .filter(([, list]) => list.length >= input.threshold)
    .map(([ticketId]) => ticketId);
  if (ticketIds.length === 0) {
    return [];
  }
  const tickets = await prisma.ticket.findMany({
    where: { id: { in: ticketIds } },
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      isConfidential: true,
      status: true,
      service: { select: { name: true } },
      assignedGroup: { select: { name: true } },
    },
  });
  return tickets.map((ticket) => ({
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    title: ticket.title,
    isConfidential: ticket.isConfidential,
    status: ticket.status,
    serviceName: ticket.service?.name ?? null,
    currentGroupName: ticket.assignedGroup?.name ?? null,
    events: byTicket.get(ticket.id) ?? [],
  }));
}
