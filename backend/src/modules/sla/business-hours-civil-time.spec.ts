import { fromZonedCivilTime, getZonedCivilTime } from './business-hours-civil-time';

describe('DST-safe civil time conversion', () => {
  it.each([
    ['Europe/Sarajevo spring gap', 'Europe/Sarajevo', [2026, 3, 29, 2, 30], '2026-03-29T01:00:00.000Z', [2026, 3, 29, 3, 0]],
    ['America/New_York spring gap', 'America/New_York', [2026, 3, 8, 2, 30], '2026-03-08T07:00:00.000Z', [2026, 3, 8, 3, 0]],
    ['Australia/Lord_Howe half-hour gap', 'Australia/Lord_Howe', [2026, 10, 4, 2, 15], '2026-10-03T15:30:00.000Z', [2026, 10, 4, 2, 30]],
  ])('advances nonexistent time using the documented later policy: %s', (_label, timeZone, parts, expected, roundTrip) => {
    const [year, month, day, hour, minute] = parts as number[];
    const resolved = fromZonedCivilTime({ year: year!, month: month!, day: day!, hour: hour!, minute: minute! }, timeZone);
    expect(resolved.toISOString()).toBe(expected);
    expect(Object.values(getZonedCivilTime(resolved, timeZone))).toEqual(roundTrip);
  });

  it.each([
    ['Europe/Sarajevo fold', 'Europe/Sarajevo', [2026, 10, 25, 2, 30], '2026-10-25T00:30:00.000Z'],
    ['America/New_York fold', 'America/New_York', [2026, 11, 1, 1, 30], '2026-11-01T05:30:00.000Z'],
    ['Australia/Lord_Howe half-hour fold', 'Australia/Lord_Howe', [2026, 4, 5, 1, 45], '2026-04-04T14:45:00.000Z'],
  ])('chooses the earlier occurrence for ambiguous time: %s', (_label, timeZone, parts, expected) => {
    const [year, month, day, hour, minute] = parts as number[];
    const resolved = fromZonedCivilTime({ year: year!, month: month!, day: day!, hour: hour!, minute: minute! }, timeZone);
    expect(resolved.toISOString()).toBe(expected);
    expect(getZonedCivilTime(resolved, timeZone)).toEqual({ year, month, day, hour, minute });
  });
});
