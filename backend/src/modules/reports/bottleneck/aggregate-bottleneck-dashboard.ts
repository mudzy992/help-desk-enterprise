import { bottleneckStatusKeys } from '../reports.constants';
import {
  enumerateUtcDateKeys,
  isTimestampInWindow,
  utcDateKey,
} from '../resolve-report-window';
import type {
  BottleneckBreakdownRow,
  BottleneckCounts,
  BottleneckDashboard,
  BottleneckTrendRow,
  ReportTicketSnapshot,
  ReportWindow,
} from '../reports.types';

const emptyCounts: BottleneckCounts = {
  pendingApproval: 0,
  waitingForUser: 0,
  unrouted: 0,
  overdue: 0,
};

export function aggregateBottleneckDashboard(input: {
  readonly tickets: readonly ReportTicketSnapshot[];
  readonly window: ReportWindow;
  /**
   * Val 1 (M15/B2): nazivi za razrez; bez mape ili bez pogotka labela je ključ.
   * Prioritet nema šifarnik — njegova labela je vrijednost enuma.
   */
  readonly unitNames?: ReadonlyMap<string, string>;
  readonly serviceNames?: ReadonlyMap<string, string>;
}): BottleneckDashboard {
  const standing = input.tickets.filter(
    (ticket) => ticket.status !== 'ARCHIVED',
  );
  return {
    window: {
      from: input.window.from.toISOString(),
      to: input.window.to.toISOString(),
    },
    counts: countBottlenecks(standing),
    byOrganizationalUnit: breakdown(
      standing,
      (ticket) => ticket.originUnitId,
      (key) => input.unitNames?.get(key) ?? key,
    ),
    byService: breakdown(
      standing,
      (ticket) => ticket.serviceId,
      (key) => input.serviceNames?.get(key) ?? key,
    ),
    byPriority: breakdown(
      standing,
      (ticket) => ticket.priority,
      (key) => key,
    ),
    trend: buildTrend(standing, input.window),
  };
}

export function countBottlenecks(
  tickets: readonly ReportTicketSnapshot[],
): BottleneckCounts {
  return tickets.reduce(
    (counts, ticket) => addTicketCounts(counts, ticket),
    emptyCounts,
  );
}

function breakdown(
  tickets: readonly ReportTicketSnapshot[],
  keyFor: (ticket: ReportTicketSnapshot) => string,
  labelFor: (key: string) => string,
): readonly BottleneckBreakdownRow[] {
  const grouped = new Map<string, ReportTicketSnapshot[]>();
  for (const ticket of tickets) {
    if (!isBottleneckTicket(ticket)) {
      continue;
    }
    const key = keyFor(ticket);
    const current = grouped.get(key) ?? [];
    current.push(ticket);
    grouped.set(key, current);
  }
  return [...grouped.entries()]
    .map(([key, rows]) => ({ key, label: labelFor(key), ...countBottlenecks(rows) }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function buildTrend(
  tickets: readonly ReportTicketSnapshot[],
  window: ReportWindow,
): readonly BottleneckTrendRow[] {
  const byDate = new Map<string, ReportTicketSnapshot[]>();
  for (const ticket of tickets) {
    if (!isTimestampInWindow(ticket.createdAt, window)) {
      continue;
    }
    const key = utcDateKey(ticket.createdAt);
    const current = byDate.get(key) ?? [];
    current.push(ticket);
    byDate.set(key, current);
  }
  return enumerateUtcDateKeys(window).map((date) => {
    const rows = byDate.get(date) ?? [];
    return {
      date,
      createdCount: rows.length,
      ...countBottlenecks(rows),
    };
  });
}

function addTicketCounts(
  counts: BottleneckCounts,
  ticket: ReportTicketSnapshot,
): BottleneckCounts {
  return {
    pendingApproval:
      counts.pendingApproval + (ticket.status === 'PENDING_APPROVAL' ? 1 : 0),
    waitingForUser:
      counts.waitingForUser + (ticket.status === 'WAITING_FOR_USER' ? 1 : 0),
    unrouted: counts.unrouted + (ticket.status === 'UNROUTED' ? 1 : 0),
    overdue: counts.overdue + (ticket.isOverdue ? 1 : 0),
  };
}

function isBottleneckTicket(ticket: ReportTicketSnapshot): boolean {
  return (
    ticket.isOverdue ||
    bottleneckStatusKeys.includes(
      ticket.status as (typeof bottleneckStatusKeys)[number],
    )
  );
}
