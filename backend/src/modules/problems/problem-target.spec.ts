import { standardWeeklyHours } from '../sla/sla.constants';
import { addProblemWorkingDays, isTargetOverdue, previousWorkingDayKey } from './problem-target';

const calendar = { timezone: 'Europe/Sarajevo', weeklyHours: standardWeeklyHours, holidays: [{ date: '2026-10-08' }] };

describe('addProblemWorkingDays', () => {
  it('counts the start day when work can still start (Mon 08:00 + 1 = Mon 16:00)', () => {
    expect(addProblemWorkingDays(calendar, new Date('2026-10-05T06:00:00Z'), 1)?.toISOString()).toBe('2026-10-05T14:00:00.000Z');
  });
  it('starts the next working day after hours', () => {
    expect(addProblemWorkingDays(calendar, new Date('2026-10-05T15:00:00Z'), 1)?.toISOString()).toBe('2026-10-06T14:00:00.000Z');
  });
  it('skips weekends and holidays', () => {
    // Saturday start, 3 days: Mon 5, Tue 6, Wed 7.
    expect(addProblemWorkingDays(calendar, new Date('2026-10-03T08:00:00Z'), 3)?.toISOString()).toBe('2026-10-07T14:00:00.000Z');
    // Wed 7 after hours, 1 day: Thu 8 is a holiday -> Fri 9.
    expect(addProblemWorkingDays(calendar, new Date('2026-10-07T16:00:00Z'), 1)?.toISOString()).toBe('2026-10-09T14:00:00.000Z');
  });
  it('rejects non-positive day counts', () => {
    expect(addProblemWorkingDays(calendar, new Date(), 0)).toBeNull();
  });
});

describe('previousWorkingDayKey', () => {
  it('skips the holiday and the weekend', () => {
    expect(previousWorkingDayKey(calendar, { year: 2026, month: 10, day: 9 })).toBe('2026-10-07');
    expect(previousWorkingDayKey(calendar, { year: 2026, month: 10, day: 12 })).toBe('2026-10-09');
  });
});

describe('isTargetOverdue', () => {
  const now = new Date('2026-10-10T00:00:00Z');
  const past = new Date('2026-10-09T00:00:00Z');
  it('only while the target runs', () => {
    expect(isTargetOverdue({ status: 'INVESTIGATING', targetAt: past }, now)).toBe(true);
    expect(isTargetOverdue({ status: 'KNOWN_ERROR', targetAt: past }, now)).toBe(false);
    expect(isTargetOverdue({ status: 'NEW', targetAt: null }, now)).toBe(false);
  });
});
