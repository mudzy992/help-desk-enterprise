import type { JsonValue } from '../change-log/change-log.types';
import { dateToHolidayDate } from './parse-calendar-holidays';
import type {
  BusinessHoursCalendarRecord,
  SlaProfileRecord,
  SlaRuleRecord,
} from './sla.types';

export function toCalendarSnapshot(
  calendar: BusinessHoursCalendarRecord,
): JsonValue {
  return {
    id: calendar.id,
    key: calendar.key,
    name: calendar.name,
    timezone: calendar.timezone,
    isActive: calendar.isActive,
    weeklyHours: calendar.weeklyHours as JsonValue,
    holidays: calendar.holidays.map((holiday) => ({
      date: holiday.date,
      name: holiday.name,
    })),
  };
}

export function toProfileSnapshot(profile: SlaProfileRecord): JsonValue {
  return {
    id: profile.id,
    key: profile.key,
    name: profile.name,
    description: profile.description,
    calendarId: profile.calendarId,
    isActive: profile.isActive,
  };
}

export function toRuleSnapshot(rule: SlaRuleRecord): JsonValue {
  return {
    id: rule.id,
    slaProfileId: rule.slaProfileId,
    priority: rule.priority,
    responseMinutes: rule.responseMinutes,
    resolutionMinutes: rule.resolutionMinutes,
    evaluationOrder: rule.evaluationOrder,
    organizationalUnitId: rule.organizationalUnitId,
    serviceId: rule.serviceId,
  };
}

export function mapPersistedHolidays(
  holidays: readonly { id: string; date: Date | string; name: string }[],
): BusinessHoursCalendarRecord['holidays'] {
  return holidays.map((holiday) => ({
    id: holiday.id,
    date:
      typeof holiday.date === 'string'
        ? holiday.date.slice(0, 10)
        : dateToHolidayDate(holiday.date),
    name: holiday.name,
  }));
}
