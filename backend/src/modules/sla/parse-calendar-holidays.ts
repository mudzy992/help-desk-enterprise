import { slaConstants } from './sla.constants';
import { SlaError } from './sla.error';
import type { CalendarHolidayInput } from './sla.types';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function parseCalendarHolidays(
  value: readonly CalendarHolidayInput[] | undefined,
): CalendarHolidayInput[] {
  if (value === undefined) {
    return [];
  }
  const seen = new Set<string>();
  return value.map((holiday) => {
    const date = parseHolidayDate(holiday.date);
    const name = holiday.name.trim().replace(/\s+/g, ' ');
    if (name.length === 0 || name.length > slaConstants.maximumHolidayNameLength) {
      throw new SlaError('INVALID_HOLIDAY');
    }
    if (seen.has(date)) {
      throw new SlaError('DUPLICATE_HOLIDAY');
    }
    seen.add(date);
    return { date, name };
  });
}

export function parseHolidayDate(value: string): string {
  const trimmed = value.trim();
  if (!datePattern.test(trimmed)) {
    throw new SlaError('INVALID_HOLIDAY');
  }
  const [year, month, day] = trimmed.split('-').map(Number);
  const utc = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== (month ?? 1) - 1 ||
    utc.getUTCDate() !== day
  ) {
    throw new SlaError('INVALID_HOLIDAY');
  }
  return trimmed;
}

export function holidayDateToDate(value: string): Date {
  return new Date(`${parseHolidayDate(value)}T00:00:00.000Z`);
}

export function dateToHolidayDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
