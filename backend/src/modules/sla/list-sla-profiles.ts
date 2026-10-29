import { PrismaService } from '../../common/prisma/prisma.service';
import type { SlaProfileRecord, SlaProfileResponse } from './sla.types';
import { slaProfileScopeWhere, type SlaReadScope } from './sla-read-scope';

export async function listSlaProfiles(
  prisma: PrismaService,
  input?: { readonly scope?: SlaReadScope; readonly cursor?: string; readonly take?: number },
): Promise<{ readonly items: readonly SlaProfileRecord[]; readonly total: number; readonly hasMore: boolean; readonly nextCursor: string | null }> {
  const where = input?.scope === undefined ? undefined : slaProfileScopeWhere(input.scope);
  const take = input?.take ?? 50;
  const [total, rows] = await Promise.all([
    prisma.slaProfile.count({ where }),
    prisma.slaProfile.findMany({
      where,
      orderBy: { id: 'asc' },
      take: take + 1,
      ...(input?.cursor === undefined ? {} : { cursor: { id: input.cursor }, skip: 1 }),
    }),
  ]);
  const items = rows.slice(0, take);
  const hasMore = rows.length > take;
  return { items, total, hasMore, nextCursor: hasMore ? items.at(-1)?.id ?? null : null };
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
