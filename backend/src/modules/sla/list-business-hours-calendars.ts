import { PrismaService } from '../../common/prisma/prisma.service';
import { toCalendarRecord } from './load-business-hours-calendar';
import type { BusinessHoursCalendarRecord } from './sla.types';
import { slaProfileScopeWhere, type SlaReadScope } from './sla-read-scope';

export async function listBusinessHoursCalendars(
  prisma: PrismaService,
  input?: { readonly scope?: SlaReadScope; readonly cursor?: string; readonly take?: number },
): Promise<{ readonly items: readonly BusinessHoursCalendarRecord[]; readonly total: number; readonly hasMore: boolean; readonly nextCursor: string | null }> {
  const profileWhere = input?.scope === undefined ? undefined : slaProfileScopeWhere(input.scope);
  const where = profileWhere === undefined ? undefined : { slaProfiles: { some: profileWhere } };
  const take = input?.take ?? 50;
  const [total, rows] = await Promise.all([
    prisma.businessHoursCalendar.count({ where }),
    prisma.businessHoursCalendar.findMany({
      where,
      include: { holidays: { orderBy: { date: 'asc' } } },
      orderBy: { id: 'asc' },
      take: take + 1,
      ...(input?.cursor === undefined ? {} : { cursor: { id: input.cursor }, skip: 1 }),
    }),
  ]);
  const items = rows.slice(0, take).map(toCalendarRecord);
  const hasMore = rows.length > take;
  return { items, total, hasMore, nextCursor: hasMore ? items.at(-1)?.id ?? null : null };
}
