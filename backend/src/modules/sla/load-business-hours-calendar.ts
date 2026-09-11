import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SlaError } from './sla.error';
import { mapPersistedHolidays } from './to-sla-snapshots';
import type { BusinessHoursCalendarRecord, WeeklyHours } from './sla.types';

const calendarInclude = {
  holidays: { orderBy: { date: 'asc' as const } },
};

export async function loadBusinessHoursCalendar(
  prisma: PrismaService,
  calendarId: string,
): Promise<BusinessHoursCalendarRecord | null> {
  const calendar = await prisma.businessHoursCalendar.findUnique({
    where: { id: calendarId },
    include: calendarInclude,
  });
  return calendar === null ? null : toCalendarRecord(calendar);
}

export async function requireBusinessHoursCalendar(
  prisma: PrismaService,
  calendarId: string,
): Promise<BusinessHoursCalendarRecord> {
  const calendar = await loadBusinessHoursCalendar(prisma, calendarId);
  if (calendar === null) {
    throw new SlaError('CALENDAR_NOT_FOUND');
  }
  return calendar;
}

export function toCalendarRecord(calendar: {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly timezone: string;
  readonly weeklyHours: Prisma.JsonValue;
  readonly isActive: boolean;
  readonly holidays: readonly { id: string; date: Date | string; name: string }[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}): BusinessHoursCalendarRecord {
  return {
    id: calendar.id,
    key: calendar.key,
    name: calendar.name,
    timezone: calendar.timezone,
    weeklyHours: calendar.weeklyHours as WeeklyHours,
    isActive: calendar.isActive,
    holidays: mapPersistedHolidays(calendar.holidays),
    createdAt: calendar.createdAt,
    updatedAt: calendar.updatedAt,
  };
}
