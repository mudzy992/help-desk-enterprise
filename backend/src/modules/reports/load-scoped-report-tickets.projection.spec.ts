import { loadScopedReportTickets, reportTicketRowSelect, reportTicketSnapshotSelect } from './load-scoped-report-tickets';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

/**
 * W7.101 (`BA-reports-11`): the report loaders decide the privacy blast radius. Two reads used to be wider than
 * the data they feed — the no-window path fetched the whole ticket row (free text included) and the windowed path
 * fetched title/ticket-number/confidential for packs that only count rows. These tests pin the projections at the
 * query level, which is the only place where "we do not read that column" can be proven.
 */
describe('report ticket projections', () => {
  type FindManyArgs = {
    where?: Record<string, unknown>;
    select?: Record<string, unknown>;
    take?: number;
  };

  function createPrisma(records: readonly Record<string, unknown>[] = []) {
    const calls: FindManyArgs[] = [];
    const prisma = {
      ticket: {
        findMany: async (args: FindManyArgs) => {
          calls.push(args);
          return records;
        },
      },
      ticketSlaState: {
        findMany: async () => [],
        groupBy: async () => [],
      },
    };
    return { prisma, calls };
  }

  const window = { from: new Date('2026-09-01T00:00:00.000Z'), to: new Date('2026-09-30T23:59:59.000Z') };

  it('never selects free text, in either projection', () => {
    for (const select of [reportTicketSnapshotSelect, reportTicketRowSelect]) {
      expect(select).not.toHaveProperty('description');
      expect(select).not.toHaveProperty('formData');
      expect(select).not.toHaveProperty('resolutionSummary');
      expect(select).not.toHaveProperty('resolutionNote');
    }
  });

  it('keeps the identifying columns for the aggregate snapshot out of the query', () => {
    // The three ticket packs (monthly KPI, overdue by service, top close codes) count rows; a title in memory would
    // be data nobody asked for.
    expect(reportTicketSnapshotSelect).not.toHaveProperty('title');
    expect(reportTicketSnapshotSelect).not.toHaveProperty('ticketNumber');
    expect(reportTicketSnapshotSelect).not.toHaveProperty('isConfidential');
    expect(reportTicketRowSelect).toMatchObject({
      title: true,
      ticketNumber: true,
      isConfidential: true,
    });
  });

  it('applies a projection to the no-window read too (the whole-row read is gone)', async () => {
    const { prisma, calls } = createPrisma();

    await loadScopedReportTickets(prisma as never, ['ou-it'], false);

    expect(calls).toHaveLength(1);
    expect(calls[0].select).toEqual(reportTicketSnapshotSelect);
    // No window means "current state": the where clause has no time bounds, but the select is still there.
    expect(calls[0].where).toMatchObject({ originUnitId: { in: ['ou-it'] } });
  });

  it('uses the row projection only when a caller asks for it, and keeps the window bounds', async () => {
    const { prisma, calls } = createPrisma();

    await loadScopedReportTickets(prisma as never, ['ou-it'], true, window, { projection: 'row', take: 11 });

    expect(calls[0].select).toEqual(reportTicketRowSelect);
    expect(calls[0].take).toBe(11);
    expect(calls[0].where).toMatchObject({
      // W7.102: half-open `[from, to)` — a ticket created exactly at `to` belongs to the next period.
      createdAt: { lt: window.to },
      OR: [{ closedAt: null }, { closedAt: { gte: window.from } }],
    });
  });

  it('does not query at all without an organizational unit', async () => {
    const { prisma, calls } = createPrisma();

    await expect(loadScopedReportTickets(prisma as never, [], false)).resolves.toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
