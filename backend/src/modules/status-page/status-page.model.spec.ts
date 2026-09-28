import { isIncidentStatusTransitionAllowed, localizedIncidentTitle, uptimePercent, worstAvailability } from './status-page.model';

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n));

describe('status page model (Paket 2.7 §8)', () => {
  it('ranks DOWN > MAINTENANCE > DEGRADED > OPERATIONAL', () => {
    expect(worstAvailability([])).toBe('OPERATIONAL');
    expect(worstAvailability(['OPERATIONAL', 'DEGRADED', null, undefined])).toBe('DEGRADED');
    expect(worstAvailability(['DEGRADED', 'MAINTENANCE'])).toBe('MAINTENANCE');
    expect(worstAvailability(['MAINTENANCE', 'DOWN', 'DEGRADED'])).toBe('DOWN');
  });

  it('moves status forward only and keeps RESOLVED final', () => {
    expect(isIncidentStatusTransitionAllowed('INVESTIGATING', 'INVESTIGATING')).toBe(true);
    expect(isIncidentStatusTransitionAllowed('INVESTIGATING', 'RESOLVED')).toBe(true);
    expect(isIncidentStatusTransitionAllowed('MONITORING', 'IDENTIFIED')).toBe(false);
    expect(isIncidentStatusTransitionAllowed('RESOLVED', 'RESOLVED')).toBe(false);
    expect(isIncidentStatusTransitionAllowed('RESOLVED', 'INVESTIGATING')).toBe(false);
  });

  it('counts only DOWN time, merges overlaps and clips to the window', () => {
    const start = day(0);
    const end = day(10);
    expect(uptimePercent([], start, end)).toBe(100);
    expect(uptimePercent([{ impact: 'DEGRADED', startedAt: day(1), resolvedAt: day(5) }], start, end)).toBe(100);
    expect(uptimePercent([{ impact: 'DOWN', startedAt: day(1), resolvedAt: day(2) }], start, end)).toBe(90);
    expect(
      uptimePercent(
        [
          { impact: 'DOWN', startedAt: day(1), resolvedAt: day(3) },
          { impact: 'DOWN', startedAt: day(2), resolvedAt: day(4) },
        ],
        start,
        end,
      ),
    ).toBe(70);
    expect(uptimePercent([{ impact: 'DOWN', startedAt: day(-5), resolvedAt: day(1) }], start, end)).toBe(90);
    expect(uptimePercent([{ impact: 'DOWN', startedAt: day(9), resolvedAt: null }], start, end)).toBe(90);
  });

  it('floors to one decimal so a short outage never shows as 100 %', () => {
    const start = day(0);
    const end = day(90);
    const minute = 60_000;
    const value = uptimePercent([{ impact: 'DOWN', startedAt: day(1), resolvedAt: new Date(day(1).getTime() + 10 * minute) }], start, end);
    expect(value).toBe(99.9);
  });

  it('shows the English title only when it exists', () => {
    expect(localizedIncidentTitle({ title: 'Prekid', titleEn: 'Outage' }, 'en')).toBe('Outage');
    expect(localizedIncidentTitle({ title: 'Prekid', titleEn: '  ' }, 'en')).toBe('Prekid');
    expect(localizedIncidentTitle({ title: 'Prekid', titleEn: 'Outage' }, 'bs')).toBe('Prekid');
  });
});
