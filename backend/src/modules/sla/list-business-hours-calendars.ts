import { PrismaService } from '../../common/prisma/prisma.service';
import { toCalendarRecord } from './load-business-hours-calendar';
import type { BusinessHoursCalendarRecord } from './sla.types';

export async function listBusinessHoursCalendars(
  prisma: PrismaService,
): Promise<readonly BusinessHoursCalendarRecord[]> {
  const calendars = await prisma.businessHoursCalendar.findMany({
    include: { holidays: { orderBy: { date: 'asc' } } },
    orderBy: { name: 'asc' },
  });
  return calendars.map(toCalendarRecord);
}
