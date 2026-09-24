import type { Prisma } from '../../../generated/prisma/client';
import { loadDashboardSummaryCounts } from './load-dashboard-summary-counts';

type GroupByCall = {
  readonly by: readonly string[];
  readonly where: Prisma.TicketWhereInput;
};

type CountCall = { readonly where: Prisma.TicketWhereInput };

/**
 * Phase 2.4 (plan §2.4): the dashboard counters come from `GROUP BY` plus a few
 * `count`s — one statement per number, never a page of rows.
 *
 * The "opened today" boundary is asserted as an absolute UTC instant in the
 * installation zone, so these expectations hold on any machine: the boundary
 * used to come from the process zone (`new Date(y, m, d)`) and the suite only
 * passed where the process zone happened to be UTC.
 */
const installationTimeZone = 'Europe/Sarajevo';
function createFakePrisma(input: {
  readonly statusRows: readonly { status: string; count: number }[];
  readonly priorityRows: readonly { priority: string; count: number }[];
  /** In call order: critical, openedToday, unassigned, assignedToMe, requestedByMe, overdue. */
  readonly counts: readonly number[];
}) {
  const calls = { groupBy: [] as GroupByCall[], count: [] as CountCall[] };
  let countIndex = 0;
  const prisma = {
    ticket: {
      groupBy: jest.fn(async (args: GroupByCall) => {
        calls.groupBy.push(args);
        return args.by[0] === 'status'
          ? input.statusRows.map((row) => ({
              status: row.status,
              _count: { _all: row.count },
            }))
          : input.priorityRows.map((row) => ({
              priority: row.priority,
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
    const { prisma } = createFakePrisma({
      statusRows: [
        { status: 'IN_PROGRESS', count: 3 },
        { status: 'PENDING', count: 2 },
        { status: 'CLOSED', count: 4 },
        { status: 'WAITING_FOR_USER', count: 1 },
      ],
      priorityRows: [
        { priority: 'CRITICAL', count: 1 },
        { priority: 'LOW', count: 6 },
      ],
      counts: [1, 2, 3, 4, 5, 6],
    });

    const counts = await loadDashboardSummaryCounts(prisma as never, {
      where: baseWhere,
      actorUserId: 'user-1',
      timeZone: installationTimeZone,
      now: new Date('2026-09-24T10:00:00.000Z'),
    });

    expect(counts.total).toBe(10);
    expect(counts.open).toBe(5);
    expect(counts.waitingForUser).toBe(1);
    expect(counts.closed).toBe(4);
    expect(counts.resolved).toBe(0);
    expect(counts.unrouted).toBe(0);
    expect(counts.critical).toBe(1);
    expect(counts.overdue).toBe(6);
    expect(counts.openedToday).toBe(2);
    expect(counts.unassigned).toBe(3);
    expect(counts.assignedToMe).toBe(4);
    expect(counts.requestedByMe).toBe(5);
  });

  it('keeps the client status order and drops empty statuses', async () => {
    const { prisma } = createFakePrisma({
      statusRows: [
        { status: 'CLOSED', count: 1 },
        { status: 'PENDING', count: 2 },
        { status: 'ASSIGNED', count: 3 },
      ],
      priorityRows: [],
      counts: [0, 0, 0, 0, 0, 0],
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
    expect(counts.priorityCounts).toEqual([]);
  });

  it('narrows every count with its own clause on top of the list scope', async () => {
    const { prisma, calls } = createFakePrisma({
      statusRows: [],
      priorityRows: [],
      counts: [0, 0, 0, 0, 0, 0],
    });

    await loadDashboardSummaryCounts(prisma as never, {
      where: baseWhere,
      actorUserId: 'user-1',
      timeZone: installationTimeZone,
      now: new Date('2026-09-24T10:00:00.000Z'),
    });

    expect(calls.groupBy[0]?.where).toBe(baseWhere);
    const clauses = calls.count.map((call) => (call.where.AND as unknown[])[1]);
    expect(clauses[0]).toEqual({
      priority: 'CRITICAL',
      status: { in: ['PENDING', 'UNROUTED', 'ASSIGNED', 'IN_PROGRESS'] },
    });
    // 00:00 in Europe/Sarajevo on 2026-09-24 is 22:00 UTC on 2026-09-23 (CEST);
    // the process zone must not matter.
    expect(clauses[1]).toEqual({
      createdAt: { gte: new Date('2026-09-23T22:00:00.000Z') },
    });
    expect(clauses[2]).toEqual({
      assignedUserId: null,
      status: { notIn: ['RESOLVED', 'CLOSED', 'ARCHIVED'] },
    });
    expect(clauses[3]).toEqual({ assignedUserId: 'user-1' });
    expect(clauses[4]).toEqual({ requesterId: 'user-1' });
    expect(clauses[5]).toEqual({
      slaState: {
        is: { OR: [{ isResponseBreached: true }, { isResolutionBreached: true }] },
      },
    });
  });

  it('moves the opened-today boundary with the installation zone', async () => {
    const now = new Date('2026-09-24T10:00:00.000Z');
    const openTodayClauseFor = async (timeZone: string) => {
      const { prisma, calls } = createFakePrisma({
        statusRows: [],
        priorityRows: [],
        counts: [0, 0, 0, 0, 0, 0],
      });
      await loadDashboardSummaryCounts(prisma as never, {
        where: baseWhere,
        actorUserId: 'user-1',
        now,
        timeZone,
      });
      return (calls.count[1]?.where.AND as readonly unknown[])[1];
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
