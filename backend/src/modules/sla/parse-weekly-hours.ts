import { isoWeekdayKeys, slaConstants, type IsoWeekdayKey } from './sla.constants';
import { SlaError } from './sla.error';
import type { BusinessHoursInterval, WeeklyHours } from './sla.types';

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
const endOfDay = '24:00';

export function parseWeeklyHours(value: unknown): WeeklyHours {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new SlaError('INVALID_WEEKLY_HOURS');
  }
  const record = value as Record<string, unknown>;
  const parsed: { [weekday in IsoWeekdayKey]?: BusinessHoursInterval[] } = {};
  let workingIntervalCount = 0;
  for (const key of Object.keys(record)) {
    if (!isoWeekdayKeys.includes(key as IsoWeekdayKey)) {
      throw new SlaError('INVALID_WEEKLY_HOURS');
    }
    const intervals = parseDayIntervals(record[key]);
    workingIntervalCount += intervals.length;
    parsed[key as IsoWeekdayKey] = intervals;
  }
  if (workingIntervalCount === 0) {
    throw new SlaError('CALENDAR_HAS_NO_BUSINESS_HOURS');
  }
  return parsed;
}

function parseDayIntervals(value: unknown): BusinessHoursInterval[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new SlaError('INVALID_WEEKLY_HOURS');
  }
  if (value.length > slaConstants.maximumWeeklyIntervalsPerDay) {
    throw new SlaError('INVALID_WEEKLY_HOURS');
  }
  const intervals = value.map(parseInterval).sort((left, right) =>
    left.start.localeCompare(right.start),
  );
  for (let index = 0; index < intervals.length; index += 1) {
    const current = intervals[index];
    if (!current || toMinutes(current.start) >= toMinutes(current.end)) {
      throw new SlaError('OVERLAPPING_INTERVALS');
    }
    const previous = intervals[index - 1];
    if (previous && toMinutes(current.start) < toMinutes(previous.end)) {
      throw new SlaError('OVERLAPPING_INTERVALS');
    }
  }
  return intervals;
}

function parseInterval(value: unknown): BusinessHoursInterval {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new SlaError('INVALID_WEEKLY_HOURS');
  }
  const record = value as { start?: unknown; end?: unknown };
  if (typeof record.start !== 'string' || typeof record.end !== 'string') {
    throw new SlaError('INVALID_WEEKLY_HOURS');
  }
  return {
    start: normalizeClock(record.start, false),
    end: normalizeClock(record.end, true),
  };
}

function normalizeClock(value: string, allowEndOfDay: boolean): string {
  const trimmed = value.trim();
  if (allowEndOfDay && trimmed === endOfDay) {
    return endOfDay;
  }
  if (!timePattern.test(trimmed)) {
    throw new SlaError('INVALID_WEEKLY_HOURS');
  }
  return trimmed;
}

export function toMinutes(clock: string): number {
  if (clock === endOfDay) {
    return 24 * 60;
  }
  const [hours, minutes] = clock.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}
