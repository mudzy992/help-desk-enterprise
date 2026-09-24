import type { Prisma } from '../../../generated/prisma/client';
import { loadDashboardSummaryCounts } from './load-dashboard-summary-counts';

type GroupByCall = {
  readonly by: readonly string[];
  readonly where: Prisma.TicketWhereInput;
};

type CountCall = { readonly where: Prisma.TicketWhereInput };

type GroupRow = {
  readonly status: string;
  readonly priority: string;
  readonly assignedUserId: string | null;
  readonly count: number;
};

/**
 * Staging k6 (2026-09-24): the dashboard counters come from ONE
 * `GROUP BY status, priority, assignedUserId` plus three narrow `count`s
 * (openedToday, requestedByMe, overdue) — never a page of rows.
 *
 * The "opened today" boundary is asserted as an absolute UTC instant in the
 * installation zone, so these expectations hold on any machine.
 */
const installationTimeZone = 'Europe/Sarajevo';
function createFakePrisma(input: {
  readonly rows: readonly GroupRow[];
  /** In call order: openedToday, requestedByMe, overdue. */
  readonly counts: readonly number[];
}) {
  const calls = { groupBy: [] as GroupByCall[], count: [] as CountCall[] };
  let countIndex = 0;
  const prisma = {
    ticket: {
      groupBy: jest.fn(async (args: GroupByCall) => {
        calls.groupBy.push(args);
        return input.rows.map((row) => ({
          status: row.status,
          priority: row.priority,
          assignedUserId: row.assignedUserId,
          _count: { _all: row.count },
        }));
      }),
      count: jest.fn(async (args: CountCall) => {
        calls.count.push(args);
        return input.counts[countIndex++] ?? 0;
      }),
    },
  };
  return { prisma, calls };
}

const baseWhere: Prisma.TicketWhereInput = { AND: [{ status: { not: 'ARCHIVED' } }] };

describe('loadDashboardSummaryCounts', () => {
  it('turns the grouped rows into the client counters', async () => {
    const { prisma, calls } = createFakePrisma({
      rows: [
        { status: 'IN_PROGRESS', priority: 'CRITICAL', assignedUserId: 'user-1', count: 1 },
        { status: 'IN_PROGRESS', priority: 'LOW', assignedUserId: 'user-2', count: 2 },
        { status: 'PENDING', priority: 'LOW', assignedUserId: null, count: 2 },
        { status: 'CLOSED', priority: 'CRITICAL', assignedUserId: null, count: 4 },
        { status: 'WAITING_FOR_USER', priority: 'LOW', assignedUserId: 'user-1', count: 1 },
      ],
      counts: [2, 5, 6],
    });

    const counts = await loadDashboardSummaryCounts(prisma as never, {
      where: baseWhere,
      actorUserId: 'user-1',
      timeZone: installationTimeZone,
      now: new Date('2026-09-24T10:00:00.000Z'),
    });

    expect(calls.groupBy).toHaveLength(1);
    expect(calls.count).toHaveLength(3);
    expect(counts.total).toBe(10);
    expect(counts.open).toBe(5);
    expect(counts.waitingForUser).toBe(1);
    expect(counts.closed).toBe(4);
    expect(counts.resolved).toBe(0);
    expect(counts.unrouted).toBe(0);
    // CRITICAL only while open: the closed critical ones do not count.
    expect(counts.critical).toBe(1);
    // Unassigned and not terminal: PENDING only.
    expect(counts.unassigned).toBe(2);
    expect(counts.assignedToMe).toBe(2);
    expect(counts.openedToday).toBe(2);
    expect(counts.requestedByMe).toBe(5);
    expect(counts.overdue).toBe(6);
    expect(counts.priorityCounts).toEqual([
      { priority: 'LOW', count: 5 },
      { priority: 'CRITICAL', count: 5 },
    ]);
  });

  it('keeps the client status order and drops empty statuses', async () => {
    const { prisma } = createFakePrisma({
      rows: [
        { status: 'CLOSED', priority: 'LOW', assignedUserId: null, count: 1 },
        { status: 'PENDING', priority: 'LOW', assignedUserId: null, count: 2 },
        { status: 'ASSIGNED', priority: 'HIGH', assignedUserId: 'x', count: 3 },
      ],
      counts: [0, 0, 0],
    });

    const counts = await loadDashboardSummaryCounts(prisma as never, {
      where: baseWhere,
      actorUserId: 'user-1',
      timeZone: installationTimeZone,
      now: new Date(),
    });

    expect(counts.statusCounts).toEqual([
      { status: 'PENDING', count: 2 },
      { status: 'ASSIGNED', count: 3 },
      { status: 'CLOSED', count: 1 },
    ]);
    expect(counts.priorityCounts).toEqual([
      { priority: 'LOW', count: 3 },
      { priority: 'HIGH', count: 3 },
    ]);
  });

  it('narrows every count with its own clause on top of the list scope', async () => {
    const { prisma, calls } = createFakePrisma({ rows: [], counts: [0, 0, 0] });

    await loadDashboardSummaryCounts(prisma as never, {
      where: baseWhere,
      actorUserId: 'user-1',
      timeZone: installationTimeZone,
      now: new Date('2026-09-24T10:00:00.000Z'),
    });

    expect(calls.groupBy[0]?.where).toBe(baseWhere);
    expect(calls.groupBy[0]?.by).toEqual(['status', 'priority', 'assignedUserId']);
    const clauses = calls.count.map((call) => (call.where.AND as unknown[])[1]);
    // 00:00 in Europe/Sarajevo on 2026-09-24 is 22:00 UTC on 2026-09-23 (CEST).
    expect(clauses[0]).toEqual({
      createdAt: { gte: new Date('2026-09-23T22:00:00.000Z') },
    });
    expect(clauses[1]).toEqual({ requesterId: 'user-1' });
    expect(clauses[2]).toEqual({
      slaState: {
        is: { OR: [{ isResponseBreached: true }, { isResolutionBreached: true }] },
      },
    });
  });

  it('moves the opened-today boundary with the installation zone', async () => {
    const now = new Date('2026-09-24T10:00:00.000Z');
    const openTodayClauseFor = async (timeZone: string) => {
      const { prisma, calls } = createFakePrisma({ rows: [], counts: [0, 0, 0] });
      await loadDashboardSummaryCounts(prisma as never, {
        where: baseWhere,
        actorUserId: 'user-1',
        now,
        timeZone,
      });
      return (calls.count[0]?.where.AND as readonly unknown[])[1];
    };

    await expect(openTodayClauseFor('UTC')).resolves.toEqual({
      createdAt: { gte: new Date('2026-09-24T00:00:00.000Z') },
    });
    await expect(openTodayClauseFor('Europe/Sarajevo')).resolves.toEqual({
      createdAt: { gte: new Date('2026-09-23T22:00:00.000Z') },
    });
    await expect(openTodayClauseFor('America/New_York')).resolves.toEqual({
      createdAt: { gte: new Date('2026-09-24T04:00:00.000Z') },
    });
  });
});
