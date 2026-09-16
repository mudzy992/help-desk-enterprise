import { reportTicketSeed } from '../report-ticket-seed';
import { ticketsTestIds } from '../../tickets/tickets-test-ids';
import { createReportsServiceHarness } from '../create-reports-service-harness';

jest.mock('../../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('ReportsService.dashboard', () => {
  const now = new Date('2026-09-14T12:00:00.000Z');

  it('returns KPI parity for scoped tickets in the report window', async () => {
    const harness = createReportsServiceHarness();
    harness.memory.tickets.set(
      't-resolved',
      reportTicketSeed({
        id: 't-resolved',
        originUnitId: ticketsTestIds.ouIt,
        status: 'RESOLVED',
        createdAt: new Date('2026-09-10T08:00:00.000Z'),
        resolvedAt: new Date('2026-09-10T14:00:00.000Z'),
        firstResponseAt: new Date('2026-09-10T08:30:00.000Z'),
        assignedGroupId: ticketsTestIds.groupIt,
      }),
    );
    harness.memory.tickets.set(
      't-open',
      reportTicketSeed({
        id: 't-open',
        originUnitId: ticketsTestIds.ouIt,
        status: 'IN_PROGRESS',
        createdAt: new Date('2026-09-12T08:00:00.000Z'),
        firstResponseAt: new Date('2026-09-12T08:30:00.000Z'),
      }),
    );
    harness.memory.tickets.set(
      't-sibling',
      reportTicketSeed({
        id: 't-sibling',
        originUnitId: ticketsTestIds.ouHr,
        status: 'PENDING',
        createdAt: new Date('2026-09-12T08:00:00.000Z'),
      }),
    );
    const dashboard = await harness.reports.dashboard(
      {
        organizationalUnitId: ticketsTestIds.ouIt,
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-15T23:59:59.999Z',
      },
      now,
    );
    expect(dashboard.ticketCount).toBe(2);
    expect(dashboard.kpis.createdCount).toBe(2);
    expect(dashboard.kpis.firstResponseMinutes).toBe(30);
    expect(dashboard.kpis.resolutionHours).toBe(6);
    expect(dashboard.kpis.resolutionSampleCount).toBe(1);
    expect(dashboard.bottleneckByGroup[0]?.value).toBe(6);
    expect(dashboard.serviceVolume[0]?.value).toBe(2);
    expect(dashboard.aging.lessThanOneDay + dashboard.aging.oneToThreeDays).toBe(
      1,
    );
  });
});
