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
 * Eight bounded queries (two `GROUP BY`s plus six `count`s) instead of a page of
 * rows that was then counted in the browser; the caller caches the answer for
 * fifteen seconds, so this cost is paid at most once per window and per user.
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
  const [
    statusRows,
    priorityRows,
    critical,
    openedToday,
    unassigned,
    assignedToMe,
    requestedByMe,
    overdue,
  ] = await Promise.all([
    prisma.ticket.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    }),
    prisma.ticket.groupBy({
      by: ['priority'],
      where,
      _count: { _all: true },
    }),
    prisma.ticket.count({
      where: withTicketWhereClause(where, {
        priority: 'CRITICAL',
        status: { in: [...openStatuses] },
      }),
    }),
    prisma.ticket.count({
      where: withTicketWhereClause(where, {
        createdAt: { gte: startOfCivilDay(now, timeZone) },
      }),
    }),
    prisma.ticket.count({
      where: withTicketWhereClause(where, {
        assignedUserId: null,
        status: { notIn: [...terminalStatuses] },
      }),
    }),
    prisma.ticket.count({
      where: withTicketWhereClause(where, { assignedUserId: actorUserId }),
    }),
    prisma.ticket.count({
      where: withTicketWhereClause(where, { requesterId: actorUserId }),
    }),
    prisma.ticket.count({
      where: withTicketWhereClause(where, { slaState: { is: overdueState } }),
    }),
  ]);

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
