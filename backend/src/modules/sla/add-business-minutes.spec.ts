import { addBusinessMinutes } from './add-business-minutes';
import { standardWeeklyHours } from './sla.constants';

const calendar = {
  timezone: 'Europe/Sarajevo',
  weeklyHours: standardWeeklyHours,
  holidays: [{ date: '2026-01-01' }],
};

describe('addBusinessMinutes', () => {
  it('advances inside the same working day', () => {
    const due = addBusinessMinutes(
      calendar,
      new Date('2026-09-07T06:00:00.000Z'),
      60,
    );
    expect(due.toISOString()).toBe('2026-09-07T07:00:00.000Z');
  });

  it('skips weekends and resumes on the next working morning', () => {
    const due = addBusinessMinutes(
      calendar,
      new Date('2026-09-11T13:00:00.000Z'),
      120,
    );
    expect(due.toISOString()).toBe('2026-09-14T07:00:00.000Z');
  });

  it('skips holidays in the calendar timezone', () => {
    const due = addBusinessMinutes(
      calendar,
      new Date('2025-12-31T15:00:00.000Z'),
      60,
    );
    expect(due.toISOString()).toBe('2026-01-02T08:00:00.000Z');
  });
});
