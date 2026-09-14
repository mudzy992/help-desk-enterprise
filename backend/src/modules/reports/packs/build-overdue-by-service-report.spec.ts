import { buildOverdueByServiceReport } from './build-overdue-by-service-report';
import { reportTicketSeed } from '../report-ticket-seed';
import type { ReportPackBuildInput } from '../reports.types';

describe('buildOverdueByServiceReport', () => {
  it('groups overdue tickets by service and ignores on-time tickets', () => {
    const rows = buildOverdueByServiceReport(
      input([
        { ...reportTicketSeed({ id: 'a', originUnitId: 'ou-it', status: 'IN_PROGRESS', serviceId: 'vpn' }), isOverdue: true },
        { ...reportTicketSeed({ id: 'b', originUnitId: 'ou-it', status: 'IN_PROGRESS', serviceId: 'vpn' }), isOverdue: true },
        { ...reportTicketSeed({ id: 'c', originUnitId: 'ou-it', status: 'IN_PROGRESS', serviceId: 'access' }), isOverdue: true },
        { ...reportTicketSeed({ id: 'd', originUnitId: 'ou-it', status: 'IN_PROGRESS', serviceId: 'vpn' }), isOverdue: false },
      ]),
    );
    expect(rows).toEqual([
      { serviceId: 'vpn', overdueCount: 2 },
      { serviceId: 'access', overdueCount: 1 },
    ]);
  });
});

function input(
  tickets: ReportPackBuildInput['tickets'],
): ReportPackBuildInput {
  return {
    window: {
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-09-30T00:00:00.000Z'),
    },
    tickets,
    csatByTicketId: new Map(),
    closeCodesById: new Map(),
    articles: [],
    feedback: [],
  };
}
