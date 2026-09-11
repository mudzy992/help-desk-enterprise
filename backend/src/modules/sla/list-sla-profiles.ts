import { PrismaService } from '../../common/prisma/prisma.service';
import type { SlaProfileRecord, SlaProfileResponse } from './sla.types';

export async function listSlaProfiles(
  prisma: PrismaService,
): Promise<readonly SlaProfileRecord[]> {
  return prisma.slaProfile.findMany({ orderBy: { name: 'asc' } });
}

export async function toSlaProfileResponses(
  prisma: PrismaService,
  profiles: readonly SlaProfileRecord[],
): Promise<readonly SlaProfileResponse[]> {
  if (profiles.length === 0) {
    return [];
  }
  const calendars = await prisma.businessHoursCalendar.findMany({
    where: { id: { in: [...new Set(profiles.map((profile) => profile.calendarId))] } },
    select: { id: true, name: true, timezone: true },
  });
  const calendarById = new Map(
    calendars.map((calendar) => [calendar.id, calendar]),
  );
  return profiles.map((profile) => {
    const calendar = calendarById.get(profile.calendarId);
    return {
      id: profile.id,
      key: profile.key,
      name: profile.name,
      description: profile.description,
      calendarId: profile.calendarId,
      calendarName: calendar?.name ?? profile.calendarId,
      calendarTimezone: calendar?.timezone ?? '',
      isActive: profile.isActive,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
  });
}
