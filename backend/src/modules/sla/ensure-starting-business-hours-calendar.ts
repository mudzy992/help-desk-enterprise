import { PrismaService } from '../../common/prisma/prisma.service';
import { createBusinessHoursCalendar } from './create-business-hours-calendar';
import { loadBusinessHoursCalendarByKey } from './load-business-hours-calendar';
import { SlaError } from './sla.error';
import {
  startingSlaCalendarKey,
  startingSlaCalendarSeed,
  startingSlaSeedContext,
  startingSlaSeedReason,
} from './starting-sla.constants';
import type { BusinessHoursCalendarRecord } from './sla.types';

export type StartingSlaCalendarEnsureResult = {
  readonly calendar: BusinessHoursCalendarRecord;
  readonly created: boolean;
};

export async function ensureStartingBusinessHoursCalendar(
  prisma: PrismaService,
): Promise<StartingSlaCalendarEnsureResult> {
  const existing = await loadBusinessHoursCalendarByKey(
    prisma,
    startingSlaCalendarKey,
  );
  if (existing !== null) {
    return { calendar: existing, created: false };
  }
  try {
    const calendar = await createBusinessHoursCalendar(
      prisma,
      {
        ...startingSlaCalendarSeed,
        weeklyHours: { ...startingSlaCalendarSeed.weeklyHours },
        holidays: [],
        isActive: true,
        reason: startingSlaSeedReason,
      },
      startingSlaSeedContext,
    );
    return { calendar, created: true };
  } catch (error) {
    if (!(error instanceof SlaError) || error.code !== 'DUPLICATE_KEY') {
      throw error;
    }
    return {
      calendar: await requireBusinessHoursCalendarByKey(prisma),
      created: false,
    };
  }
}

async function requireBusinessHoursCalendarByKey(
  prisma: PrismaService,
): Promise<BusinessHoursCalendarRecord> {
  const calendar = await loadBusinessHoursCalendarByKey(
    prisma,
    startingSlaCalendarKey,
  );
  if (calendar === null) {
    throw new SlaError('CALENDAR_NOT_FOUND');
  }
  return calendar;
}
