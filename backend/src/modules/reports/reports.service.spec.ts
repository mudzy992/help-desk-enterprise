import { publishedArticleSeed } from '../knowledge-base/published-article-seed';
import { ticketsTestIds } from '../tickets/tickets-test-ids';
import { createReportsServiceHarness } from './create-reports-service-harness';
import { overdueSlaState, reportTicketSeed } from './report-ticket-seed';
import { reportPackKeys, reportPackLimits } from './reports.constants';
import { reportErrorCodes } from './reports.constants';

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

  it('W7.108: previews are audited reads and exports keep the period in the audit', async () => {
    const harness = createReportsServiceHarness();
    seedScopedTickets(harness);
    const scope = {
      organizationalUnitId: ticketsTestIds.ouIt,
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-30T23:59:59.000Z',
    };
    const preview = await harness.reports.previewPack(
      { ...scope, pack: reportPackKeys.monthlyKpi },
      ticketsTestIds.adminIt,
      'req-preview',
      now,
    );
    expect(preview).toMatchObject({ totalRows: 1, truncated: false });
    expect(preview.columns).toContain('createdCount');
    // W7.102: the preview says which bound is open and what the period means for this pack.
    expect(preview.window).toEqual({
      from: scope.from,
      to: scope.to,
      boundaries: '[from, to)',
      semantics: expect.objectContaining({ mode: 'mixed' }),
    });
    // W7.108 (`BA-reports-18`): the preview left a read-audit row of its own.
    const previewAudit = (await harness.prisma.auditLog.findMany()) as Array<{
      action: string;
      metadata: Record<string, unknown>;
    }>;
    expect(previewAudit).toHaveLength(1);
    expect(previewAudit[0]?.action).toBe('report.pack.previewed');
    expect(previewAudit[0]?.metadata).toMatchObject({
      pack: 'monthly_kpi',
      organizationalUnitId: ticketsTestIds.ouIt,
      from: scope.from,
      to: scope.to,
      boundaries: '[from, to)',
      windowMode: 'mixed',
      recordCount: 1,
      truncated: false,
      truncatedInput: false,
    });

    const exported = await harness.reports.exportPack(
      { ...scope, pack: reportPackKeys.monthlyKpi, format: 'csv' },
      ticketsTestIds.adminIt,
      null,
      now,
    );
    expect(exported.fileName).toMatch(/^report_monthly_kpi_.+_2026-09-01_2026-09-30\.csv$/);
    expect(exported.content.startsWith('\uFEFF')).toBe(true);
    const exportAudit = (await harness.prisma.auditLog.findMany()) as Array<{
      action: string;
      metadata: Record<string, unknown>;
    }>;
    expect(exportAudit.map((entry) => entry.action)).toEqual([
      'report.pack.previewed',
      'reports.export',
    ]);
    const audit = exportAudit[1];
    expect(audit?.metadata).toMatchObject({
      format: 'csv',
      pack: 'monthly_kpi',
      organizationalUnitId: ticketsTestIds.ouIt,
      from: scope.from,
      to: '2026-09-30T23:59:59.000Z',
      // W7.102: the audit records the open upper bound and whether the file is events or state.
      boundaries: '[from, to)',
      windowMode: 'mixed',
    });
  });

  it('package 1.6: rejects periods longer than 366 days', async () => {
    const harness = createReportsServiceHarness();
    await expect(
      harness.reports.previewPack(
        {
          pack: reportPackKeys.monthlyKpi,
          organizationalUnitId: ticketsTestIds.ouIt,
          from: '2025-01-01T00:00:00.000Z',
          to: '2026-06-01T00:00:00.000Z',
        },
        ticketsTestIds.adminIt,
        null,
        now,
      ),
    ).rejects.toMatchObject({ code: 'REPORT_WINDOW_INVALID' });
  });

  it('package 1.6: lists enabled packs with columns', async () => {
    const harness = createReportsServiceHarness();
    const listed = await harness.reports.listPacks();
    expect(listed.packs.map((pack) => pack.slug)).toContain('monthly-kpi');
    expect(listed.limits.previewRows).toBe(200);
  });

  it('W7.102: every listed pack tells the caller what the period selects', async () => {
    const harness = createReportsServiceHarness();
    const listed = await harness.reports.listPacks();
    const semantics = new Map(
      listed.packs.map((pack) => [pack.key, pack.windowSemantics]),
    );
    expect(listed.packs.every((pack) => pack.windowSemantics.boundaries === '[from, to)')).toBe(
      true,
    );
    expect(semantics.get(reportPackKeys.monthlyKpi)).toMatchObject({
      mode: 'mixed',
      selection: 'instant',
      boundaries: '[from, to)',
    });
    expect(semantics.get(reportPackKeys.timeTracking)).toMatchObject({
      mode: 'event-time',
      eventTime: ['timeEntry.startedAt'],
      snapshotParts: [],
    });
    expect(semantics.get(reportPackKeys.changeSchedule)).toMatchObject({
      mode: 'event-time',
      selection: 'overlap',
    });
    expect(semantics.get(reportPackKeys.assetInventory)?.mode).toBe('snapshot-time');
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
    // Val 1 (M15/B2): razrez nosi nazive iz šifarnika, ne ID-eve. Testeri su bez
    // naziva u harness katalogu, pa jedinice bez naziva zadržavaju ključ.
    expect(dashboard.byOrganizationalUnit.map((row) => row.label).sort()).toEqual([
      'ou-it',
      'ou-it-ops',
    ]);
    expect(dashboard.byService.map((row) => row.label)).toEqual(['VPN access']);
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

describe('ReportsService row budget (W7.53 / BA-reports-01)', () => {
  const now = new Date('2026-09-14T12:00:00.000Z');
  const scope = {
    organizationalUnitId: ticketsTestIds.ouIt,
    from: '2026-09-01T00:00:00.000Z',
    to: '2026-09-30T23:59:59.000Z',
  };

  function seedArticles(
    harness: ReturnType<typeof createReportsServiceHarness>,
    count: number,
  ): void {
    for (let index = 0; index < count; index += 1) {
      const id = `kb-${index.toString().padStart(4, '0')}`;
      harness.articles.set(
        id,
        publishedArticleSeed({ id, organizationalUnitId: ticketsTestIds.ouIt }),
      );
    }
  }

  it('previews at most one page and labels the count as a lower bound', async () => {
    const harness = createReportsServiceHarness();
    seedArticles(harness, reportPackLimits.previewRows + 1);
    const spy = jest.spyOn(harness.prisma.knowledgeArticle, 'findMany');

    const preview = await harness.reports.previewPack(
      { ...scope, pack: reportPackKeys.kbHelpfulness },
      ticketsTestIds.adminIt,
      null,
      now,
    );

    expect(preview.rows).toHaveLength(reportPackLimits.previewRows);
    expect(preview.totalRows).toBe(reportPackLimits.previewRows);
    expect(preview.truncated).toBe(true);
    expect(preview.truncatedInput).toBe(true);
    expect((spy.mock.calls[0][0] as { take?: number }).take).toBe(
      reportPackLimits.previewRows + 1,
    );
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('gives an aggregate pack the whole period inside a bounded budget', async () => {
    const harness = createReportsServiceHarness();
    for (let index = 0; index < 250; index += 1) {
      const id = `t-${index.toString().padStart(4, '0')}`;
      harness.memory.tickets.set(
        id,
        reportTicketSeed({ id, originUnitId: ticketsTestIds.ouIt, status: 'UNROUTED' }),
      );
    }
    const spy = jest.spyOn(harness.prisma.ticket, 'findMany');

    const preview = await harness.reports.previewPack(
      { ...scope, pack: reportPackKeys.monthlyKpi },
      ticketsTestIds.adminIt,
      null,
      now,
    );

    // 250 tickets is above the 200-row page but far below the aggregate budget,
    // so the KPI numbers stay exact instead of becoming a 201-row sample.
    expect(preview.truncatedInput).toBe(false);
    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0].createdCount).toBe(250);
    expect((spy.mock.calls[0][0] as { take?: number }).take).toBe(
      reportPackLimits.previewAggregateRows + 1,
    );
  });

  it('exports through the export budget and refuses a capped input before serializing', async () => {
    const harness = createReportsServiceHarness();
    seedArticles(harness, 3);
    const original = reportPackLimits.exportRows;
    (reportPackLimits as { exportRows: number }).exportRows = 2;
    try {
      const spy = jest.spyOn(harness.prisma.knowledgeArticle, 'findMany');
      const attempt = harness.reports.exportPack(
        { ...scope, pack: reportPackKeys.kbHelpfulness, format: 'json' },
        ticketsTestIds.adminIt,
        null,
        now,
      );
      await expect(attempt).rejects.toMatchObject({
        code: reportErrorCodes.tooLarge,
      });
      expect((spy.mock.calls[0][0] as { take?: number }).take).toBe(3);
      expect(await harness.prisma.auditLog.findMany()).toHaveLength(0);
    } finally {
      (reportPackLimits as { exportRows: number }).exportRows = original;
    }
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
