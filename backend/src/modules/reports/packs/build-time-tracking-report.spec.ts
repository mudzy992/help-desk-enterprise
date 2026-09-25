import { buildTimeTrackingReport, timeTrackingRowTypes } from './build-time-tracking-report';
import type { TimeTrackingReportEntry } from '../reports.types';

const entry = (overrides: Partial<TimeTrackingReportEntry>): TimeTrackingReportEntry => ({
  ticketId: 't1',
  userId: 'u-ana',
  userName: 'Ana',
  serviceId: 's-vpn',
  serviceName: 'VPN',
  durationSeconds: 3600,
  isManual: false,
  stopReason: 'MANUAL',
  isCorrected: false,
  ...overrides,
});

describe('buildTimeTrackingReport (package 1.3, T9)', () => {
  it('returns nothing without entries', () => {
    expect(buildTimeTrackingReport({ timeEntries: [] })).toEqual([]);
  });

  it('sums agent × service rows, agent subtotals and a grand total', () => {
    const rows = buildTimeTrackingReport({
      timeEntries: [
        entry({}),
        entry({ ticketId: 't2', durationSeconds: 1800, isManual: true, isCorrected: true }),
        entry({ serviceId: 's-mail', serviceName: 'E-mail', stopReason: 'AUTO_IDLE' }),
        entry({ userId: 'u-emir', userName: 'Emir', stopReason: 'AUTO_MAX_DURATION' }),
      ],
    });
    expect(rows.map((row) => [row.rowType, row.agent, row.service])).toEqual([
      [timeTrackingRowTypes.detail, 'Ana', 'E-mail'],
      [timeTrackingRowTypes.detail, 'Ana', 'VPN'],
      [timeTrackingRowTypes.agentTotal, 'Ana', null],
      [timeTrackingRowTypes.detail, 'Emir', 'VPN'],
      [timeTrackingRowTypes.agentTotal, 'Emir', null],
      [timeTrackingRowTypes.grandTotal, null, null],
    ]);
    expect(rows[1]).toMatchObject({
      entries: 2,
      totalHours: 1.5,
      tickets: 2,
      averageHoursPerTicket: 0.75,
      manualShare: 50,
      corrections: 1,
    });
    expect(rows[2]).toMatchObject({ entries: 3, totalHours: 2.5, autoIdleShare: 33.3 });
    expect(rows[5]).toMatchObject({ entries: 4, totalHours: 3.5, autoMaxDurationShare: 25 });
  });
});
