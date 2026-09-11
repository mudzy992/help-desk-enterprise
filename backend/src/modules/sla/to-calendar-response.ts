import type { BusinessHoursCalendarRecord, BusinessHoursCalendarResponse } from './sla.types';

export function toCalendarResponse(
  calendar: BusinessHoursCalendarRecord,
): BusinessHoursCalendarResponse {
  return {
    id: calendar.id,
    key: calendar.key,
    name: calendar.name,
    timezone: calendar.timezone,
    weeklyHours: calendar.weeklyHours,
    isActive: calendar.isActive,
    holidays: calendar.holidays,
    createdAt: calendar.createdAt.toISOString(),
    updatedAt: calendar.updatedAt.toISOString(),
  };
}
