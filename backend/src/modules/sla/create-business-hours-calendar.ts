import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertValidIanaTimezone } from './assert-valid-iana-timezone';
import { isPrismaUniqueConstraintError } from './is-prisma-unique-constraint-error';
import { toCalendarRecord } from './load-business-hours-calendar';
import { holidayDateToDate, parseCalendarHolidays } from './parse-calendar-holidays';
import { parseWeeklyHours } from './parse-weekly-hours';
import {
  changeLogActions,
  recordSlaChange,
} from './record-sla-change';
import { slaChangeLogEntityTypes, slaConstants } from './sla.constants';
import { SlaError } from './sla.error';
import {
  normalizeSlaKey,
  normalizeSlaName,
} from './normalize-sla-identity';
import { toCalendarSnapshot } from './to-sla-snapshots';
import type {
  BusinessHoursCalendarRecord,
  CalendarWriteInput,
  SlaMutationContext,
} from './sla.types';

export async function createBusinessHoursCalendar(
  prisma: PrismaService,
  input: CalendarWriteInput,
  context: SlaMutationContext,
): Promise<BusinessHoursCalendarRecord> {
  const key = normalizeSlaKey(input.key);
  const name = normalizeSlaName(input.name, slaConstants.maximumNameLength);
  const timezone = assertValidIanaTimezone(input.timezone);
  const weeklyHours = parseWeeklyHours(input.weeklyHours);
  const holidays = parseCalendarHolidays(input.holidays);
  const isActive = input.isActive ?? true;
  try {
    return await prisma.$transaction(async (transaction) => {
      const created = await transaction.businessHoursCalendar.create({
        data: {
          key,
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
      const record = toCalendarRecord(created);
      await recordSlaChange(transaction as PrismaService, {
        action: changeLogActions.create,
        entityType: slaChangeLogEntityTypes.calendar,
        entityId: record.id,
        reason: input.reason,
        before: {},
        after: toCalendarSnapshot(record),
        actorUserId: context.actorUserId,
      });
      return record;
    });
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      throw new SlaError('DUPLICATE_KEY');
    }
    throw error;
  }
}
