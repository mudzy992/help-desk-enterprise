import { toMinutes } from './parse-weekly-hours';
import { isoWeekdayKeys } from './sla.constants';
import { SlaError } from './sla.error';
import type { StartingSlaDuration } from './starting-sla.constants';
import type { WeeklyHours } from './sla.types';

const minutesPerHour = 60;

export function businessMinutesPerStandardDay(weeklyHours: WeeklyHours): number {
  for (const weekday of isoWeekdayKeys) {
    const dayMinutes = (weeklyHours[weekday] ?? []).reduce(
      (sum, interval) =>
        sum + (toMinutes(interval.end) - toMinutes(interval.start)),
      0,
    );
    if (dayMinutes > 0) {
      return dayMinutes;
    }
  }
  throw new SlaError('CALENDAR_HAS_NO_BUSINESS_HOURS');
}

export function toStartingSlaMinutes(
  duration: StartingSlaDuration,
  minutesPerBusinessDay: number,
): number {
  if (duration.unit === 'minutes') {
    return duration.value;
  }
  if (duration.unit === 'hours') {
    return duration.value * minutesPerHour;
  }
  return duration.value * minutesPerBusinessDay;
}
