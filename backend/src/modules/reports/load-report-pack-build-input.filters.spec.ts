import type { ProblemReportVisibility } from './problem-report-visibility';
import { loadProblemReportData } from './packs/load-problem-report-data';
import { publishedArticleSeed } from '../knowledge-base/published-article-seed';
import { ticketsTestIds } from '../tickets/tickets-test-ids';
import { createReportsServiceHarness } from './create-reports-service-harness';
import { loadReportPackBuildInput } from './load-report-pack-build-input';
import { reportTicketSeed } from './report-ticket-seed';
import { reportPackKeys } from './reports.constants';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

/**
 * W7.54 (BA-reports-02): a scheduled report promises a service/group/priority
 * slice. The CSV attachments must be built from exactly that slice — an
 * OU-wide file under a narrower scope label is a data leak.
 */
describe('report pack filters (schedule slice)', () => {
  const window = {
    from: new Date('2026-09-01T00:00:00.000Z'),
    to: new Date('2026-09-30T23:59:59.000Z'),
  };
  const units = [ticketsTestIds.ouIt];

  function seedTicket(
    harness: ReturnType<typeof createReportsServiceHarness>,
    id: string,
    overrides: {
      serviceId?: string;
      assignedGroupId?: string | null;
      priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      originUnitId?: string;
    },
  ): void {
    harness.memory.tickets.set(
      id,
      reportTicketSeed({
        id,
        originUnitId: overrides.originUnitId ?? ticketsTestIds.ouIt,
        status: 'UNROUTED',
        ...(overrides.serviceId === undefined ? {} : { serviceId: overrides.serviceId }),
        assignedGroupId: overrides.assignedGroupId ?? null,
        ...(overrides.priority === undefined ? {} : { priority: overrides.priority }),
      }),
    );
  }

  it('filters the ticket corpus by service, group and priority', async () => {
    const harness = createReportsServiceHarness();
    seedTicket(harness, 't-vpn', { serviceId: 'svc-vpn', priority: 'HIGH' });
    seedTicket(harness, 't-mail', { serviceId: 'svc-mail', priority: 'HIGH' });
    seedTicket(harness, 't-vpn-low', { serviceId: 'svc-vpn', priority: 'LOW' });

    const serviceOnly = await loadReportPackBuildInput(
      harness.prisma as never,
      units,
      window,
      reportPackKeys.monthlyKpi,
      3,
      undefined,
      { filters: { serviceId: 'svc-vpn' } },
    );
    expect(serviceOnly.input.tickets.map((ticket) => ticket.id).sort()).toEqual([
      't-vpn',
      't-vpn-low',
    ]);

    const narrow = await loadReportPackBuildInput(
      harness.prisma as never,
      units,
      window,
      reportPackKeys.monthlyKpi,
      3,
      undefined,
      { filters: { serviceId: 'svc-vpn', priority: 'HIGH' } },
    );
    expect(narrow.input.tickets.map((ticket) => ticket.id)).toEqual(['t-vpn']);
  });

  it('pushes the slice into the ticket query instead of filtering afterwards', async () => {
    const harness = createReportsServiceHarness();
    seedTicket(harness, 't-1', { serviceId: 'svc-vpn' });
    const spy = jest.spyOn(harness.prisma.ticket, 'findMany');

    await loadReportPackBuildInput(
      harness.prisma as never,
      units,
      window,
      reportPackKeys.overdueByService,
      3,
      undefined,
      { filters: { serviceId: 'svc-vpn', groupId: 'grp-1', priority: 'HIGH' } },
    );

    const where = (spy.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where).toMatchObject({
      serviceId: 'svc-vpn',
      assignedGroupId: 'grp-1',
      priority: 'HIGH',
    });
  });

  it('applies the slice to time tracking entries through their ticket', async () => {
    const harness = createReportsServiceHarness();
    const spy = jest.spyOn(harness.prisma.ticketTimeLog, 'findMany');

    await loadReportPackBuildInput(
      harness.prisma as never,
      units,
      window,
      reportPackKeys.timeTracking,
      3,
      undefined,
      { filters: { serviceId: 'svc-vpn', groupId: 'grp-1', priority: 'LOW' } },
    );

    const where = (spy.mock.calls[0][0] as { where: { ticket: Record<string, unknown> } }).where;
    expect(where.ticket).toMatchObject({
      originUnitId: { in: [...units] },
      serviceId: 'svc-vpn',
      assignedGroupId: 'grp-1',
      priority: 'LOW',
    });
  });

  it('limits the knowledge base pack to the schedule service', async () => {
    const harness = createReportsServiceHarness();
    harness.articles.set(
      'kb-vpn',
      publishedArticleSeed({
        id: 'kb-vpn',
        organizationalUnitId: ticketsTestIds.ouIt,
        serviceId: 'svc-vpn',
      }),
    );
    harness.articles.set(
      'kb-mail',
      publishedArticleSeed({
        id: 'kb-mail',
        organizationalUnitId: ticketsTestIds.ouIt,
        serviceId: 'svc-mail',
      }),
    );
    harness.articles.set(
      'kb-sibling',
      publishedArticleSeed({
        id: 'kb-sibling',
        organizationalUnitId: ticketsTestIds.ouHr,
        serviceId: 'svc-vpn',
      }),
    );

    const loaded = await loadReportPackBuildInput(
      harness.prisma as never,
      units,
      window,
      reportPackKeys.kbHelpfulness,
      3,
      undefined,
      { filters: { serviceId: 'svc-vpn' } },
    );

    expect(loaded.input.articles.map((article) => article.id)).toEqual(['kb-vpn']);
  });

  it('drops forwarded tickets outside the slice', async () => {
    const harness = createReportsServiceHarness();
    seedTicket(harness, 't-vpn', { serviceId: 'svc-vpn' });
    seedTicket(harness, 't-mail', { serviceId: 'svc-mail' });
    const forward = harness.prisma.ticketForwardEvent as unknown as {
      create: (input: {
        data: Record<string, unknown>;
      }) => Promise<Record<string, unknown>>;
    };
    for (const ticketId of ['t-vpn', 't-mail']) {
      for (const round of [1, 2]) {
        await forward.create({
          data: {
            ticketId,
            fromGroupId: `grp-${round}`,
            fromGroupName: `G${round}`,
            fromUnitId: ticketsTestIds.ouIt,
            toGroupId: `grp-${round + 1}`,
            toGroupName: `G${round + 1}`,
            toUnitId: ticketsTestIds.ouIt,
            isCrossOu: false,
            actorUserId: 'user-1',
            reason: null,
            createdAt: new Date(`2026-09-1${round}T10:00:00.000Z`),
          },
        });
      }
    }

    const loaded = await loadReportPackBuildInput(
      harness.prisma as never,
      units,
      window,
      reportPackKeys.forwardPingPong,
      2,
      undefined,
      { filters: { serviceId: 'svc-vpn' } },
    );

    expect(loaded.input.forwardTickets?.map((ticket) => ticket.id)).toEqual(['t-vpn']);
  });

  it('applies the slice to the problem record, not to its linked tickets', async () => {
    const captured: Record<string, unknown>[] = [];
    const prisma = {
      problemTicket: {
        groupBy: async (args: Record<string, unknown>) => {
          captured.push(args);
          return [];
        },
      },
    };
    const visibility: ProblemReportVisibility = {
      problem: {},
      ticket: {},
    } as ProblemReportVisibility;

    await loadProblemReportData(prisma as never, {
      unitIds: units,
      part: 'top',
      window,
      now: new Date('2026-09-14T12:00:00.000Z'),
      visibility,
      filters: { serviceId: 'svc-vpn', groupId: 'grp-1', priority: 'HIGH' },
    });

    const where = captured[0].where as { problem: { AND: Record<string, unknown>[] } };
    expect(where.problem.AND).toEqual(
      expect.arrayContaining([
        { serviceId: 'svc-vpn' },
        { groupId: 'grp-1' },
        { priority: 'HIGH' },
      ]),
    );
  });
});
