import { buildChangeOutcomesReport, buildChangeScheduleReport, emptyChangeReportData } from './build-change-reports';

describe('change report packs', () => {
  it('counts outcomes per type with a total row', () => {
    const rows = buildChangeOutcomesReport({
      ...emptyChangeReportData,
      outcomes: [
        { type: 'NORMAL', outcome: 'SUCCESSFUL' },
        { type: 'NORMAL', outcome: 'FAILED' },
        { type: 'EMERGENCY', outcome: 'ROLLED_BACK' },
        { type: 'STANDARD', outcome: 'SUCCESSFUL' },
      ],
    });
    expect(rows.map((row) => row.changeType)).toEqual(['STANDARD', 'NORMAL', 'EMERGENCY', 'ALL']);
    expect(rows[1]).toMatchObject({ closed: 2, successful: 1, failed: 1, successRatePercent: 50, sharePercent: 50 });
    expect(rows[2]).toMatchObject({ rolledBack: 1, sharePercent: 25 });
    expect(rows[3]).toMatchObject({ closed: 4, successful: 2, successRatePercent: 50, sharePercent: 100 });
  });

  it('returns null rates when nothing was closed', () => {
    const rows = buildChangeOutcomesReport(emptyChangeReportData);
    expect(rows[3]).toMatchObject({ closed: 0, successRatePercent: null, sharePercent: null });
  });

  it('orders the schedule by planned start', () => {
    const base = { title: 'T', type: 'NORMAL', risk: 'LOW', status: 'SCHEDULED', outcome: null, cabGroupName: null, plannedEnd: new Date('2026-10-10T12:00:00Z') };
    const rows = buildChangeScheduleReport({
      ...emptyChangeReportData,
      schedule: [
        { ...base, number: 'CHG-000002', plannedStart: new Date('2026-10-09T08:00:00Z') },
        { ...base, number: 'CHG-000001', plannedStart: new Date('2026-10-02T08:00:00Z') },
      ],
    });
    expect(rows.map((row) => row.changeNumber)).toEqual(['CHG-000001', 'CHG-000002']);
    expect(rows[0]?.plannedStart).toBe('2026-10-02 08:00');
  });
});
