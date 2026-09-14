import { TicketStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ticketSystemEventActions } from '../tickets/collaboration.constants';

const openTicketStatuses: readonly TicketStatus[] = [
  'PENDING',
  'UNROUTED',
  'PENDING_APPROVAL',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_FOR_USER',
  'RESOLVED',
];

const remoteLifecycleBodies = [
  ticketSystemEventActions.remoteRequested,
  ticketSystemEventActions.remoteAcknowledged,
] as const;

export async function listPendingEdgeRemoteTicketIds(
  prisma: PrismaService,
  requesterId: string,
): Promise<readonly string[]> {
  const tickets = await prisma.ticket.findMany({
    where: {
      requesterId,
      status: { in: [...openTicketStatuses] },
    },
    select: { id: true },
  });
  if (tickets.length === 0) {
    return [];
  }
  const events = await prisma.ticketMessage.findMany({
    where: {
      ticketId: { in: tickets.map((ticket) => ticket.id) },
      type: 'SYSTEM_EVENT',
      body: { in: [...remoteLifecycleBodies] },
    },
    orderBy: { createdAt: 'desc' },
    select: { ticketId: true, body: true },
  });
  const latestByTicket = new Map<string, string>();
  for (const event of events) {
    if (!latestByTicket.has(event.ticketId)) {
      latestByTicket.set(event.ticketId, event.body);
    }
  }
  return [...latestByTicket.entries()]
    .filter(([, body]) => body === ticketSystemEventActions.remoteRequested)
    .map(([ticketId]) => ticketId);
}
