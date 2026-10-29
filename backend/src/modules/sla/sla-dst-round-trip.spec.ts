import { addBusinessMinutes } from './add-business-minutes';
import { countBusinessMinutes } from './count-business-minutes';
import type { BusinessMinutesCalendar } from './business-hours-civil-time';

const sundayNight = (timezone: string): BusinessMinutesCalendar => ({
  timezone,
  weeklyHours: {
    '1': [], '2': [], '3': [], '4': [], '5': [], '6': [],
    '7': [{ start: '01:00', end: '04:00' }],
  },
  holidays: [],
});

describe('business-minute DST invariants', () => {
  it.each([
    ['Europe/Sarajevo gap', 'Europe/Sarajevo', '2026-03-29T00:00:00.000Z'],
    ['Europe/Sarajevo fold', 'Europe/Sarajevo', '2026-10-24T23:00:00.000Z'],
    ['America/New_York gap', 'America/New_York', '2026-03-08T06:00:00.000Z'],
    ['America/New_York fold', 'America/New_York', '2026-11-01T05:00:00.000Z'],
    ['Australia/Lord_Howe gap', 'Australia/Lord_Howe', '2026-10-03T14:00:00.000Z'],
    ['Australia/Lord_Howe fold', 'Australia/Lord_Howe', '2026-04-04T14:00:00.000Z'],
  ])('keeps deadlines monotone and add/count round-trip stable: %s', (_label, timezone, startIso) => {
    const calendar = sundayNight(timezone);
    const start = new Date(startIso);
    for (const minutes of [1, 15, 30, 60, 90, 120]) {
      const due = addBusinessMinutes(calendar, start, minutes);
      expect(due.getTime()).toBeGreaterThanOrEqual(start.getTime());
      expect(countBusinessMinutes(calendar, start, due)).toBe(minutes);
    }
  });
});
