import type { TicketStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../../common/prisma/prisma.service';

const terminalTicketStatuses: readonly TicketStatus[] = [
  'RESOLVED',
  'CLOSED',
  'ARCHIVED',
];

export async function countOpenTicketsByService(
  prisma: PrismaService,
  serviceIds: readonly string[],
): Promise<ReadonlyMap<string, number>> {
  const counts = new Map<string, number>();
  for (const serviceId of serviceIds) {
    counts.set(serviceId, 0);
  }
  if (serviceIds.length === 0) {
    return counts;
  }
  const grouped = await prisma.ticket.groupBy({
    by: ['serviceId'],
    where: {
      serviceId: { in: [...serviceIds] },
      status: { notIn: [...terminalTicketStatuses] },
    },
    _count: { _all: true },
  });
  for (const row of grouped) {
    counts.set(row.serviceId, row._count._all);
  }
  return counts;
}
