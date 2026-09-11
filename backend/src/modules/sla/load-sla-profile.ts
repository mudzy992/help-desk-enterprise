import { PrismaService } from '../../common/prisma/prisma.service';
import { requireBusinessHoursCalendar } from './load-business-hours-calendar';
import { SlaError } from './sla.error';
import type { SlaProfileRecord } from './sla.types';

export async function requireSlaProfile(
  prisma: PrismaService,
  profileId: string,
): Promise<SlaProfileRecord> {
  const profile = await prisma.slaProfile.findUnique({
    where: { id: profileId },
  });
  if (profile === null) {
    throw new SlaError('PROFILE_NOT_FOUND');
  }
  return profile;
}

export async function assertCalendarCanBindProfile(
  prisma: PrismaService,
  calendarId: string,
  profileIsActive: boolean,
): Promise<void> {
  const calendar = await requireBusinessHoursCalendar(prisma, calendarId);
  if (profileIsActive && !calendar.isActive) {
    throw new SlaError('CALENDAR_INACTIVE');
  }
}
