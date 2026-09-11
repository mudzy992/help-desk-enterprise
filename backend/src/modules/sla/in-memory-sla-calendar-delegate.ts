import { dateToHolidayDate } from './parse-calendar-holidays';
import type { CalendarCreateData } from './in-memory-sla-store';
import { throwDuplicateSlaKey } from './in-memory-sla-store';
import type {
  BusinessHoursCalendarRecord,
  CalendarHolidayRecord,
} from './sla.types';

export function createInMemoryCalendarDelegate(
  calendars: Map<string, BusinessHoursCalendarRecord>,
  nextId: (prefix: string) => string,
  now: () => Date,
) {
  return {
    findUnique: async ({ where }: { where: { id: string } }) =>
      calendars.get(where.id) ?? null,
    findMany: async () =>
      [...calendars.values()].sort((left, right) =>
        left.name.localeCompare(right.name),
      ),
    create: async ({ data }: { data: CalendarCreateData }) => {
      for (const existing of calendars.values()) {
        if (existing.key === data.key) {
          throwDuplicateSlaKey();
        }
      }
      const created: BusinessHoursCalendarRecord = {
        id: nextId('cal'),
        key: data.key,
        name: data.name,
        timezone: data.timezone,
        weeklyHours: data.weeklyHours,
        isActive: data.isActive,
        holidays: toHolidayRecords(data.holidays?.create ?? [], nextId),
        createdAt: now(),
        updatedAt: now(),
      };
      calendars.set(created.id, created);
      return created;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: CalendarCreateData;
    }) => {
      const current = calendars.get(where.id);
      if (current === undefined) {
        return null;
      }
      const updated: BusinessHoursCalendarRecord = {
        ...current,
        name: data.name,
        timezone: data.timezone,
        weeklyHours: data.weeklyHours,
        isActive: data.isActive,
        holidays: toHolidayRecords(data.holidays?.create ?? [], nextId),
        updatedAt: now(),
      };
      calendars.set(where.id, updated);
      return updated;
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const current = calendars.get(where.id);
      calendars.delete(where.id);
      return current ?? null;
    },
  };
}

function toHolidayRecords(
  holidays: readonly { date: Date; name: string }[],
  nextId: (prefix: string) => string,
): CalendarHolidayRecord[] {
  return holidays.map((holiday) => ({
    id: nextId('hol'),
    date: dateToHolidayDate(holiday.date),
    name: holiday.name,
  }));
}
