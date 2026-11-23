import { PrismaService } from '../../common/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { loadTicketOverdueFlags } from '../tickets/load-ticket-overdue-flags';
import type { TicketRecord } from '../tickets/tickets.types';
import type { ReportPackFilters, ReportTicketSnapshot, ReportWindow } from './reports.types';

/**
 * Package 1.6 (plan §3 D5): with a window, only tickets that were alive inside
 * it are read (created before its end and not closed before its start), and
 * never the heavy columns (`description`, `formData`).
 *
 * W7.101 (`BA-reports-11`): **every** read is a projection now — the no-window
 * path (bottleneck/dashboard fallback) used to fetch the whole row, free text
 * included, and the windowed path fetched `title`/`ticketNumber`/`isConfidential`
 * for packs that only count rows. The default is the aggregate snapshot; a pack
 * that actually prints a ticket asks for `projection: 'row'` and then gets the
 * identifying columns (still never the free text).
 */
export async function loadScopedReportTickets(
  prisma: PrismaService,
  organizationalUnitIds: readonly string[],
  includeArchived: boolean,
  window?: ReportWindow,
  options: {
    readonly take?: number;
    /**
     * W7.54 (BA-reports-02): the schedule's service/group/priority slice. It is
     * pushed into the query, so a filtered report never materializes rows it
     * would drop afterwards.
     */
    readonly filters?: ReportPackFilters;
    /**
     * `snapshot` (default) carries what the counters read; `row` adds the identifying columns a
     * pack that prints tickets needs. Neither ever selects `description`, `formData` or any other free text.
     */
    readonly projection?: ReportTicketProjection;
  } = {},
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
    ...(options.filters?.serviceId === undefined
      ? {}
      : { serviceId: options.filters.serviceId }),
    ...(options.filters?.groupId === undefined
      ? {}
      : { assignedGroupId: options.filters.groupId }),
    ...(options.filters?.priority === undefined
      ? {}
      : { priority: options.filters.priority }),
  };
  const records = (await prisma.ticket.findMany({
    where,
    select: options.projection === 'row' ? reportTicketRowSelect : reportTicketSnapshotSelect,
    orderBy: { createdAt: 'asc' },
    // W7.53: a pack request never reads more than its row budget plus the
    // probe row that tells the caller the corpus is larger.
    take: options.take,
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

export type ReportTicketProjection = 'snapshot' | 'row';

/**
 * What the aggregate packs read: the counters of the monthly KPI, the overdue-by-service split and the
 * close-code split, plus what the dashboard/bottleneck fallbacks aggregate. No title, no ticket number, no
 * confidential marker and **no free text** — a pack that never prints a ticket cannot leak one.
 */
export const reportTicketSnapshotSelect = {
  id: true,
  status: true,
  priority: true,
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

/**
 * The identifying columns a pack that prints a ticket row needs (today only `forward_ping_pong`, which has its
 * own loader). Still no free text: `description`, `formData`, `resolutionSummary` and the message bodies are
 * never part of a report snapshot.
 */
export const reportTicketRowSelect = {
  ...reportTicketSnapshotSelect,
  ticketNumber: true,
  title: true,
  isConfidential: true,
} satisfies Prisma.TicketSelect;
