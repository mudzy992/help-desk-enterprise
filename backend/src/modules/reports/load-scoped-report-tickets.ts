import { PrismaService } from '../../common/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { loadTicketOverdueFlags } from '../tickets/load-ticket-overdue-flags';
import type { TicketRecord } from '../tickets/tickets.types';
import type { ReportTicketSnapshot, ReportWindow } from './reports.types';

/**
 * Package 1.6 (plan §3 D5): with a window, only tickets that were alive inside
 * it are read (created before its end and not closed before its start), and
 * never the heavy columns (`description`, `formData`). Without a window (the
 * bottleneck dashboard, current state only) the previous behaviour is kept.
 */
export async function loadScopedReportTickets(
  prisma: PrismaService,
  organizationalUnitIds: readonly string[],
  includeArchived: boolean,
  window?: ReportWindow,
): Promise<readonly ReportTicketSnapshot[]> {
  if (organizationalUnitIds.length === 0) {
    return [];
  }
  const where: Prisma.TicketWhereInput = {
    originUnitId: { in: [...organizationalUnitIds] },
    ...(includeArchived ? {} : { status: { not: 'ARCHIVED' } }),
    ...(window === undefined
      ? {}
      : {
          createdAt: { lte: window.to },
          OR: [{ closedAt: null }, { closedAt: { gte: window.from } }],
        }),
  };
  const records = (await prisma.ticket.findMany({
    where,
    ...(window === undefined ? {} : { select: reportTicketSelect }),
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

/** Everything the report packs read; no free-text columns. */
export const reportTicketSelect = {
  id: true,
  ticketNumber: true,
  title: true,
  status: true,
  priority: true,
  isConfidential: true,
  originUnitId: true,
  serviceId: true,
  assignedGroupId: true,
  assignedUserId: true,
  closeCodeId: true,
  firstResponseAt: true,
  resolvedAt: true,
  closedAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TicketSelect;
