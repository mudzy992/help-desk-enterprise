import { publishedArticleSeed } from '../knowledge-base/published-article-seed';
import { ticketsTestIds } from '../tickets/tickets-test-ids';
import { createReportsServiceHarness } from './create-reports-service-harness';
import { overdueSlaState, reportTicketSeed } from './report-ticket-seed';
import { reportPackKeys } from './reports.constants';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('ReportsService OU scoping', () => {
  const now = new Date('2026-09-14T12:00:00.000Z');

  it('exports monthly KPI JSON without sibling OU tickets', async () => {
    const harness = createReportsServiceHarness();
    seedScopedTickets(harness);
    const exported = await harness.reports.exportPack(
      {
        pack: reportPackKeys.monthlyKpi,
        format: 'json',
        organizationalUnitId: ticketsTestIds.ouIt,
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-30T23:59:59.000Z',
      },
      ticketsTestIds.adminIt,
      'req-1',
      now,
    );
    const [row] = JSON.parse(exported.content) as Array<{
      createdCount: number;
      overdueCount: number;
    }>;
    expect(row.createdCount).toBe(2);
    expect(row.overdueCount).toBe(1);
    const audit = await harness.prisma.auditLog.findMany();
    expect(audit.some((entry: { action: string }) => entry.action === 'reports.export')).toBe(
      true,
    );
  });

  it('aggregates bottlenecks for the requested OU tree only', async () => {
    const harness = createReportsServiceHarness();
    seedScopedTickets(harness);
    const dashboard = await harness.reports.bottleneck(
      { organizationalUnitId: ticketsTestIds.ouIt },
      now,
    );
    expect(dashboard.counts).toEqual({
      pendingApproval: 0,
      waitingForUser: 1,
      unrouted: 1,
      overdue: 1,
    });
    expect(dashboard.byOrganizationalUnit.map((row) => row.key).sort()).toEqual([
      'ou-it',
      'ou-it-ops',
    ]);
  });

  it('scopes KB helpfulness to the OU tree', async () => {
    const harness = createReportsServiceHarness();
    harness.articles.set(
      'kb-it',
      publishedArticleSeed({ id: 'kb-it', title: 'VPN' }),
    );
    harness.articles.set(
      'kb-hr',
      publishedArticleSeed({
        id: 'kb-hr',
        title: 'Payroll',
        organizationalUnitId: ticketsTestIds.ouHr,
      }),
    );
    harness.feedbacks.set('fb-1', {
      id: 'fb-1',
      articleId: 'kb-it',
      userId: 'user-1',
      isHelpful: true,
      createdAt: now,
      updatedAt: now,
    });
    const exported = await harness.reports.exportPack(
      {
        pack: reportPackKeys.kbHelpfulness,
        format: 'json',
        organizationalUnitId: ticketsTestIds.ouIt,
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-30T23:59:59.000Z',
      },
      ticketsTestIds.adminIt,
      null,
      now,
    );
    const rows = JSON.parse(exported.content) as Array<{ articleId: string }>;
    expect(rows.map((row) => row.articleId)).toEqual(['kb-it']);
  });
});

function seedScopedTickets(
  harness: ReturnType<typeof createReportsServiceHarness>,
): void {
  const it = reportTicketSeed({
    id: 't-it',
    originUnitId: ticketsTestIds.ouIt,
    status: 'UNROUTED',
  });
  const child = reportTicketSeed({
    id: 't-ops',
    originUnitId: 'ou-it-ops',
    status: 'WAITING_FOR_USER',
  });
  const sibling = reportTicketSeed({
    id: 't-hr',
    originUnitId: ticketsTestIds.ouHr,
    status: 'PENDING_APPROVAL',
  });
  harness.memory.tickets.set(it.id, it);
  harness.memory.tickets.set(child.id, child);
  harness.memory.tickets.set(sibling.id, sibling);
  const sla = overdueSlaState(child.id);
  harness.memory.slaStates.set(sla.id, sla);
}
