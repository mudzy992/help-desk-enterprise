import { PrismaService } from '../../common/prisma/prisma.service';
import { loadTicketOverdueFlags } from '../tickets/load-ticket-overdue-flags';
import type { TicketRecord } from '../tickets/tickets.types';
import type { ReportTicketSnapshot } from './reports.types';

export async function loadScopedReportTickets(
  prisma: PrismaService,
  organizationalUnitIds: readonly string[],
  includeArchived: boolean,
): Promise<readonly ReportTicketSnapshot[]> {
  if (organizationalUnitIds.length === 0) {
    return [];
  }
  const records = (await prisma.ticket.findMany({
    where: {
      originUnitId: { in: [...organizationalUnitIds] },
      ...(includeArchived ? {} : { status: { not: 'ARCHIVED' } }),
    },
    orderBy: { createdAt: 'asc' },
  })) as TicketRecord[];
  const overdueByTicketId = await loadTicketOverdueFlags(
    prisma,
    records.map((record) => record.id),
  );
  return records.map((record) => ({
    ...record,
    isOverdue: overdueByTicketId.get(record.id) === true,
  }));
}
