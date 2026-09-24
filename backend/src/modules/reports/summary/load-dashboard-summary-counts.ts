import type { Prisma } from '../../../generated/prisma/client';
import type { TicketPriority, TicketStatus } from '../../../generated/prisma/enums';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { withTicketWhereClause } from '../../tickets/list/build-ticket-list-where';
import { startOfCivilDay } from './start-of-civil-day';
import type {
  DashboardSummaryCounts,
  TicketPriorityCount,
  TicketStatusCount,
} from './report-summary.types';

/** Same set as the client's `isDashboardOpenTicket` (KPI "open"). */
const openStatuses: readonly TicketStatus[] = [
  'PENDING',
  'UNROUTED',
  'ASSIGNED',
  'IN_PROGRESS',
];

/** Same set as the client's `isTerminal` helper. */
const terminalStatuses: readonly TicketStatus[] = [
  'RESOLVED',
  'CLOSED',
  'ARCHIVED',
];

/** The client's `ticketStatusValues` order, so the bars keep their colours. */
const ticketStatusOrder: readonly TicketStatus[] = [
  'PENDING',
  'UNROUTED',
  'PENDING_APPROVAL',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_FOR_USER',
  'RESOLVED',
  'CLOSED',
  'ARCHIVED',
];

const ticketPriorityOrder: readonly TicketPriority[] = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
];

/** Mirrors `isTicketSlaOverdue`: breached on either clock. */
const overdueState: Prisma.TicketSlaStateWhereInput = {
  OR: [{ isResponseBreached: true }, { isResolutionBreached: true }],
};

/**
 * Phase 2.4 (plan §2.4): the dashboard counters as SQL aggregates over the
 * visibility scope the lists use — no ticket rows ever leave the database.
 *
 * Staging k6 (2026-09-24, 100k tickets): the former eight parallel statements
 * each scanned the whole visible set; at 20 VUs that exhausted the pool. Now ONE
 * `GROUP BY status, priority, assignedUserId` scan yields the status and priority
 * bars, "critical open", "unassigned" and "assigned to me" (the group count is
 * bounded by statuses × priorities × agents). Only three narrow counts remain,
 * each driven by its own index: requester, `createdAt` (today) and SLA breach.
 * The caller caches the answer for fifteen seconds and single-flights misses.
 */
export async function loadDashboardSummaryCounts(
  prisma: PrismaService,
  input: {
    readonly where: Prisma.TicketWhereInput;
    readonly actorUserId: string;
    readonly now: Date;
    /**
     * The zone the reporting day starts in (`readInstallationTimeZone`). Passed
     * in rather than read from the process, so a container on `TZ=UTC` and a
     * workstation on `TZ=Europe/Sarajevo` count the same tickets.
     */
    readonly timeZone: string;
  },
): Promise<DashboardSummaryCounts> {
  const { where, actorUserId, now, timeZone } = input;
  const [groupRows, openedToday, requestedByMe, overdue] = await Promise.all([
    prisma.ticket.groupBy({
      by: ['status', 'priority', 'assignedUserId'],
      where,
      _count: { _all: true },
    }),
    prisma.ticket.count({
      where: withTicketWhereClause(where, {
        createdAt: { gte: startOfCivilDay(now, timeZone) },
      }),
    }),
    prisma.ticket.count({
      where: withTicketWhereClause(where, { requesterId: actorUserId }),
    }),
    prisma.ticket.count({
      where: withTicketWhereClause(where, { slaState: { is: overdueState } }),
    }),
  ]);

  const openSet = new Set<TicketStatus>(openStatuses);
  const terminalSet = new Set<TicketStatus>(terminalStatuses);
  const statusRows: { status: TicketStatus; _count: { _all: number } }[] = [];
  const priorityRows: { priority: TicketPriority; _count: { _all: number } }[] = [];
  let critical = 0;
  let unassigned = 0;
  let assignedToMe = 0;
  const statusTotals = new Map<TicketStatus, number>();
  const priorityTotals = new Map<TicketPriority, number>();
  for (const row of groupRows as readonly {
    readonly status: TicketStatus;
    readonly priority: TicketPriority;
    readonly assignedUserId: string | null;
    readonly _count: { readonly _all: number };
  }[]) {
    const n = row._count._all;
    statusTotals.set(row.status, (statusTotals.get(row.status) ?? 0) + n);
    priorityTotals.set(row.priority, (priorityTotals.get(row.priority) ?? 0) + n);
    if (row.priority === 'CRITICAL' && openSet.has(row.status)) {
      critical += n;
    }
    if (row.assignedUserId === null && !terminalSet.has(row.status)) {
      unassigned += n;
    }
    if (row.assignedUserId === actorUserId) {
      assignedToMe += n;
    }
  }
  for (const [status, n] of statusTotals) {
    statusRows.push({ status, _count: { _all: n } });
  }
  for (const [priority, n] of priorityTotals) {
    priorityRows.push({ priority, _count: { _all: n } });
  }

  const countByStatus = new Map<TicketStatus, number>();
  for (const row of statusRows as readonly {
    readonly status: TicketStatus;
    readonly _count: { readonly _all: number };
  }[]) {
    countByStatus.set(row.status, row._count._all);
  }
  const statusCounts: readonly TicketStatusCount[] = ticketStatusOrder
    .map((status) => ({ status, count: countByStatus.get(status) ?? 0 }))
    .filter((entry) => entry.count > 0);
  const countOf = (status: TicketStatus): number => countByStatus.get(status) ?? 0;

  const countByPriority = new Map<TicketPriority, number>();
  for (const row of priorityRows as readonly {
    readonly priority: TicketPriority;
    readonly _count: { readonly _all: number };
  }[]) {
    countByPriority.set(row.priority, row._count._all);
  }
  const priorityCounts: readonly TicketPriorityCount[] = ticketPriorityOrder
    .map((priority) => ({
      priority,
      count: countByPriority.get(priority) ?? 0,
    }))
    .filter((entry) => entry.count > 0);

  return {
    total: statusCounts.reduce((sum, entry) => sum + entry.count, 0),
    open: openStatuses.reduce((sum, status) => sum + countOf(status), 0),
    critical,
    overdue,
    openedToday,
    waitingForUser: countOf('WAITING_FOR_USER'),
    pendingApproval: countOf('PENDING_APPROVAL'),
    resolved: countOf('RESOLVED'),
    closed: countOf('CLOSED'),
    unrouted: countOf('UNROUTED'),
    unassigned,
    assignedToMe,
    requestedByMe,
    statusCounts,
    priorityCounts,
  };
}
