import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertValidIanaTimezone } from './assert-valid-iana-timezone';
import { requireBusinessHoursCalendar, toCalendarRecord } from './load-business-hours-calendar';
import { holidayDateToDate, parseCalendarHolidays } from './parse-calendar-holidays';
import { parseWeeklyHours } from './parse-weekly-hours';
import { changeLogActions, recordSlaChange } from './record-sla-change';
import { slaChangeLogEntityTypes, slaConstants } from './sla.constants';
import { SlaError } from './sla.error';
import { normalizeSlaName } from './normalize-sla-identity';
import { toCalendarSnapshot } from './to-sla-snapshots';
import type {
  BusinessHoursCalendarRecord,
  SlaMutationContext,
  UpdateCalendarInput,
} from './sla.types';

export async function updateBusinessHoursCalendar(
  prisma: PrismaService,
  calendarId: string,
  input: UpdateCalendarInput,
  context: SlaMutationContext,
): Promise<BusinessHoursCalendarRecord> {
  const current = await requireBusinessHoursCalendar(prisma, calendarId);
  const name =
    input.name === undefined
      ? current.name
      : normalizeSlaName(input.name, slaConstants.maximumNameLength);
  const timezone =
    input.timezone === undefined
      ? current.timezone
      : assertValidIanaTimezone(input.timezone);
  const weeklyHours =
    input.weeklyHours === undefined
      ? current.weeklyHours
      : parseWeeklyHours(input.weeklyHours);
  const holidays =
    input.holidays === undefined
      ? current.holidays
      : parseCalendarHolidays(input.holidays);
  const isActive = input.isActive ?? current.isActive;
  if (!isActive) {
    const activeProfileCount = await prisma.slaProfile.count({
      where: { calendarId, isActive: true },
    });
    if (activeProfileCount > 0) {
      throw new SlaError('CALENDAR_IN_USE');
    }
  }
  return prisma.$transaction(async (transaction) => {
    await transaction.calendarHoliday.deleteMany({ where: { calendarId } });
    const updated = await transaction.businessHoursCalendar.update({
      where: { id: calendarId },
      data: {
        name,
        timezone,
        weeklyHours: weeklyHours as Prisma.InputJsonValue,
        isActive,
        holidays: {
          create: holidays.map((holiday) => ({
            date: holidayDateToDate(holiday.date),
            name: holiday.name,
          })),
        },
      },
      include: { holidays: { orderBy: { date: 'asc' } } },
    });
    const record = toCalendarRecord(updated);
    await recordSlaChange(transaction as PrismaService, {
      action: changeLogActions.update,
      entityType: slaChangeLogEntityTypes.calendar,
      entityId: record.id,
      reason: input.reason,
      before: toCalendarSnapshot(current),
      after: toCalendarSnapshot(record),
      actorUserId: context.actorUserId,
    });
    return record;
  });
}
