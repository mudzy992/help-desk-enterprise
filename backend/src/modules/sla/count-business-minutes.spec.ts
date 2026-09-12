import { addBusinessMinutes } from './add-business-minutes';
import { countBusinessMinutes } from './count-business-minutes';
import { standardWeeklyHours } from './sla.constants';

const calendar = {
  timezone: 'Europe/Sarajevo',
  weeklyHours: standardWeeklyHours,
  holidays: [{ date: '2026-01-01' }],
};

describe('countBusinessMinutes', () => {
  it('matches addBusinessMinutes for an in-day target', () => {
    const start = new Date('2026-09-07T06:00:00.000Z');
    const due = addBusinessMinutes(calendar, start, 60);
    expect(countBusinessMinutes(calendar, start, due)).toBe(60);
  });

  it('skips weekends when counting elapsed time', () => {
    const start = new Date('2026-09-11T13:00:00.000Z');
    const due = addBusinessMinutes(calendar, start, 120);
    expect(countBusinessMinutes(calendar, start, due)).toBe(120);
  });

  it('returns zero when the window is empty or inverted', () => {
    const start = new Date('2026-09-07T06:00:00.000Z');
    expect(countBusinessMinutes(calendar, start, start)).toBe(0);
    expect(
      countBusinessMinutes(calendar, start, new Date('2026-09-07T05:00:00.000Z')),
    ).toBe(0);
  });
});
