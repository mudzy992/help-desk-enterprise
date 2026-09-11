import { parseWeeklyHours } from './parse-weekly-hours';
import { SlaError } from './sla.error';

describe('parseWeeklyHours', () => {
  it('accepts weekday intervals and rejects inverted or overlapping ranges', () => {
    expect(
      parseWeeklyHours({
        '1': [{ start: '08:00', end: '12:00' }, { start: '13:00', end: '16:00' }],
      }),
    ).toEqual({
      '1': [{ start: '08:00', end: '12:00' }, { start: '13:00', end: '16:00' }],
    });
    expect(() =>
      parseWeeklyHours({ '1': [{ start: '16:00', end: '08:00' }] }),
    ).toThrow(SlaError);
    expect(() =>
      parseWeeklyHours({
        '1': [{ start: '08:00', end: '12:00' }, { start: '11:00', end: '16:00' }],
      }),
    ).toThrow(new SlaError('OVERLAPPING_INTERVALS'));
    expect(() => parseWeeklyHours({})).toThrow(
      new SlaError('CALENDAR_HAS_NO_BUSINESS_HOURS'),
    );
  });
});
