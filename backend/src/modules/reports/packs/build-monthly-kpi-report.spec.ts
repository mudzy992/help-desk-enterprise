import type { TicketRecord } from '../../tickets/tickets.types';
import { buildMonthlyKpiReport } from './build-monthly-kpi-report';
import type { ReportPackBuildInput } from '../reports.types';
import { reportTicketSeed } from '../report-ticket-seed';

const window = {
  from: new Date('2026-09-01T00:00:00.000Z'),
  to: new Date('2026-09-30T23:59:59.000Z'),
};

describe('buildMonthlyKpiReport', () => {
  it('counts created/resolved/closed in the window and averages timestamps', () => {
    const created = reportTicketSeed({
      id: 't-created',
      originUnitId: 'ou-it',
      status: 'IN_PROGRESS',
      createdAt: new Date('2026-09-10T10:00:00.000Z'),
      firstResponseAt: new Date('2026-09-10T10:30:00.000Z'),
    });
    const resolved = reportTicketSeed({
      id: 't-resolved',
      originUnitId: 'ou-it',
      status: 'RESOLVED',
      createdAt: new Date('2026-09-08T10:00:00.000Z'),
      resolvedAt: new Date('2026-09-08T12:00:00.000Z'),
    });
    const outside = reportTicketSeed({
      id: 't-old',
      originUnitId: 'ou-it',
      status: 'CLOSED',
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      closedAt: new Date('2026-08-02T00:00:00.000Z'),
    });
    const rows = buildMonthlyKpiReport(input([created, resolved, outside]));
    expect(rows[0]).toMatchObject({
      createdCount: 2,
      resolvedCount: 1,
      closedCount: 0,
      overdueCount: 0,
      averageFirstResponseMinutes: 30,
      averageResolutionMinutes: 120,
    });
  });
});

function input(tickets: readonly TicketRecord[]): ReportPackBuildInput {
  return {
    window,
    tickets: tickets.map((ticket) => ({ ...ticket, isOverdue: false })),
    csatByTicketId: new Map(),
    closeCodesById: new Map(),
    articles: [],
    feedback: [],
  };
}
