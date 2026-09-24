import type { Prisma } from '../../../generated/prisma/client';
import { loadSlaSummaryCounts } from './load-sla-summary-counts';

type GroupRow = {
  readonly slaProfileId: string | null;
  readonly isResponseBreached?: boolean;
  readonly isResolutionBreached?: boolean;
  readonly isResponseAtRisk?: boolean;
  readonly isResolutionAtRisk?: boolean;
  readonly count: number;
};

type GroupByCall = {
  readonly by: readonly string[];
  readonly where: {
    readonly ticket: { readonly is: Prisma.TicketWhereInput };
  };
};

/**
 * Phase 2.4 (plan §2.4): one `GROUP BY` per priority, each grouped by profile and
 * the four SLA flags — the rows are flag combinations, never tickets.
 */
function createFakePrisma(rowsByPriority: readonly (readonly GroupRow[])[]) {
  const calls: GroupByCall[] = [];
  const prisma = {
    ticketSlaState: {
      groupBy: jest.fn(async (args: GroupByCall) => {
        calls.push(args);
        return (rowsByPriority[calls.length - 1] ?? []).map((row) => ({
          slaProfileId: row.slaProfileId,
          isResponseBreached: row.isResponseBreached ?? false,
          isResolutionBreached: row.isResolutionBreached ?? false,
          isResponseAtRisk: row.isResponseAtRisk ?? false,
          isResolutionAtRisk: row.isResolutionAtRisk ?? false,
          _count: { _all: row.count },
        }));
      }),
    },
  };
  return { prisma, calls };
}

const baseWhere: Prisma.TicketWhereInput = { AND: [{ status: { not: 'ARCHIVED' } }] };

describe('loadSlaSummaryCounts', () => {
  it('buckets every flag combination and adds it to the totals', async () => {
    const { prisma } = createFakePrisma([
      [
        { slaProfileId: 'profile-standard', count: 5 },
        { slaProfileId: 'profile-standard', isResponseAtRisk: true, count: 2 },
        {
          slaProfileId: 'profile-standard',
          isResolutionBreached: true,
          isResponseAtRisk: true,
          count: 1,
        },
      ],
      [],
      [],
      [],
    ]);

    const summary = await loadSlaSummaryCounts(prisma as never, { where: baseWhere });

    expect(summary.totals).toEqual({ open: 8, onTrack: 5, atRisk: 2, breached: 1 });
    expect(summary.profiles).toEqual([
      {
        slaProfileId: 'profile-standard',
        exposure: { open: 8, onTrack: 5, atRisk: 2, breached: 1 },
        priorities: [
          {
            priority: 'LOW',
            exposure: { open: 8, onTrack: 5, atRisk: 2, breached: 1 },
          },
        ],
      },
    ]);
  });

  it('counts a breached clock as breached even while the other clock is at risk', async () => {
    const { prisma } = createFakePrisma([
      [
        {
          slaProfileId: 'profile-standard',
          isResponseBreached: true,
          isResolutionAtRisk: true,
          count: 3,
        },
      ],
      [],
      [],
      [],
    ]);

    const summary = await loadSlaSummaryCounts(prisma as never, { where: baseWhere });

    expect(summary.totals).toEqual({ open: 3, onTrack: 0, atRisk: 0, breached: 3 });
  });

  it('splits the exposure per profile and priority', async () => {
    const { prisma } = createFakePrisma([
      [{ slaProfileId: 'profile-standard', count: 1 }],
      [{ slaProfileId: 'profile-standard', isResponseAtRisk: true, count: 1 }],
      [{ slaProfileId: 'profile-critical', count: 2 }],
      [
        { slaProfileId: 'profile-standard', isResolutionBreached: true, count: 1 },
        { slaProfileId: null, count: 1 },
      ],
    ]);

    const summary = await loadSlaSummaryCounts(prisma as never, { where: baseWhere });

    expect(summary.totals).toEqual({ open: 6, onTrack: 4, atRisk: 1, breached: 1 });
    expect(summary.profiles.map((profile) => profile.slaProfileId)).toEqual([
      'profile-standard',
      'profile-critical',
    ]);
    const standard = summary.profiles[0];
    expect(standard?.exposure).toEqual({
      open: 3,
      onTrack: 1,
      atRisk: 1,
      breached: 1,
    });
    expect(standard?.priorities).toEqual([
      { priority: 'LOW', exposure: { open: 1, onTrack: 1, atRisk: 0, breached: 0 } },
      { priority: 'MEDIUM', exposure: { open: 1, onTrack: 0, atRisk: 1, breached: 0 } },
      { priority: 'CRITICAL', exposure: { open: 1, onTrack: 0, atRisk: 0, breached: 1 } },
    ]);
    // A state without a profile is part of the totals and of no profile row.
    expect(summary.profiles[1]?.exposure).toEqual({
      open: 2,
      onTrack: 2,
      atRisk: 0,
      breached: 0,
    });
  });

  it('scopes every group by the list where plus the open-status and priority clauses', async () => {
    const { prisma, calls } = createFakePrisma([[], [], [], []]);

    await loadSlaSummaryCounts(prisma as never, { where: baseWhere });

    expect(calls).toHaveLength(4);
    expect(calls[0]?.by).toEqual([
      'slaProfileId',
      'isResponseBreached',
      'isResolutionBreached',
      'isResponseAtRisk',
      'isResolutionAtRisk',
    ]);
    const priorities = calls.map((call) => {
      const scoped = call.where.ticket.is.AND as unknown[];
      const openTicketWhere = scoped[0] as { readonly AND: readonly unknown[] };
      expect(openTicketWhere.AND[0]).toBe(baseWhere);
      return (scoped[1] as { readonly priority: string }).priority;
    });
    expect(priorities).toEqual(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
    const statusClause = (
      (calls[0]?.where.ticket.is.AND as unknown[])[0] as {
        readonly AND: readonly unknown[];
      }
    ).AND[1] as { readonly status: { readonly in: readonly string[] } };
    expect(statusClause.status.in).not.toContain('RESOLVED');
    expect(statusClause.status.in).not.toContain('ARCHIVED');
  });
});
